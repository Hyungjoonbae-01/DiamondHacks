"""Three Browser Use agents for dispersed camping research in a given area.

Agents run **one at a time** (await each run before starting the next). Auth:
``BROWSER_USE_API_KEY`` (``bu_...``). See: https://docs.browser-use.com/cloud/llms.txt
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from pathlib import Path

from app.env_loader import load_env
from browser_use_sdk.v3 import AsyncBrowserUse

load_env()

_BACKEND_ROOT = Path(__file__).resolve().parent.parent

# topo_map: terrain / map-only spot finding; land_rules: agency rules; community_intel: trip reports & forums
AGENT_IDS: tuple[str, ...] = ("topo_map", "land_rules", "community_intel")

_RUN_TIMEOUT_S = float(os.getenv("BROWSER_USE_RUN_TIMEOUT", "140"))
_AGENT_STAGGER_S = float(os.getenv("BROWSER_USE_AGENT_STAGGER_S", "2"))

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


def build_task(agent_id: str, briefing: str) -> str:
    b = briefing.strip()
    header = (
        "The user is searching for dispersed / primitive camping. "
        "Use ALL of the following as their search criteria (location, radius, and preferences):\n"
        f"{b}\n\n"
    )
    tasks = {
        "topo_map": (
            header
            + "Research DISPERSED PRIMITIVE CAMPING matching that request. "
            "Work primarily from TOPOGRAPHIC / TERRAIN MAPS in the browser (e.g. CalTopo public map, USGS National Map, "
            "or Google Maps / Google Earth with terrain or satellite + contour-style layers if available). "
            "Use the map to spot candidate areas yourself—do not only read blog lists. "
            "Look for: gentle flat benches, small spurs off forest roads (where contours widen), ridges or saddles with mild slope, "
            "and sites set back from obvious stream channels or cliff bands. "
            "Weight locations inside the user's search radius and aligned with their stated priorities when possible. "
            "Return at least 3 MAP-DERIVED CANDIDATES, each with: LABEL (landmark/road/quad name), WHY TOPO/SATELLITE SUGGESTS IT, "
            "HAZARDS visible on map (avalanche terrain, floodplain, cliff, very steep pitch), and COORDS or grid ref ONLY if the map UI shows them. "
            "Open at most 2 map tabs total. Stop when this structured list is complete."
        ),
        "land_rules": (
            header
            + "Research RULES for LEGAL DISPERSED CAMPING for this same user request and geographic scope. "
            "Prefer official sources: USFS, BLM, NPS, state parks/forests, tribal land notices if relevant. "
            "Answer plainly: LAND MANAGER(S), DISPERSED ALLOWED OR NOT, typical STAY LIMIT (days), ROAD/SITE setbacks if stated, "
            "PERMITS or passes, seasonal FIRE or STAGE restrictions (especially if the user cares about campfires), and any CURRENT CLOSURES. "
            "If jurisdiction is unclear, say so. Stop after official-policy summary—no forum opinions as law."
        ),
        "community_intel": (
            header
            + "Find PRACTICAL dispersed / boondocking intel matching this user request from travelers. "
            "Use Reddit (e.g. r/overlanding, r/camping, or regional subs as fits), iOverlander, Campendium free sites, "
            "or similar—open at most 2 threads or listings. "
            "Return short bullets: ACCESS (2WD/4WD, road condition hints), CROWDING, WATER/BUGS/seasonal tips if mentioned, "
            "and WARNINGS (noise, trash, enforcement). Relate findings to the user's radius and priorities when possible. "
            "Stop once you have actionable notes."
        ),
    }
    return tasks.get(
        agent_id,
        header
        + "Research dispersed camping options and regulations for this request. Return a concise plain-text summary.",
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
) -> AgentRunResult:
    task = build_task(agent_id, briefing)
    run_kw: dict = {}
    if model := os.getenv("BROWSER_USE_MODEL", "").strip():
        run_kw["model"] = model
    try:
        result = await asyncio.wait_for(
            client.run(task, **run_kw),
            timeout=_RUN_TIMEOUT_S,
        )
        sess = result.session
        sid = getattr(sess, "id", None)
        out = result.output if result and getattr(result, "output", None) else ""
        return AgentRunResult(
            agent_id=agent_id,
            output=out or "",
            session_id=str(sid) if sid is not None else None,
            live_url=getattr(sess, "live_url", None),
            status="complete",
        )
    except asyncio.TimeoutError:
        return AgentRunResult(
            agent_id=agent_id,
            output="Partial results returned after reaching the time limit.",
            session_id=None,
            live_url=None,
            status="partial",
        )
    except Exception as e:
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


async def run_three_concurrent(
    location: str,
    *,
    radius_miles: int = 25,
    features: list[str] | None = None,
) -> list[AgentRunResult]:
    """Run topo_map, land_rules, then community_intel — one agent at a time."""
    load_env()
    api_key = os.getenv("BROWSER_USE_API_KEY", "").strip()
    if not api_key:
        return _missing_key_results()

    feats = features or []
    briefing = build_camper_briefing(location, radius_miles, feats)
    client = AsyncBrowserUse(api_key=api_key)
    results: list[AgentRunResult] = []
    for i, aid in enumerate(AGENT_IDS):
        if i > 0 and _AGENT_STAGGER_S > 0:
            await asyncio.sleep(_AGENT_STAGGER_S)
        results.append(await _run_one_agent(client, aid, briefing))
    return results
