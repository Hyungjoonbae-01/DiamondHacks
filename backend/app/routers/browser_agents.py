"""Start Browser Use agents and return live session URLs for iframe embedding."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents import AGENT_IDS, build_camper_briefing, build_task

router = APIRouter(tags=["browser-agents"])

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(_BACKEND_ROOT / ".env")

_client = None
_background_tasks: set[asyncio.Task] = set()


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
        _client = AsyncBrowserUse(api_key=api_key)
    return _client


class StartLiveBody(BaseModel):
    """Same shape as the CampingApp preferences payload (minus coordinates)."""

    location: str
    radius: int = 25
    features: list[str] = Field(default_factory=list)


@router.post("/browser-agents/start-live")
async def start_live(body: StartLiveBody):
    """Create three sessions, return live_url for each, and run tasks in the background."""
    loc = body.location.strip()
    if not loc:
        raise HTTPException(status_code=400, detail="location is required")

    briefing = build_camper_briefing(loc, body.radius, body.features)

    client = _get_client()
    model = os.getenv("BROWSER_USE_MODEL", "").strip()
    out: list[dict] = []

    for aid in AGENT_IDS:
        session = await client.sessions.create()
        sid = getattr(session, "id", None)
        live = getattr(session, "live_url", None)
        task_text = build_task(aid, briefing)

        async def run_agent(
            session_id: str | None = sid,
            task_str: str = task_text,
        ):
            if not session_id:
                return
            run_kw: dict = {"session_id": session_id}
            if model:
                run_kw["model"] = model
            try:
                await client.run(task_str, **run_kw)
            except Exception:
                pass

        t = asyncio.create_task(run_agent())
        _background_tasks.add(t)
        t.add_done_callback(_background_tasks.discard)
        out.append({"agent_id": aid, "live_url": live})

    return {"agents": out}
