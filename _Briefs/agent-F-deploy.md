# Agent F — Deploy + README + Local Run Scripts

## Your scope
Make this deployable to a free host (Render.com primary, Fly.io fallback notes) and give Kons a one-command path to run locally.

## Files you own (write ONLY these)
- `render.yaml` (repo root)
- `Procfile` (repo root)
- `README.md` (repo root)
- `run-local.bat` (repo root) — one-click Windows CMD launcher for Kons
- `deploy-prep.bat` (repo root) — installs deps + verifies build + opens the deploy docs

## Pre-written files you reference
- `package.json` (already created — has start script and engines)
- `_Briefs/CONTRACT.md` — for env var assumptions (`PORT`, etc.)
- `_Briefs/ke-gartik-phone-scope.md`

## What to build

### `render.yaml`
A Render Blueprint that defines a free-tier web service:
- Type: web
- Env: node
- Build command: `npm install`
- Start command: `npm start`
- Plan: free
- Auto-deploy from main branch
- Health check path: `/health`
- Env vars: `NODE_ENV=production`. `PORT` is auto-injected by Render.
- Region: oregon (or default)

### `Procfile`
Single line: `web: npm start`
(Needed for some platforms; harmless on Render.)

### `run-local.bat`
A Windows batch script that:
1. Checks Node is installed (`node --version`)
2. Runs `npm install` if `node_modules` doesn't exist
3. Starts the server
4. Opens `http://localhost:3000` in default browser after a 2s delay
- Use clear progress messages, no fancy formatting
- Per Kons's preferences: scripts not instructions, must use absolute paths inside, must be one click
- Path inside script: `cd /d "%~dp0"` so it works regardless of where invoked

### `deploy-prep.bat`
A pre-flight script that:
1. Verifies all required files exist (server/index.js, public/index.html, render.yaml, package.json)
2. Runs `npm install` and prints any warnings
3. Briefly starts the server, hits `/health`, kills it, confirms green
4. Prints the next steps: "Push to GitHub, then go to render.com/dashboard and connect your repo. Render will auto-detect render.yaml."
5. Optionally opens render.com/select-repo in browser

### `README.md`
Cover:
- **What it is**: one-paragraph plain-English description aimed at Kons
- **Quickstart (local)**: double-click `run-local.bat`. Open the URL it gives. Done.
- **Deploy to Render (free tier)**:
  1. Push the repo to GitHub
  2. Sign in at render.com (free account)
  3. New → Blueprint → connect this repo
  4. Render reads `render.yaml` automatically and provisions a free web service
  5. Wait ~3 min for first build
  6. URL appears at top of the service dashboard
- **Free tier caveats**: 15 min idle = ~30s cold boot. Pre-warm by visiting the URL ~1 min before game night.
- **Hosting alternatives**: brief notes on Fly.io (free tier with WS) and Railway ($5 trial credit) if Render is unavailable.
- **Hosting on Kons's hardware**: brief mention that his RTX 3090 box can self-host with port forwarding + a free DDNS (DuckDNS) if he wants no cold-start. Not necessary for v1 since the app has no GPU needs.
- **Game flow for hosts**: how to start a game night (create room → share screen with QR → players scan → start game → reveal albums)
- **Roadmap**: link to scope doc

## Implementation notes
- All paths in the batch files must be safe with `cd /d "%~dp0"` first (Kons opens cmd from `C:\Users\Kons` by default — see memory).
- Folder names starting with `_` lose backslashes on paste — use quoted absolute paths.
- No emojis in filenames.
- Plain ASCII in the batch files.

## Definition of done
- `render.yaml` is valid and Render-deployable
- `run-local.bat` works on a fresh checkout (just needs Node 20 installed)
- README is friendly to a non-developer host (Kons can hand to Monday Meeting organizers)
- File ownership respected — only the five listed files

## Report when done
Write `_Briefs/agent-F-done.md` with: files written, any open deploy questions.
