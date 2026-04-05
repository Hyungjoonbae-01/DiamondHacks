"""Start Browser Use agents and return live session URLs for iframe embedding.

Official flow: POST /sessions with ``task`` so ``liveUrl`` matches the session that
runs the task (see Browser Use live preview docs). Do not create an empty session
then call ``run`` separately—that can leave the iframe on the wrong session.

The web UI uses ``POST /api/research/campsites`` (sequential ``client.run``) for
map data instead of this route, so Browser Use only opens **three sessions per
search**, one at a time. Calling ``start-live`` in parallel with research will
duplicate sessions and can trigger 429 concurrent-session limits.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents import (
    AGENT_IDS,
    build_camper_briefing,
    build_task,
    session_timeout_minutes_for_api,
)

router = APIRouter(tags=["browser-agents"])

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

# Seconds to wait between starting each agent (one session create at a time).
_AGENT_STAGGER_S = float(os.getenv("BROWSER_USE_AGENT_STAGGER_S", "0.35"))

# ``sessions.create`` can take a long time while the cloud browser spins up; SDK default is 30s.
_HTTP_TIMEOUT_S = float(os.getenv("BROWSER_USE_HTTP_TIMEOUT", "180"))

_client = None


def _get_client():
    global _client
    from browser_use_sdk.v3 import AsyncBrowserUse

    api_key = os.getenv("BROWSER_USE_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="BROWSER_USE_API_KEY not configured",
        )
    if _client is None:
        _client = AsyncBrowserUse(api_key=api_key, timeout=_HTTP_TIMEOUT_S)
    return _client


class StartLiveBody(BaseModel):
    """CampingApp preferences plus optional ``agent_id`` to start one agent per request."""

    location: str
    radius: int = 25
    features: list[str] = Field(default_factory=list)
    agent_id: str | None = None


@router.post("/browser-agents/start-live")
async def start_live(body: StartLiveBody):
    """Create agent session(s) with tasks; each ``live_url`` is the official embed target.

    Pass ``agent_id`` (one of ``topo_map``, ``land_rules``, ``community_intel``) to start
    a single agent. Omit it to start all three in one call, staggered by
    ``BROWSER_USE_AGENT_STAGGER_S`` seconds between each (default 0.35s).
    """
    loc = body.location.strip()
    if not loc:
        raise HTTPException(status_code=400, detail="location is required")

    briefing = build_camper_briefing(loc, body.radius, body.features)

    if body.agent_id is not None:
        if body.agent_id not in AGENT_IDS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown agent_id {body.agent_id!r}; expected one of {AGENT_IDS}.",
            )
        ids_to_run: tuple[str, ...] = (body.agent_id,)
    else:
        ids_to_run = AGENT_IDS

    client = _get_client()
    model = os.getenv("BROWSER_USE_MODEL", "").strip() or None
    out: list[dict] = []

    for i, aid in enumerate(ids_to_run):
        if i > 0:
            await asyncio.sleep(_AGENT_STAGGER_S)
        task_text = build_task(aid, briefing)
        # Single API call: dispatches the task and returns liveUrl for iframe embed.
        # ``timeout`` is session wall-clock in minutes (API minimum 1; see session_timeout_minutes_for_api).
        session = await client.sessions.create(
            task_text,
            model=model,
            **{"timeout": session_timeout_minutes_for_api()},
        )
        live = getattr(session, "live_url", None)
        sid = getattr(session, "id", None)
        out.append(
            {
                "agent_id": aid,
                "live_url": live,
                "session_id": str(sid) if sid is not None else None,
            }
        )

    return {"agents": out}
