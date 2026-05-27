# Agent F — Done

## Files written

All five files created at repo root. No other files touched.

| File | Notes |
|---|---|
| `render.yaml` | Free-tier Blueprint; node env; `npm install` build; `npm start` start; `/health` health check; `NODE_ENV=production`; region oregon; auto-deploy from main. |
| `Procfile` | Single line `web: npm start`. |
| `README.md` | Plain-English; covers what it is, local quickstart, Render deploy steps, cold-start caveat, Fly.io + Railway + self-host alternatives, game night host flow, roadmap pointer. |
| `run-local.bat` | Starts with `cd /d "%~dp0"`; checks Node; installs deps if node_modules missing; opens browser to localhost:3000 after 2s; stays open running the server. |
| `deploy-prep.bat` | Starts with `cd /d "%~dp0"`; checks 5 required files; `npm install`; starts server, hits `/health` via curl, kills node; prints full GitHub → Render steps; offers to open render.com/select-repo. |

## Open deploy questions

1. **Health check route** — `render.yaml` specifies `/health` as the health check path, but the actual route must be implemented in `server/index.js` by Agent A. It should return HTTP 200 with a plain-text or JSON `ok` body. If Agent A has not added this, Render will mark the service as unhealthy and restart it in a loop. Confirm with Agent A that the route exists.

2. **PORT binding** — Render injects `PORT` as an env var. `server/index.js` must listen on `process.env.PORT || 3000`. If Agent A hardcoded port 3000 without the env fallback, the deploy will fail silently. Check this during QC.

3. **WebSocket sticky sessions** — Render free tier runs a single instance, so sticky sessions are not needed. If the app is ever scaled to multiple instances, Socket.io will require a Redis adapter. Out of scope for v1 but worth noting.

4. **Cold-start for Socket.io clients** — If a player's browser has a cached URL and the server restarts (e.g., after idle spin-down), Socket.io will reconnect automatically. Game state is in-memory so a restarted server means a blank slate — any in-progress game is lost. This is documented in the scope as acceptable for monthly use and noted in README.

5. **`deploy-prep.bat` curl dependency** — The health check step uses `curl`, which ships with Windows 11 but may be missing on older machines. The script handles this gracefully with a warning message, but if the tester is on an older Windows box they will need to verify `/health` manually.

6. **`.gitignore`** — The brief mentioned `.gitignore` as potentially in scope for Agent F, but the final file list did not include it. If no other agent created it, `node_modules/` will be committed to GitHub. Recommend orchestrator adds a minimal `.gitignore` with at minimum `node_modules/` before the first push.
