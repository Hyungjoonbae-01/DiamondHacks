"""Ingest structured JSON from the topo_map agent."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.agents import run_gemini_topo_analysis
from app.schemas.topo import TopoIngestBody, candidates_to_text

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
