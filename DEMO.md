# Demo checklist (Diamond Hacks)

Use this for live judging or a recorded walkthrough. Rehearse once on a **clean machine** or incognito so caches and env match what judges will see.

## Before you go live

- [ ] Backend: `uvicorn` running on `127.0.0.1:8000` (or your deployed URL + `VITE_API_URL` set).
- [ ] Frontend: `npm run dev` → open **http://localhost:5173** (or your deployed static host).
- [ ] `BROWSER_USE_API_KEY` is set; account has quota for parallel sessions.
- [ ] Pick a **known-good test location** (geocodes cleanly, agents finish within your loading window). Avoid typos during the pitch.
- [ ] Close heavy tabs; agents are network-heavy.

## ~60 second script

1. **Hook (10 s):** “Camping research is scattered across topo maps, regulations, and forums. We orchestrate three Browser Use agents in parallel and put the answers on one map.”
2. **Action (35 s):** Enter location + preferences → submit → briefly point at **live browser URLs** if shown → let loading run → **results map**: Topo vs Community vs demo markers, select a site, show route or panel details, mention **nearby facilities** if visible.
3. **Tech (10 s):** “FastAPI + Browser Use SDK + Mapbox; agents return structured sites we merge and visualize.”
4. **Close (5 s):** “Repo has setup in README; API docs at `/docs`.”

## If something breaks during the demo

- **Agent start fails:** Read the on-screen error; confirm API key and backend logs. Fall back: “Here’s the map with demo data” if your app still renders sites from `camping-data`.
- **Map blank:** Check browser console for Mapbox token / WebGL issues; try another browser.
- **Timeouts:** Mention agents are best-effort in cloud browsers; show **recorded video** or screenshots from a successful run (record one the night before).

## After the hackathon

- Rotate any API keys that were committed or shared.
- Replace the Mapbox public token in `frontend/src/lib/mapbox.js` with an env-based token for real deployments.
