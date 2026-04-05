"""Pydantic models and helpers for topo agent JSON ingestion."""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

ALL_FEATURE_KEYS = [
    "near_water",
    "accessibility",
    "pet_friendly",
    "rv_access",
    "hiking_trails",
    "fishing_spots",
    "campfires",
]


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


def parse_coords_to_lng_lat(coords: str | None) -> tuple[float, float] | None:
    """Parse a coords string into Mapbox order ``[lng, lat]`` (two floats)."""
    if coords is None or not str(coords).strip():
        return None
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", str(coords))]
    if len(nums) < 2:
        return None
    a, b = nums[0], nums[1]
    # Typical human order is lat,lng (|lat|≤90). Mapbox uses [lng, lat].
    if abs(a) <= 90 and abs(b) <= 180:
        return (b, a)
    if abs(b) <= 90 and abs(a) <= 180:
        return (a, b)
    return (b, a)


def _extract_json_value(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for m in re.finditer(r"\{[\s\S]*\}|\[[\s\S]*\]", text):
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            continue
    raise ValueError("No JSON object or array found in agent output")


def parse_topo_agent_output(output: Any) -> list[TopoCandidate]:
    """Normalize Browser Use ``session.output`` (str or dict) into candidates."""
    if output is None:
        return []
    if isinstance(output, dict):
        if "candidates" in output and isinstance(output["candidates"], list):
            return [TopoCandidate.model_validate(c) for c in output["candidates"]]
        if any(k in output for k in ("name", "why", "hazards", "coords")):
            return [TopoCandidate.model_validate(output)]
        return []
    if isinstance(output, list):
        return [TopoCandidate.model_validate(c) for c in output]
    if isinstance(output, str):
        parsed = _extract_json_value(output)
        return parse_topo_agent_output(parsed)
    return []


def candidates_to_map_sites(
    candidates: list[TopoCandidate],
    *,
    feature_prefs: list[str] | None = None,
    site_source: str = "topo_agent",
) -> list[dict[str, Any]]:
    """Build ``campsites``-shaped dicts for the React map (coordinates = [lng, lat])."""
    prefs = set(feature_prefs or [])
    sites: list[dict[str, Any]] = []
    label = "Community" if site_source == "community_intel" else "Topo"
    default_desc = (
        "Community intel spot."
        if site_source == "community_intel"
        else "Topo agent candidate."
    )
    for i, c in enumerate(candidates):
        ll = parse_coords_to_lng_lat(c.coords)
        if ll is None:
            continue
        lng, lat = ll
        parts = []
        if c.why:
            parts.append(c.why.strip())
        if c.hazards:
            parts.append(f"Hazards: {c.hazards.strip()}")
        parts.append(f"Coordinates: {lat:.5f}, {lng:.5f} (latitude, longitude).")
        desc = "\n\n".join(parts) if parts else default_desc
        features = [f for f in ALL_FEATURE_KEYS if f in prefs]
        sites.append(
            {
                "id": i + 1,
                "name": (c.name or f"Site {i + 1}").strip(),
                "description": desc,
                "coordinates": [lng, lat],
                "features": features,
                "rating": 4.0,
                "reviews": 0,
                "price": label,
                "source": site_source,
            }
        )
    return sites
