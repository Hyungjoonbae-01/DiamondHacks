from app.env_loader import load_env

load_env()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app.routers import browser_agents, example, topo

app = FastAPI(title="DiaHacks API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(example.router, prefix="/api")
app.include_router(browser_agents.router, prefix="/api")
app.include_router(topo.router, prefix="/api")


@app.get("/")
def root():
    """Browser hits / directly — API has no UI; point people to docs and the Vite app."""
    return {
        "service": app.title,
        "message": "This is the JSON API. Open the Vite dev server for the web UI.",
        "docs": "/docs",
        "redoc": "/redoc",
        "health": "/health",
        "example": "/api/example",
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/health")
def health():
    return {"status": "ok"}
