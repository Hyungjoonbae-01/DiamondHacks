# DiaHacks — AI-assisted campsite discovery

A hackathon demo that combines **Browser Use** agents (topography, land rules, community intel) with a **React + Mapbox** map. Users enter a location and preferences; parallel cloud browsers research the area while the UI shows live sessions, then merges agent-suggested sites with a map, routing, and nearby facilities.

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 19, Vite 8, Tailwind 4, Mapbox GL, Lucide |
| Backend  | FastAPI, Browser Use SDK, optional Gemini post-processing |

API base path: `/api` (see interactive docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) when the server is running).

## Prerequisites

- **Python 3.11+** (3.14 works with the current `requirements.txt`)
- **Node.js 20+** and npm
- **Browser Use API key** — required for live agents ([cloud.browser-use.com](https://cloud.browser-use.com/settings?tab=api-keys))
- **Mapbox** — a public token is used in the frontend for maps and geocoding (see `frontend/src/lib/mapbox.js`; replace with your own token for production)

## Environment variables

Create a `.env` in **any** of these locations (later files override earlier ones):

1. Repository root: `DiamondHacks/.env`
2. `backend/.env`
3. `backend/app/.env`

Minimum:

```bash
BROWSER_USE_API_KEY=bu_your_key_here
```

Optional keys and tuning (timeouts, Gemini, model names) are documented in [`backend/app/.env.example`](backend/app/.env.example).

**Frontend:** By default the UI calls `http://localhost:8000`. To point at another API (e.g. deployed backend), set:

```bash
# frontend/.env.local
VITE_API_URL=https://your-api.example.com
```

## Run locally

**Terminal 1 — backend**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — frontend**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Ensure the backend is up first if you need agents and topo polling.

**Production build (frontend):**

```bash
cd frontend && npm run build && npm run preview
```

## Project layout

```
backend/app/     # FastAPI app, routers (browser-agents, topo), agents, schemas
frontend/src/    # React UI, Mapbox, polling and camping demo data
```

## Judge / demo checklist

See **[DEMO.md](DEMO.md)** for a short rehearsal script and backup plan.

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for branch and lint expectations.
