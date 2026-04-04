from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import browser_agents, example

app = FastAPI(title="DiaHacks API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(example.router, prefix="/api")
app.include_router(browser_agents.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
