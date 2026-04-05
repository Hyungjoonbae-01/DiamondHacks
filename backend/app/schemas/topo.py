"""Pydantic models and helpers for topo agent JSON ingestion."""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TopoCandidate(BaseModel):
    """Fields aligned with the topo_map agent prompt (name, why, hazards, coords)."""

    model_config = ConfigDict(extra="allow")

    name: str | None = Field(None, description="Label / landmark name")
    why: str | None = Field(None, description="Why terrain suggests dispersed camping")
    hazards: str | None = Field(None, description="Visible hazards")
    coords: str | None = Field(None, description="Coordinates if available")


def candidates_to_text(candidates: list[TopoCandidate]) -> str:
    """Plain-text block suitable for Gemini topo analysis."""
    lines: list[str] = []
    for i, c in enumerate(candidates, start=1):
        lines.append(f"CANDIDATE {i}")
        if c.name:
            lines.append(f"LABEL: {c.name}")
        if c.why:
            lines.append(f"WHY: {c.why}")
        if c.hazards:
            lines.append(f"HAZARDS: {c.hazards}")
        if c.coords:
            lines.append(f"COORDS: {c.coords}")
        extra = {k: v for k, v in c.model_extra.items() if v is not None} if c.model_extra else {}
        if extra:
            lines.append(f"EXTRA: {json.dumps(extra)}")
        lines.append("")
    return "\n".join(lines).strip()


def _parse_json_string(s: str) -> Any:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```\w*\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    return json.loads(s)


class TopoIngestBody(BaseModel):
    """Accept topo JSON as an array, wrapped object, single candidate, or stringified JSON."""

    model_config = ConfigDict(extra="allow")

    candidates: list[TopoCandidate]

    @model_validator(mode="before")
    @classmethod
    def normalize(cls, data: object) -> dict[str, object]:
        if data is None:
            raise ValueError("JSON body is required")
        if isinstance(data, list):
            return {"candidates": data}
        if isinstance(data, dict):
            d = dict(data)
            if "candidates" in d and isinstance(d["candidates"], list):
                return {"candidates": d["candidates"]}
            raw = d.get("raw_output")
            if isinstance(raw, str) and raw.strip():
                parsed = _parse_json_string(raw)
                if isinstance(parsed, list):
                    return {"candidates": parsed}
                if isinstance(parsed, dict):
                    if "candidates" in parsed and isinstance(parsed["candidates"], list):
                        return {"candidates": parsed["candidates"]}
                    return {"candidates": [parsed]}
            keys = ("name", "why", "hazards", "coords")
            if any(k in d for k in keys):
                return {"candidates": [d]}
        if isinstance(data, str) and data.strip():
            parsed = _parse_json_string(data)
            if isinstance(parsed, list):
                return {"candidates": parsed}
            if isinstance(parsed, dict):
                if "candidates" in parsed and isinstance(parsed["candidates"], list):
                    return {"candidates": parsed["candidates"]}
                return {"candidates": [parsed]}
        raise ValueError(
            "Expected: JSON array of candidates, "
            '{"candidates":[...]}, one object with name/why/hazards/coords, '
            'or {"raw_output": "<json string>"}'
        )
