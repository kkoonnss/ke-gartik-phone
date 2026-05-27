# v2 Agent H — Smoke Tester

## Your scope
Build a Node.js test harness that connects fake socket.io clients to the running server and walks each of the 11 modes from create-room through reveal, asserting key state transitions. This is our automated QA since we don't have a human tester available.

## Files you own (write ONLY these)
- `tests/smoke.js` (new)
- `package.json` (you may add the `test` script and `socket.io-client` to devDependencies, NOTHING ELSE)

## Required reading
- `_Briefs/CONTRACT_v2.md` — sections 4, 5, 8, 9, 15 (smoke tester spec)
- `_Briefs/CONTRACT.md` (v1)
- Once Agent A has produced `server/modes/*`, you can also reference them to know what to expect; but write to the contract, not the implementation

## What to build

`tests/smoke.js` is a standalone Node CLI:

```bash
node tests/smoke.js
# or
npm test
```

It expects the server to already be running on `http://localhost:3000` (do not start it for the user — Kons will start it via `run-local.bat` first). If the server is unreachable, exit with code 1 and a clear message.

### Flow per mode

For each mode in `['classic','knockoff','solo','story','animation','coop','masterpiece','missingpiece','background','secret']`:

1. **Connect 3 socket.io clients** named TestA, TestB, TestC
2. **TestA creates a room**, captures room code
3. **TestB and TestC join** that room
4. **Configure mode**:
   - All: emit `room:settings` with mode = current mode
   - masterpiece, background: emit `room:masterprompt` { prompt: 'Test prompt' }
   - background: emit `room:background` { backgroundId: 'blank-white' }
   - secret: emit `room:seatorder` { order: [TestB.playerId, TestC.playerId, TestA.playerId] }
   - knockoff: also set `knockoffShowSeconds: 3` to speed it up
5. **All three clients install handlers for `phase:assignment`**:
   - On every assignment, immediately emit `phase:submit` with appropriate content
   - Text phases (write, continue, describe): `content = 'Test text from ' + name`
   - Draw phases (draw, coop-draw, missingpiece-draw, masterpiece-draw, background-draw, knockoff-draw): `content = TINY_JPEG_DATA_URI` (a hardcoded 32x32 minimal JPEG)
   - knockoff-show: no submission; auto-advances by timer
6. **TestA (host) installs handler for `room:state`**:
   - When state === 'reveal' or 'ended':
     - Capture `revealLayout`
     - Verify it matches expected: classic→stepper, knockoff→stepper, solo→gallery, story→scrollback, animation→frame-cycle, coop→stepper, masterpiece→gallery, missingpiece→stepper, background→gallery, secret→stepper
     - For stepper layouts: emit `reveal:next` a few times and confirm `reveal:slide` arrives without error
     - For non-stepper: confirm `reveal:album` arrived; emit `reveal:next` and confirm no crash
     - Mark mode PASS and proceed to next
7. **Timeout per mode**: 30 seconds. If reveal hasn't been reached, mark FAIL.
8. **Cleanup**: disconnect all 3 sockets before next mode

### Validating phase:assignment

When a `phase:assignment` arrives, verify:
- `phase` is one of the documented phase names
- `round` is a non-negative integer
- `deadline` is null OR a future timestamp (within reasonable bounds, say <30min from now)
- If `prevImage` is present, it starts with `data:`
- If `eraseRect` is present, has x, y, w, h all numbers

Track failures per mode.

### Hardcoded tiny JPEG

A valid 32x32 white JPEG as data URI is about 800 bytes. Include it as a constant:

```js
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAg... [paste full base64 here]';
```

To generate this if you don't have one: write a small node script that uses the Canvas API or a 1-liner you ship inline. Or pre-bake a tiny valid JPEG manually. The simplest approach: a base64-encoded minimal JPEG that you embed.

You can use this 32x32 white JPEG (~250 bytes):

```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAgACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAAA//Z
```

If the above doesn't decode cleanly, generate one with `sharp` or `canvas` packages (but you said no new deps — use a pre-made one). Alternatively, build it inline using `Buffer` and a hand-written JPEG header. You can find tiny valid JPEGs online; pick one that's confirmed valid.

### Output format

```
KE_GartiK_Phone v1.1 Smoke Test
================================
Server: http://localhost:3000

Testing mode: classic        ... PASS  (8.2s, layout=stepper, 3 albums, 9 slides)
Testing mode: knockoff       ... PASS  (12.1s, layout=stepper, 3 albums, 9 slides)
Testing mode: solo           ... PASS  (5.4s, layout=gallery, 1 album, 4 slides)
Testing mode: story          ... PASS  (6.0s, layout=scrollback, 3 albums, 9 slides)
Testing mode: animation      ... PASS  (7.3s, layout=frame-cycle, 3 albums, 9 slides)
Testing mode: coop           ... PASS  (8.1s, layout=stepper, 3 albums, 9 slides)
Testing mode: masterpiece    ... PASS  (2.5s, layout=gallery, 1 album, 3 slides) [host skipped]
Testing mode: missingpiece   ... PASS  (7.8s, layout=stepper, 3 albums, 9 slides)
Testing mode: background     ... PASS  (5.2s, layout=gallery, 1 album, 3 slides)
Testing mode: secret         ... PASS  (8.0s, layout=stepper, 3 albums, 9 slides)

================================
RESULT: 10/10 PASSED
```

On any FAIL, print:
```
Testing mode: masterpiece   ... FAIL
  Reason: phase:assignment never received for round 1
  Last state: lobby
  ...debug info...
```

### Implementation hints

- Use `socket.io-client` 4.x (matches the server's socket.io 4.x)
- Wrap socket.on(event, cb) in promises where useful (e.g., `waitForEvent('room:state', state => state.state === 'reveal', 30000)`)
- Use `setTimeout` for per-mode timeout
- Properly disconnect sockets between modes to avoid state bleeding

### Edge cases

- Masterpiece has no timer: after seeing the first masterpiece-draw assignment, TestA submits via TestA's client, AND emits `phase:skip` to force advance (in case 2/3 clients have submitted but not all)
- Knockoff: skip `knockoff-show` (no submission needed; just wait for next assignment)
- Reveal cursor doesn't always have slideIdx for gallery — be tolerant of either reveal:slide or reveal:album

## Package.json additions

Add ONLY these:
```json
{
  "scripts": {
    "test": "node tests/smoke.js"
  },
  "devDependencies": {
    "socket.io-client": "^4.7.5"
  }
}
```

Do NOT remove or modify any existing fields in package.json.

## Definition of done

- `tests/smoke.js` runs to completion via `npm test`
- All 10 modes are attempted; results clearly logged
- Exit code 0 on full pass, 1 on any fail
- Server is NOT started by the tester (assumed running)
- File ownership respected

## Report when done

Write `_Briefs/v2-agent-H-done.md` with: file written, modes tested, any modes that need manual testing instead.
