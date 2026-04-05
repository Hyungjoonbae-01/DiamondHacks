# Contributing

Small fixes and improvements are welcome.

1. **Branch:** Use a short branch name (`fix/…`, `feat/…`) off `main`.
2. **Run lint before a PR:**
   - Frontend: `cd frontend && npm run lint`
   - Backend: follow your usual formatter/ruff setup if you add one.
3. **Secrets:** Never commit real API keys. Use `.env` (see `backend/app/.env.example`) and keep `.env` in `.gitignore`.
4. **PR description:** State what changed and how to verify (e.g. “start backend + frontend, submit form for X location”).

For hackathon judges: setup and demo flow are in the root [README.md](README.md) and [DEMO.md](DEMO.md).
