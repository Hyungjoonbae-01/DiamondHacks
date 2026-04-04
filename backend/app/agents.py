"""Three concurrent Browser Use agents for dispersed camping research in a given area.

Uses Cloud SDK API v3. Auth: ``BROWSER_USE_API_KEY`` (``bu_...``). See:
https://docs.browser-use.com/cloud/llms.txt
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from browser_use_sdk.v3 import AsyncBrowserUse

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_ROOT / ".env")

# topo_map: terrain / map-only spot finding; land_rules: agency rules; community_intel: trip reports & forums
AGENT_IDS: tuple[str, ...] = ("topo_map", "land_rules", "community_intel")

_RUN_TIMEOUT_S = float(os.getenv("BROWSER_USE_RUN_TIMEOUT", "140"))


def build_task(agent_id: str, area: str) -> str:
    a = area.strip()
    tasks = {
        "topo_map": (
            f"Research DISPERSED PRIMITIVE CAMPING near: {a}. "
            f"Work primarily from TOPOGRAPHIC / TERRAIN MAPS in the browser (e.g. CalTopo public map, USGS National Map, "
            f"or Google Maps / Google Earth with terrain or satellite + contour-style layers if available). "
            f"Use the map to spot candidate areas yourself—do not only read blog lists. "
            f"Look for: gentle flat benches, small spurs off forest roads (where contours widen), ridges or saddles with mild slope, "
            f"and sites set back from obvious stream channels or cliff bands. "
            f"Return at least 3 MAP-DERIVED CANDIDATES, each with: LABEL (landmark/road/quad name), WHY TOPO/SATELLITE SUGGESTS IT, "
            f"HAZARDS visible on map (avalanche terrain, floodplain, cliff, very steep pitch), and COORDS or grid ref ONLY if the map UI shows them. "
            f"Open at most 2 map tabs total. Stop when this structured list is complete."
        ),
        "land_rules": (
            f"Research RULES for LEGAL DISPERSED CAMPING in this area: {a}. "
            f"Prefer official sources: USFS, BLM, NPS, state parks/forests, tribal land notices if relevant. "
            f"Answer plainly: LAND MANAGER(S), DISPERSED ALLOWED OR NOT, typical STAY LIMIT (days), ROAD/SITE setbacks if stated, "
            f"PERMITS or passes, seasonal FIRE or STAGE restrictions, and any CURRENT CLOSURES. "
            f"If jurisdiction is unclear, say so. Stop after official-policy summary—no forum opinions as law."
        ),
        "community_intel": (
            f"Find PRACTICAL dispersed / boondocking intel near: {a} from travelers. "
            f"Use Reddit (e.g. r/overlanding, r/camping, r/Washington or other regional subs as fits), iOverlander, Campendium free sites, "
            f"or similar—open at most 2 threads or listings. "
            f"Return short bullets: ACCESS (2WD/4WD, road condition hints), CROWDING, WATER/BUGS/seasonal tips if mentioned, "
            f"and WARNINGS (noise, trash, enforcement). Stop once you have actionable notes."
        ),
    }
    return tasks.get(
        agent_id,
        f"Research dispersed camping options and regulations near {a}. Return a concise plain-text summary.",
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
    area: str,
) -> AgentRunResult:
    task = build_task(agent_id, area)
    try:
        session = await client.sessions.create()
        sid = getattr(session, "id", None)
        live = getattr(session, "live_url", None)
        try:
            run_kw: dict = {"session_id": sid}
            if model := os.getenv("BROWSER_USE_MODEL", "").strip():
                run_kw["model"] = model
            result = await asyncio.wait_for(
                client.run(task, **run_kw),
                timeout=_RUN_TIMEOUT_S,
            )
            out = result.output if result and getattr(result, "output", None) else ""
            return AgentRunResult(
                agent_id=agent_id,
                output=out or "",
                session_id=sid,
                live_url=live,
                status="complete",
            )
        except asyncio.TimeoutError:
            return AgentRunResult(
                agent_id=agent_id,
                output="Partial results returned after reaching the time limit.",
                session_id=sid,
                live_url=live,
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


async def run_three_concurrent(area: str) -> list[AgentRunResult]:
    """Run topo map, land-rules, and community-intel agents in parallel."""
    load_dotenv(_BACKEND_ROOT / ".env")
    api_key = os.getenv("BROWSER_USE_API_KEY", "").strip()
    if not api_key:
        return _missing_key_results()

    client = AsyncBrowserUse(api_key=api_key)
    return list(
        await asyncio.gather(
            _run_one_agent(client, "topo_map", area),
            _run_one_agent(client, "land_rules", area),
            _run_one_agent(client, "community_intel", area),
        )
    )
