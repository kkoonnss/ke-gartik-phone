# KE_GartiK_Phone — Project Scope

A self-hosted Gartic Phone–style party game for Monday Meeting's monthly game night. Players join by scanning a QR code on their phones; the host runs the round flow from a laptop or TV. MVP targets a single-room, in-memory, free-to-host web app deployable in under an hour of build effort split across parallel Sonnet sub-agents.

---

## 1. Project Overview

Monday Meeting is a monthly virtual gathering of motion designers, animators, and VFX artists. They want a branded "telephone-drawing" party game for game night where 4-15 attendees on phones jump into a room from a QR code on a shared screen and play through write/draw chains until the host reveals the albums.

Success looks like: host opens the app, shares the screen on Zoom, players in the call scan the QR with their phones, everyone writes a starting prompt, the chain rotates through draws and descriptions, and the host triggers an album reveal that gets laughs. Zero installs, zero accounts.

---

## 2. User Roles and Permissions

| Role | Capabilities |
|------|--------------|
| **Host** | Creates room, configures mode/timers, sees QR + player list, advances/skips rounds, triggers reveal, ends game. One host per room. |
| **Player** | Joins via room code or QR, picks a display name, submits prompts/drawings, watches reveal on their phone. |
| **Spectator (v2)** | Read-only album viewer post-game. Out of scope for v1. |

No accounts. Identity is `playerId` cookie + display name, persisted per browser session.

---

## 3. Feature Map

### Must-have (v1, this sprint)
- Create room with 4-character code (e.g. `KZQM`)
- QR code on host screen that deep-links to `/?room=KZQM`
- Player join with name picker
- Player avatar = auto-assigned color + emoji from a 24-pack
- Game modes:
  - **Classic** — write prompt → draw → describe → draw → describe (Gartic loop)
  - **Knock-Off** — show drawing for N seconds, then redraw from memory
  - **Solo Prompts** — host picks one starter prompt, everyone draws simultaneously, single album
- Host-tunable timers (write/draw/describe seconds)
- Drawing canvas with: 6 colors, 3 brush sizes, eraser, undo, clear
- Per-phase server-driven countdown with sync
- Auto-submit on timeout (capture whatever is on canvas)
- Album reveal: slide-by-slide, host advances manually
- Host can skip a stuck round
- Disconnect/reconnect tolerated: player resumes their slot via cookie

### Should-have (v1 if time)
- Story mode (text-only chain)
- Save album as a downloadable ZIP/PNG strip
- Sound effects for round start/end (Tone.js)
- Player kick (host)

### Future (v2+)
- Persistent past albums
- Spectator mode
- Custom prompt deck upload
- Discord OAuth (Monday Meeting community)
- Animation mode (frame-by-frame)
- Mobile PWA install

---

## 4. Page/Screen Map

| Route | Role | Purpose |
|-------|------|---------|
| `/` | Anyone | Landing: "Create Room" or "Join Room" (with code input). Auto-fills from `?room=` query param. |
| `/host/:code` | Host | QR code, room code, player list, mode/timer settings, "Start Game" button. Stays on this page through the game showing current phase + countdown. |
| `/play/:code` | Player | All player phases: name picker → waiting room → write prompt → draw → describe → reveal-spectator. |
| `/album/:code` | Anyone | Post-game playback. Reachable from host's "Show Album" or after game ends. |

Single SPA-lite approach: each route is its own minimal HTML file with shared JS. No router framework needed.

---

## 5. Technical Architecture

### Stack
- **Backend**: Node 20 + Express + Socket.io. Single process. In-memory game state (no DB).
- **Frontend**: Vanilla HTML/CSS/JS. No build step. Socket.io client over CDN. Canvas API for drawing.
- **QR generation**: `qrcode` npm package, server-side renders data URI for host page.
- **Hosting**: Render.com web service free tier. Supports websockets, spins down after 15min idle (~30s warm-up acceptable for scheduled game night). Alt: Fly.io free tier if Render falls short.
- **Persistence**: None for v1. Rooms live in memory; if server restarts, game ends. Acceptable for monthly use.

### Why this stack
- No build step = sub-agents can drop files in `/public` and they run immediately
- Single process = trivial deploy
- Socket.io handles reconnects + room broadcast natively
- Free Render tier supports WS (Vercel/Netlify don't for stateful WS)
- Vanilla JS = no framework learning curve for future tweaks

### Backend architecture
- `server/index.js` — Express app, static serving, Socket.io bootstrap
- `server/rooms.js` — Room map, code generator, player registry
- `server/game.js` — State machine (lobby → write → draw → describe → reveal), round advancer, timer ticks
- `server/prompts.js` — Default prompt deck for Solo mode

State machine phases:
```
lobby → starting → write → [draw → describe]* → reveal → ended
```

Every player submits per phase; server advances when all submitted OR timer expires. After advance, server rotates the album-chain assignment and broadcasts new phase + content per player.

### Frontend architecture
- Each HTML file is a thin shell with `<div id="app">` and includes its page JS + shared `socket-client.js`
- Pages subscribe to `room:state` and render reactively from a single state object
- Drawing canvas is its own module (`canvas.js`) with toolbar, stroke buffer, undo stack

### Infrastructure
- Single Render web service, auto-deploys from main branch
- `render.yaml` checked in, env vars: `PORT`, `NODE_ENV`
- GitHub → Render webhook (Kons does this once)
- Logs: stdout/stderr to Render console

---

## 6. Data Model (in-memory)

```js
Room {
  code: "KZQM"
  hostId: "p_abc123"
  state: "lobby" | "playing" | "reveal" | "ended"
  settings: {
    mode: "classic" | "knockoff" | "solo"
    writeSeconds: 60
    drawSeconds: 90
    describeSeconds: 45
    knockoffShowSeconds: 8
  }
  players: [Player]
  albums: [Album]            // one album per starting player
  currentPhase: {
    name: "write" | "draw" | "describe" | "knockoff-show" | "knockoff-draw" | "reveal" | null
    round: 0                  // 0 = starting prompt
    endsAt: 1700000000000     // unix ms
    submitted: Set<playerId>
  }
  revealCursor: { albumIdx: 0, slideIdx: 0 }
  createdAt: timestamp
}

Player {
  id: "p_abc123"               // cookie-stored
  name: "Kons"
  emoji: "🎨"
  color: "#ff5a5f"
  isHost: false
  connected: true
  socketId: "s_xyz"
  joinedAt: timestamp
}

Album = [Slide]
Slide {
  type: "text" | "drawing"
  authorId: "p_abc123"
  content: string             // text OR PNG data URI OR stroke JSON
  phase: "write" | "draw" | "describe"
  round: 1
}
```

---

## 7. Socket.io Event Contract

**Defined in `_Briefs/CONTRACT.md` — all sub-agents read it. Single source of truth.**

Client → Server:
- `room:create` `{ name, emoji }` → `{ code, playerId, isHost: true }`
- `room:join` `{ code, name, emoji, resumePlayerId? }` → `{ playerId, room }`
- `room:settings` `{ mode, writeSeconds, drawSeconds, describeSeconds }` (host only)
- `game:start` (host only)
- `phase:submit` `{ content }` (current player submission for current phase)
- `phase:skip` (host only)
- `reveal:next` (host only)
- `reveal:prev` (host only)

Server → Client (broadcast to room):
- `room:state` — full room snapshot, sent on every state change
- `phase:tick` `{ endsAt }` — every second during a phase
- `phase:assignment` `{ phase, round, content, deadline }` — per-player, includes the previous slide they're acting on
- `reveal:slide` `{ albumIdx, slideIdx, slide, author }` — host-paced playback
- `error` `{ code, message }`

---

## 8. Third-Party Dependencies

| Service / Pkg | Purpose | Cost |
|---|---|---|
| `express` | HTTP server | free |
| `socket.io` | Realtime | free |
| `qrcode` | QR data URI generation | free |
| `nanoid` | Player + room ID generation | free |
| Socket.io client (CDN) | Frontend WS | free |
| Render.com free tier | Hosting | free (spins down idle) |

No external APIs. No payment processor. No analytics. No email.

---

## 9. Risk Register

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Free-tier cold start** | Render free spins down after 15min idle, ~30s cold boot | Host pre-warms the URL 1min before game night; document in README. v2: cheap Hobby tier if community grows. |
| **Canvas data size** | A 1024×768 PNG data URI is ~50-200KB; 12 players × 12 rounds × 6 albums = a lot of WS traffic | Cap canvas at 720×540, downscale to JPEG 0.7 quality for transit, store as data URI. Server enforces 250KB per submission. |
| **Drawing on phone is hard** | Small canvas, fat fingers | Canvas auto-fits viewport with min height; brush sizes generous; pinch-zoom disabled on canvas container only. |
| **Disconnects mid-round** | Player drops, chain breaks | Cookie-based reconnect resumes slot. If absent at submit deadline, server auto-submits "..." text or blank canvas and continues. |
| **Two people press Create at once** | Race on code generation | Server gates `room:create` with code-uniqueness check inside Maps.set; codes are 4 chars from 32-char alphabet (1M combos, safe for tens of concurrent rooms). |
| **Host browser closes** | No host = stuck game | If host disconnects >30s, promote next-joined player to host. Surface in UI. |
| **Sub-agent contract drift** | Parallel agents diverge on event shapes | Locked `CONTRACT.md` written first; each agent brief says "do not invent new events; if you need one, stop and report." Orchestrator (this conversation) QCs integration. |
| **WebSocket on free Render** | Confirmed supported but worth verifying | Sub-agent F adds a smoke check route `/health` and tests WS during deploy. |

---

## 10. Open Questions and Future Considerations

### Decisions deferred (defaults chosen for sprint)
- Default room size cap: 16 players
- Default classic-mode rounds: equal to player count (so each album returns to its author at reveal)
- Default mode: Classic
- Sound on/off: off by default for v1, host toggle for v1.5

### v2+ ideas captured
- Persistent album archive ("see past game nights")
- Discord login (Monday Meeting community already on Discord)
- Custom prompt decks (motion-design specific: "your After Effects rig at 3am")
- Animation mode (multi-frame draw)
- Spectator-only join link

---

## 11. Implementation Phases (parallelized sprint)

This sprint is structured for ~6 Sonnet sub-agents working concurrently, each ~60 min of work. Orchestrator pre-writes the scaffold, shared contract, and HTML shells so agents don't collide.

### Phase 0 — Orchestrator scaffold (done by me before delegating)
- Directory tree
- `package.json` with deps
- `CONTRACT.md` (locked event shapes)
- HTML shells with element IDs already in place
- Shared `socket-client.js` wrapper
- Empty CSS files with class names referenced from shells
- Brief files in `_Briefs/` for each agent

### Phase 1 — Parallel build (6 agents)

| Agent | Owns | Files |
|---|---|---|
| **A: Server** | Room lifecycle, game state machine, socket events, timers | `server/index.js`, `server/rooms.js`, `server/game.js`, `server/prompts.js` |
| **B: Lobby + Host** | Landing page, room create/join, host page with QR, player list, settings, start button | `public/js/lobby.js`, `public/js/host.js` |
| **C: Player + Canvas** | Player page state rendering, drawing canvas tool, write/describe input | `public/js/play.js`, `public/js/canvas.js` |
| **D: Album Reveal** | Album playback page + host reveal controls | `public/js/album.js`, host reveal panel hooks |
| **E: Theming** | Monday Meeting visual identity, fonts, dark mode, motion-design accents | `public/css/theme.css`, `public/css/styles.css`, `public/assets/*` |
| **F: Deploy** | `render.yaml`, `Procfile`, `.gitignore`, `README.md`, health check route stub, prewarm script | repo root |

### Phase 2 — Orchestrator QC + integration
- Read every output file
- Run server locally inside the sandbox shell, smoke the full loop with a simulated 3-player chain
- Fix glue points (CSS class mismatches, event name typos)
- Verify QR resolves to a valid URL

### Phase 3 — Deploy
- Commit + push (Kons does this from his machine via the provided CMD script)
- Render auto-deploys
- Final smoke from a phone

### Phase 4 — Tweak (post-sprint, Kons-led)
- Brand polish based on feedback
- Sound effects
- Story mode
- Save album

---

**Sprint contract for sub-agents:** Each agent is given a brief file in `_Briefs/`, a copy of `CONTRACT.md`, and a list of files they own. They must not touch files outside their list. If they need a new socket event or a contract change, they stop and report to the orchestrator rather than improvising.
