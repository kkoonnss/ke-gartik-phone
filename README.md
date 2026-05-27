# KE GartiK Phone

A Gartic Phone-style party game built for Monday Meeting game nights. Players join by scanning a QR code on their phone — no accounts, no installs, no setup. The host shares their screen on Zoom, everyone scans in, and you play a chain of writing and drawing until the host reveals the chaos in a slide-by-slide album reveal.

Supports 4–16 players. Runs in any browser. One server, no database.

---

## Run It Locally (Windows)

Double-click `run-local.bat` in the project folder.

That is it. The script checks that Node is installed, installs dependencies if needed, starts the server, and opens your browser to `http://localhost:3000` automatically.

**You need Node 20 or newer.** Download it free from https://nodejs.org if you do not have it.

---

## Deploy to Render (free, no credit card)

Render hosts the game online so players anywhere can join. The free tier is plenty for monthly game night.

**One-time setup:**

1. Push this repository to GitHub (any account, can be private).
2. Go to https://render.com and create a free account.
3. Click **New** → **Blueprint**.
4. Connect your GitHub account and select this repository.
5. Render reads `render.yaml` automatically and provisions the service — no config needed.
6. Click **Apply** and wait about 3 minutes for the first build to finish.
7. Your live URL appears at the top of the service dashboard (something like `https://ke-gartik-phone.onrender.com`).

Share that URL with players or use it as the base for QR codes.

**To redeploy after any code change:** just push to the `main` branch. Render redeploys automatically.

---

## Free Tier Cold-Start Warning

Render's free tier shuts down the server after **15 minutes of inactivity**. When someone visits a sleeping server it takes about **30 seconds** to wake up. Players who hit a sleeping URL will see a blank page or timeout during that window.

**Fix:** Visit the game URL yourself about **1 minute before game night starts** to warm it up. The server will be awake and ready when players scan the QR code.

If you want zero cold-starts in the future, upgrading to Render's Starter plan ($7/month) keeps the service always on.

---

## Hosting Alternatives

If Render is unavailable or you run into issues:

**Fly.io**
- Free tier supports WebSockets (required for this game).
- Install the `flyctl` CLI, run `fly launch`, follow prompts. More technical than Render.
- https://fly.io

**Railway**
- Comes with $5 trial credit, enough for several months of low-traffic use.
- Connect GitHub repo, Railway auto-detects Node and deploys.
- https://railway.app

**Your own machine (no cold-start)**
- Your RTX 3090 box can self-host this. The game has no GPU requirements — the server runs on CPU only.
- Install Node 20, run `run-local.bat`, then set up port forwarding on port 3000 in your router.
- Use a free DDNS service like DuckDNS (https://www.duckdns.org) to get a stable hostname instead of a changing IP address.
- Good for permanent hosting, not recommended for v1 since it requires leaving your PC on and managing the router.

---

## Game Night Flow (for hosts)

1. **Start the server** — either run locally or use the Render URL. If using Render, visit the URL 1 minute early to warm it up.
2. **Create a room** — open the URL in your browser, click "Create Room", pick a name.
3. **Share your screen on Zoom** — the host screen shows the room code and a QR code.
4. **Players scan the QR** — they land on the join page, pick a name, and wait in the lobby.
5. **Configure the round** — choose Classic, Knock-Off, or Solo mode. Set timer lengths if you want.
6. **Click Start Game** — everyone gets their first prompt to write.
7. **Wait for the chain** — players write, draw, and describe in turn. The server auto-advances when everyone submits or the timer runs out.
8. **Trigger the album reveal** — when all rounds complete, click "Reveal Albums" and advance slide by slide. React to the chaos together.
9. **End game** — click End Game when you are done. The room clears from memory.

**Game modes (v0.2):**
- **Classic** — write a prompt, pass it around as draw-then-describe chains, see how mangled your prompt gets by the end.
- **Knock-Off** — everyone sees a drawing for a few seconds then redraws from memory. Degradation guaranteed.
- **Solo Prompts** — everyone draws the same starter prompt at once. Single album, side-by-side reveal.
- **Story** — text-only chain. You see only the previous sentence and write the next. The full story unfolds at reveal.
- **Animation** — each player adds one frame to a tiny animation. Frames loop at the reveal, a flipbook made by committee.
- **Co-Op** — pass an unfinished drawing. Each player continues the previous instead of starting over.
- **Masterpiece** — no timer, one drawing per player to a shared prompt. Take your time. Reveal is a gallery.
- **Missing Piece** — draw a sentence, then each round a chunk of the drawing gets erased and the next player fills it back in. Drift incoming.
- **Background** — everyone draws on the same shared background image. Reveal shows them side by side.
- **Secret** — like Classic, but the host sets the pass order instead of going around the room.

**Presets:**
- **Speedrun** — one-click button that sets all timers short (15s write, 30s draw, 15s describe). Stack it on any mode for a fast round.

**Smoke test:** once the server is running locally via `run-local.bat`, you can verify all modes by opening a second terminal and running `npm test`. The tester walks each mode end-to-end with three fake players and prints PASS/FAIL per mode.

---

## What's new in v0.3

**Voting on slides.** During reveal, every player gets a vote panel showing the slides for the album the host is on. Tap to vote for the funniest one. Vote tallies show live for everyone, and when the game ends the host sees a "Winners Gallery" with the top-voted slide from each album.

**Host moderation.** The host can kick any player from the player list. Kicked players see a banner and get redirected.

**Custom prompt decks.** Host can paste a list of custom prompts (one per line) that override the built-in deck for Solo, Masterpiece, and Background modes.

**Animation framerate.** Host can adjust the loop speed (1-12 fps) for Animation mode reveals.

**Album download.** The standalone `/album/:code` page has a "Download album as PNG" button that composes all slides into a single image strip you can save.

**Sound effects (opt-in, off by default).** Tiny chimes on phase start, submit, reveal, and the like. Toggled per-browser via localStorage.

**Spectator-friendly album page.** The `/album/:code` page no longer joins the game room — it pulls state from a new REST endpoint and refreshes every 30 seconds. Viewers don't consume player slots anymore.

**v0.3 bug fixes from the audit:** Fixed the canvas pointer listener accumulation that was corrupting drawings in long multi-round games. Fixed the mid-game-join slot inflation. Added an `advancePhase` mutex. Lots of small polish.

---

## Roadmap

See `_Briefs/ke-gartik-phone-scope.md` for the full feature map, v2 ideas, and risk register.
