"""Extract map-ready campsites from topo_map agent output (raw + optional Gemini section)."""

from __future__ import annotations

import re


def _pair_to_lng_lat(a: float, b: float) -> tuple[float, float] | None:
    """Interpret two numbers as either (lat, lng) or (lng, lat); return Mapbox order [lng, lat]."""
    if abs(a) <= 90 and abs(b) <= 180 and not (abs(a) > 90 and abs(b) <= 90):
        return (b, a)
    if abs(b) <= 90 and abs(a) <= 180:
        return (a, b)
    return None


def parse_coord_string(s: str) -> tuple[float, float] | None:
    s = s.strip()
    if not s:
        return None
    nums: list[float] = []
    for x in re.findall(r"-?\d+\.?\d*", s):
        try:
            nums.append(float(x))
        except ValueError:
            continue
    if len(nums) < 2:
        return None
    return _pair_to_lng_lat(nums[0], nums[1])


def _gemini_section(text: str) -> str:
    upper = text.upper()
    key = "GEMINI TOPO ANALYSIS"
    i = upper.find(key)
    if i >= 0:
        return text[i + len(key) :]
    key2 = "FINAL RANKED CANDIDATES"
    j = upper.find(key2)
    if j >= 0:
        return text[j:]
    return text


def _split_numbered_blocks(s: str) -> list[str]:
    s = s.strip()
    if not s:
        return []
    parts = re.split(r"\n(?=\d+\.\s)", s)
    return [p.strip() for p in parts if p.strip()]


def _parse_block(block: str) -> dict | None:
    """One numbered Gemini-style candidate block with COORDINATES."""
    ul = block.upper()
    if "COORDINATES:" not in ul:
        return None

    name = None
    lm = re.search(r"(?im)^LABEL:\s*(.+)$", block)
    if lm:
        name = lm.group(1).strip()
    if not name:
        nm = re.search(r"(?m)^\d+\.\s*(.+)$", block)
        if nm:
            name = nm.group(1).strip()
    if not name:
        name = "Dispersed site"

    cm = re.search(r"(?im)^COORDINATES:\s*(.+)$", block)
    if not cm:
        return None
    lng_lat = parse_coord_string(cm.group(1))
    if not lng_lat:
        return None
    lng, lat = lng_lat
    if not (-180 <= lng <= 180 and -90 <= lat <= 90):
        return None

    why = ""
    wm = re.search(
        r"(?is)WHY IT LOOKS PROMISING:\s*(.+?)(?=RISKS:|CONFIDENCE:|COORDINATES:|\Z)",
        block,
    )
    if wm:
        why = wm.group(1).strip()

    risks = ""
    rm = re.search(
        r"(?is)RISKS:\s*(.+?)(?=CONFIDENCE:|WHY IT LOOKS|COORDINATES:|\Z)",
        block,
    )
    if rm:
        risks = rm.group(1).strip()

    conf = ""
    cm2 = re.search(r"(?im)^CONFIDENCE:\s*(.+)$", block)
    if cm2:
        conf = cm2.group(1).strip()

    desc_parts = []
    if why:
        desc_parts.append(why)
    if risks:
        desc_parts.append(f"Hazards: {risks}")
    if conf:
        desc_parts.append(f"Confidence: {conf}")
    description = "\n\n".join(desc_parts) if desc_parts else "Topo-derived candidate."

    return {
        "name": name[:200],
        "description": description[:4000],
        "coordinates": [lng, lat],
        "hazards": risks[:2000] if risks else None,
        "confidence": conf[:80] if conf else None,
    }


def _fallback_coord_harvest(text: str) -> list[dict]:
    """If structured blocks fail, pair each COORDINATES: line with the nearest preceding label."""
    out: list[dict] = []
    for m in re.finditer(r"(?im)^COORDINATES:\s*(.+)$", text):
        lng_lat = parse_coord_string(m.group(1))
        if not lng_lat:
            continue
        lng, lat = lng_lat
        if not (-180 <= lng <= 180 and -90 <= lat <= 90):
            continue
        prefix = text[: m.start()]
        name = "Dispersed site"
        for pat in (r"(?im)^LABEL:\s*(.+)$", r"(?m)^\d+\.\s*(.+)$"):
            matches = list(re.finditer(pat, prefix))
            if matches:
                name = matches[-1].group(1).strip()[:200]
        out.append(
            {
                "name": name,
                "description": "Parsed from research output (verify on the ground).",
                "coordinates": [lng, lat],
                "hazards": None,
                "confidence": None,
            }
        )
    # Deduplicate nearby duplicate coords
    seen: set[tuple[int, int]] = set()
    unique: list[dict] = []
    for c in out:
        lng, lat = c["coordinates"]
        key = (round(lng, 4), round(lat, 4))
        if key in seen:
            continue
        seen.add(key)
        unique.append(c)
    return unique


def extract_campsites_from_topo_output(topo_text: str) -> list[dict]:
    if not (topo_text or "").strip():
        return []

    gemini = _gemini_section(topo_text)
    parsed: list[dict] = []
    for block in _split_numbered_blocks(gemini):
        row = _parse_block(block)
        if row:
            parsed.append(row)

    if not parsed:
        parsed = _fallback_coord_harvest(topo_text)

    return parsed
