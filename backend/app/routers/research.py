"""Run the full Browser Use research pipeline and return parsed campsites + raw reports."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents import run_three_concurrent
from app.parsing.topo_campsites import extract_campsites_from_topo_output

router = APIRouter(tags=["research"])


class ResearchCampsitesBody(BaseModel):
    location: str
    radius: int = 25
    features: list[str] = Field(default_factory=list)


@router.post("/research/campsites")
async def research_campsites(body: ResearchCampsitesBody):
    """
    Run topo_map → land_rules → community_intel (sequential), then parse topo output
    into campsite records with coordinates for the map UI.
    """
    loc = body.location.strip()
    if not loc:
        raise HTTPException(status_code=400, detail="location is required")

    results = await run_three_concurrent(
        loc,
        radius_miles=body.radius,
        features=body.features,
    )

    by_id = {r.agent_id: r for r in results}
    topo = by_id.get("topo_map")
    topo_text = (topo.output or "").strip() if topo else ""

    raw_sites = extract_campsites_from_topo_output(topo_text)
    campsites: list[dict] = []
    for i, row in enumerate(raw_sites):
        campsites.append(
            {
                "id": i + 1,
                "name": row["name"],
                "description": row["description"],
                "coordinates": row["coordinates"],
                "hazards": row.get("hazards"),
                "confidence": row.get("confidence"),
                "source": "topo_research",
            }
        )

    reports: dict[str, dict[str, str | None]] = {}
    for r in results:
        reports[r.agent_id] = {
            "status": r.status,
            "output": (r.output or "").strip() or None,
            "error": r.error,
        }

    return {
        "location": loc,
        "campsites": campsites,
        "reports": reports,
        "parse_note": None
        if campsites
        else "No coordinates found in topo output; check reports.topo_map for narrative results.",
    }
