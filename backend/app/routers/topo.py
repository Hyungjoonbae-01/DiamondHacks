"""Ingest structured JSON from the topo_map agent and poll Browser Use sessions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.agents import run_gemini_topo_analysis
from app.routers.browser_agents import _get_client
from app.schemas.topo import (
    TopoIngestBody,
    candidates_to_map_sites,
    candidates_to_text,
    parse_topo_agent_output,
)

router = APIRouter(tags=["topo"])


@router.post("/topo/ingest")
def ingest_topo_json(
    body: TopoIngestBody,
    gemini: bool = Query(
        False,
        description="If true, run Gemini topo analysis on a plaintext summary of candidates",
    ),
):
    """
    Normalize and return topo candidate JSON from the Browser Use topo agent.

    Accepts:

    - A JSON **array** of objects: `[{ "name", "why", "hazards", "coords" }, ...]`
    - An object with **candidates**: `{ "candidates": [...] }`
    - A **single** candidate object: `{ "name": "...", "why": "...", ... }`
    - **Stringified** JSON in `raw_output`: `{ "raw_output": "[{...}]" }` (optional ``` fences stripped)
    """
    normalized = [c.model_dump(mode="json", exclude_none=False) for c in body.candidates]
    as_text = candidates_to_text(body.candidates)

    out: dict = {
        "ok": True,
        "count": len(body.candidates),
        "candidates": normalized,
        "as_text": as_text,
    }
    if gemini:
        out["gemini_analysis"] = run_gemini_topo_analysis(as_text)
    return out


@router.get("/topo/session/{session_id}/result")
async def get_topo_session_result(
    session_id: str,
    features: list[str] = Query(
        default_factory=list,
        description="User preference feature keys to attach as tags (e.g. near_water)",
    ),
    site_source: str = Query(
        "topo_agent",
        description='Maps to frontend/source label: "topo_agent" or "community_intel"',
    ),
) -> dict[str, Any]:
    """
    Poll the Browser Use **topo_map** session: when ``output`` is set, parse JSON and
    return Mapbox-ready ``sites`` (``coordinates`` as ``[lng, lat]``).

    Call periodically until ``ready`` is true or the task times out.
    """
    try:
        client = _get_client()
        session = await client.sessions.get(session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Browser Use session fetch failed: {e}") from e

    status = getattr(session, "status", None)
    output = getattr(session, "output", None)

    if output is None:
        return {
            "ready": False,
            "session_status": str(status) if status is not None else None,
        }

    try:
        candidates = parse_topo_agent_output(output)
    except (ValueError, TypeError) as e:
        return {
            "ready": False,
            "session_status": str(status) if status is not None else None,
            "parse_error": str(e),
            "raw_output_preview": (str(output)[:800] if output is not None else None),
        }

    if not candidates:
        return {
            "ready": False,
            "session_status": str(status) if status is not None else None,
            "raw_output_preview": (str(output)[:800] if output is not None else None),
        }

    sites = candidates_to_map_sites(
        candidates,
        feature_prefs=features,
        site_source=site_source if site_source in ("topo_agent", "community_intel") else "topo_agent",
    )
    if not sites:
        return {
            "ready": False,
            "session_status": str(status) if status is not None else None,
            "candidates": [c.model_dump(mode="json", exclude_none=False) for c in candidates],
            "reason": "no_valid_coordinates",
        }

    return {
        "ready": True,
        "session_status": str(status) if status is not None else None,
        "candidates": [c.model_dump(mode="json", exclude_none=False) for c in candidates],
        "sites": sites,
        "as_text": candidates_to_text(candidates),
    }


@router.get("/topo/session/{session_id}/land-rules-result")
async def get_land_rules_session_result(session_id: str) -> dict[str, Any]:
    """
    Poll the Browser Use **land_rules** session: when ``output`` is set, return the
    plain-text policy summary (USFS/BLM/NPS rules — not JSON).
    """
    try:
        client = _get_client()
        session = await client.sessions.get(session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Browser Use session fetch failed: {e}") from e

    status = getattr(session, "status", None)
    output = getattr(session, "output", None)

    if output is None:
        return {
            "ready": False,
            "session_status": str(status) if status is not None else None,
        }

    text = str(output).strip()
    return {
        "ready": True,
        "session_status": str(status) if status is not None else None,
        "text": text,
    }
