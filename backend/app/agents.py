"""Three Browser Use agents for dispersed camping research in a given area.

Tasks run **sequentially** on a **single v3 cloud session** (reuse ``session_id`` between
runs) so the dashboard shows one browser session for the whole research pass—not three
separate sessions that can linger and stack as “active” (especially after timeouts).

Auth: ``BROWSER_USE_API_KEY`` (``bu_...``). See: https://docs.browser-use.com/cloud/llms.txt
"""

from __future__ import annotations

import asyncio
import os
import re
from dataclasses import dataclass
from pathlib import Path

from app.env_loader import load_env
from browser_use_sdk.v3 import AsyncBrowserUse

load_env()

_BACKEND_ROOT = Path(__file__).resolve().parent.parent

# topo_map: terrain / map-only spot finding; land_rules: agency rules; community_intel: trip reports & forums
AGENT_IDS: tuple[str, ...] = ("topo_map", "land_rules", "community_intel")

# Wall-clock cap for each agent (live sessions + asyncio.wait_for around client.run).
_AGENT_MAX_SECONDS = float(os.getenv("BROWSER_USE_AGENT_MAX_SECONDS", "60"))
_RUN_TIMEOUT_S = float(os.getenv("BROWSER_USE_RUN_TIMEOUT", str(_AGENT_MAX_SECONDS)))
_AGENT_STAGGER_S = float(os.getenv("BROWSER_USE_AGENT_STAGGER_S", "0.35"))
_HTTP_TIMEOUT_S = float(os.getenv("BROWSER_USE_HTTP_TIMEOUT", "360"))


def session_timeout_minutes_for_api() -> int:
    """Browser Use v3 ``POST /sessions`` uses ``timeout`` in whole minutes (minimum 1)."""
    return max(1, int((_AGENT_MAX_SECONDS + 59) // 60))

_FEATURE_LABELS: dict[str, str] = {
    "near_water": "near water (rivers, lakes, streams)",
    "accessibility": "accessibility-friendly / ADA considerations where relevant",
    "pet_friendly": "pet friendly",
    "rv_access": "RV-suitable access (size, turnarounds, road width)",
    "hiking_trails": "proximity to hiking trails",
    "fishing_spots": "fishing opportunities nearby",
    "campfires": "campfires / fire rules especially relevant",
}


def build_camper_briefing(location: str, radius_miles: int, features: list[str]) -> str:
    """Single block describing the same user intent as the CampingApp preferences form."""
    loc = location.strip()
    lines = [
        f'Location anchor: "{loc}".',
        f"Search scope: within roughly {radius_miles} miles of that anchor (as the user specified).",
    ]
    if features:
        labels = [_FEATURE_LABELS.get(f, f.replace("_", " ")) for f in features]
        lines.append("User priorities: " + "; ".join(labels) + ".")
        lines.append(
            "Bias candidates and advice toward these priorities where they do not conflict with safety or legality."
        )
    else:
        lines.append("No specific amenity toggles; focus on solid dispersed-camping options for this area.")
    return "\n".join(lines)


def _location_anchor(briefing: str) -> str:
    m = re.search(r'Location anchor:\s*"([^"]*)"', briefing)
    return (m.group(1).strip() if m else "") or ""


def _feature_summary(briefing: str) -> str:
    """Extract the user priorities line for short context blocks."""
    m = re.search(r"User priorities:\s*(.+)", briefing)
    return m.group(1).strip() if m else ""


def build_task(agent_id: str, briefing: str) -> str:
    loc = _location_anchor(briefing)
    loc_q = loc if loc else "the user's search area"
    priorities = _feature_summary(briefing)
    pri_str = f" Prioritize: {priorities}." if priorities else ""

    tasks = {
        "topo_map": (
            f'Open https://caltopo.com and search for "{loc_q}". Enable the terrain or topo layer immediately. '
            f"Find 2 dispersed camping candidates within the search area using the map — look for flat benches, "
            f"spurs off forest roads, and gentle ridges set back from drainages.{pri_str} "
            f"For each candidate return: NAME/LABEL, WHY THE TERRAIN SUGGESTS IT, VISIBLE HAZARDS, COORDS if shown. "
            f"Stop after the 2 candidates are listed. Open at most 2 tabs."
        ),
        "land_rules": (
            f'Search the web for "dispersed camping {loc_q} USFS BLM rules site:fs.usda.gov OR site:blm.gov". '
            f"Open the most official result (USFS, BLM, NPS, or state agency).{pri_str} "
            f"Report plainly: LAND MANAGER, DISPERSED CAMPING ALLOWED (yes/no/limited), STAY LIMIT (days), "
            f"ROAD/SITE SETBACKS, PERMITS OR PASSES REQUIRED, FIRE RESTRICTIONS, CURRENT CLOSURES. "
            f"If jurisdiction is unclear say so. Stop after the official policy summary."
        ),
        "community_intel": (
            f'Search Reddit for "dispersed camping {loc_q}" and open 1 relevant thread. '
            f"If Reddit has nothing useful, try Campendium or iOverlander for the same area.{pri_str} "
            f"Report short bullets: ROAD ACCESS (2WD/4WD, condition), CROWDING, SEASONAL TIPS, WARNINGS. "
            f"Stop after actionable notes are listed. Open at most 2 tabs."
        ),
    }
    return tasks.get(
        agent_id,
        f'Research dispersed camping near "{loc_q}". {briefing[:300]} Return a concise plain-text summary.',
    )


@dataclass
class AgentRunResult:
    agent_id: str
    output: str
    session_id: str | None = None
    live_url: str | None = None
    error: str | None = None
    status: str = "complete"


_AGENT_SECTION_TITLES: dict[str, str] = {
    "topo_map": "TOPO / MAP CANDIDATES",
    "land_rules": "LAND RULES & PERMITS",
    "community_intel": "COMMUNITY INTEL",
}


def format_combined_report(area: str, results: list[AgentRunResult]) -> str:
    """Single plain-text document for copy/paste, curl, or text/plain responses."""
    lines = [
        f"Dispersed camping research — {area.strip()}",
        "",
    ]
    for r in results:
        title = _AGENT_SECTION_TITLES.get(r.agent_id, r.agent_id.upper())
        lines.append(f"{'=' * 60}")
        lines.append(f" {title}  ({r.agent_id})  [{r.status}]")
        lines.append(f"{'=' * 60}")
        body = (r.error or r.output or "").strip() or "(no output)"
        lines.append(body)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


async def _run_one_agent(
    client: AsyncBrowserUse,
    agent_id: str,
    briefing: str,
    *,
    session_id: str | None,
    keep_alive: bool,
) -> AgentRunResult:
    """Run one task on an existing v3 session (or create the session on first call)."""
    task = build_task(agent_id, briefing)
    model = os.getenv("BROWSER_USE_MODEL", "").strip() or None
    run_kw: dict = {
        "session_id": session_id,
        "keep_alive": keep_alive,
        "timeout": session_timeout_minutes_for_api(),
    }
    if model:
        run_kw["model"] = model
    handle = client.run(task, **run_kw)
    try:
        result = await asyncio.wait_for(handle, timeout=_RUN_TIMEOUT_S)
        sess = result.session
        sid = getattr(sess, "id", None)
        out = result.output if result and getattr(result, "output", None) else ""
        out_text = out if isinstance(out, str) else ("" if out is None else str(out))
        return AgentRunResult(
            agent_id=agent_id,
            output=out_text,
            session_id=str(sid) if sid is not None else None,
            live_url=getattr(sess, "live_url", None),
            status="complete",
        )
    except asyncio.TimeoutError:
        sid_stop = getattr(handle, "session_id", None)
        if sid_stop:
            try:
                await client.sessions.stop(sid_stop)
            except Exception:
                pass
        return AgentRunResult(
            agent_id=agent_id,
            output="Partial results returned after reaching the time limit.",
            session_id=None,
            live_url=None,
            status="partial",
        )
    except Exception as e:
        sid_stop = getattr(handle, "session_id", None)
        if sid_stop:
            try:
                await client.sessions.stop(sid_stop)
            except Exception:
                pass
        return AgentRunResult(
            agent_id=agent_id,
            output="",
            error=str(e),
            status="error",
        )


def _missing_key_results() -> list[AgentRunResult]:
    msg = "BROWSER_USE_API_KEY is not set (add bu_… key to backend/.env or export it)"
    return [
        AgentRunResult(agent_id=aid, output="", error=msg, status="error")
        for aid in AGENT_IDS
    ]

def build_gemini_topo_prompt(topo_output: str) -> str:
    return f"""
    You are an outdoor terrain analyst evaluating dispersed camping locations using topographic map observations.

    You are given raw candidate locations extracted from a map. Each includes:
    - Label
    - Coordinates
    - Raw map observations
    - Visible hazards

    Your job is to evaluate, clean, and rank these candidates.

    STRICT RULES:
    - Do NOT invent new locations or coordinates
    - Only use the information provided
    - If a candidate is missing coordinates, discard it
    - Be cautious: map interpretation is uncertain
    - Prefer safety and accessibility over optimism

    TASKS:
    1. For each candidate:
    - Explain why the terrain MAY be suitable for dispersed camping
    - Identify risks or hazards
    - Assign a confidence level: LOW / MEDIUM / HIGH

    2. Rank the candidates from best to worst based on:
    - Flatness
    - Distance from hazards
    - Likelihood of vehicle access

    FORMAT:

    FINAL RANKED CANDIDATES

    1. LABEL:
    COORDINATES:
    WHY IT LOOKS PROMISING:
    RISKS:
    CONFIDENCE:

    2. LABEL:
    COORDINATES:
    WHY IT LOOKS PROMISING:
    RISKS:
    CONFIDENCE:

    3. LABEL:
    COORDINATES:
    WHY IT LOOKS PROMISING:
    RISKS:
    CONFIDENCE:

    SUMMARY:
    - Best overall option:
    - Why:
    - What should be verified on arrival:

    RAW TOPO AGENT OUTPUT:
    {topo_output}
    """.strip()


def run_gemini_topo_analysis(topo_output: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return topo_output + "\n\n[Gemini analysis skipped: GEMINI_API_KEY is not set]"

    try:
        from google import genai
    except ModuleNotFoundError:
        return (
            topo_output
            + "\n\n[Gemini analysis skipped: install google-genai (pip install google-genai)]"
        )

    try:
        gemini_client = genai.Client(api_key=api_key)
        prompt = build_gemini_topo_prompt(topo_output)

        response = gemini_client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=prompt,
        )

        text = getattr(response, "text", None)
        if text and text.strip():
            return text.strip()

        return topo_output + "\n\n[Gemini analysis failed: empty response]"
    except Exception as e:
        return topo_output + f"\n\n[Gemini analysis failed: {e}]"

async def run_three_concurrent(
    location: str,
    *,
    radius_miles: int = 25,
    features: list[str] | None = None,) -> list[AgentRunResult]:
    """Run topo_map → land_rules → community_intel on one reused v3 session (three tasks)."""
    load_env()
    api_key = os.getenv("BROWSER_USE_API_KEY", "").strip()
    if not api_key:
        return _missing_key_results()

    feats = features or []
    briefing = build_camper_briefing(location, radius_miles, feats)
    client = AsyncBrowserUse(api_key=api_key, timeout=_HTTP_TIMEOUT_S)
    results: list[AgentRunResult] = []
    shared_session_id: str | None = None

    try:
        for i, aid in enumerate(AGENT_IDS):
            if i > 0 and _AGENT_STAGGER_S > 0:
                await asyncio.sleep(_AGENT_STAGGER_S)

            is_last = i == len(AGENT_IDS) - 1
            keep_alive = not is_last

            result = await _run_one_agent(
                client,
                aid,
                briefing,
                session_id=shared_session_id,
                keep_alive=keep_alive,
            )

            if result.session_id:
                shared_session_id = result.session_id
            else:
                shared_session_id = None

            if aid == "topo_map" and result.output:
                raw_topo = result.output
                gemini_topo = run_gemini_topo_analysis(raw_topo)
                result.output = (
                    "RAW TOPO AGENT OUTPUT\n"
                    + "=" * 60
                    + "\n"
                    + raw_topo.strip()
                    + "\n\n"
                    + "GEMINI TOPO ANALYSIS\n"
                    + "=" * 60
                    + "\n"
                    + gemini_topo.strip()
                )

            results.append(result)
    finally:
        if shared_session_id:
            try:
                await client.sessions.stop(shared_session_id)
            except Exception:
                pass
        try:
            await client.close()
        except Exception:
            pass

    return results