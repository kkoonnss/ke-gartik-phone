# v2 Agent A — Done Report

## Files Created / Refactored

### Refactored
- `server/game.js` — Full rewrite as thin dispatcher. Delegates initialPhase/nextPhase/assignmentForPlayer/buildAlbums/postSubmit to mode modules. Handles all 3 new client events (room:seatorder, room:masterprompt, room:background). Supports both stepper and non-stepper reveal layouts. Masterpiece 15-min hard cap. Extended phase:assignment payload (prevImage, eraseRect, meta).
- `server/rooms.js` — Extended createRoom to initialize v2 fields (seatOrder, masterprompt, backgroundId, revealLayout) to null. Extended serializeRoom to include all four new fields.
- `server/index.js` — Added GET /api/backgrounds and GET /api/modes routes.

### Created (new)
- `server/modes/index.js` — Registry of all 11 modes.
- `server/modes/_shared.js` — getSeatOrder, hashString, seededRandom, pickEraseRect, emptyText, emptyDrawing, getPrevSlide helpers.
- `server/modes/classic.js` — Extracted from original game.js. write → draw → describe → draw → ... → reveal. revealLayout: stepper.
- `server/modes/knockoff.js` — Extracted from original game.js. write → draw → knockoff-show → knockoff-draw → knockoff-show → ... → reveal. revealLayout: stepper.
- `server/modes/solo.js` — Extracted AND FIXED: v1 had a wasted write phase. v1.1 solo starts directly at draw(round=1) with _soloPrompt pre-picked in initialPhase. revealLayout: gallery.
- `server/modes/story.js` — NEW. write(0) → continue(1..N-1). All text slides. revealLayout: scrollback.
- `server/modes/animation.js` — NEW. write(0) → draw(1..N-1). assignmentForPlayer includes meta.animationPrompt. reveal:album includes animationPrompt + fps:3. revealLayout: frame-cycle.
- `server/modes/coop.js` — NEW. write → coop-draw → describe → coop-draw → ... Walk-back algorithm finds most-recent drawing for prevImage. revealLayout: stepper.
- `server/modes/masterpiece.js` — NEW. Single masterpiece-draw phase, deadline:null, supportsManualAdvance:true. 15-min hard cap enforced by game.js. 1 album, N slides. revealLayout: gallery.
- `server/modes/missingpiece.js` — NEW. write(0) → missingpiece-draw(1..N-1). Round 1: no eraseRect. Rounds 2+: prevImage + seeded eraseRect. revealLayout: stepper.
- `server/modes/background.js` — NEW. Single background-draw phase. prevImage = chosen background's dataUri (from backgrounds.js if available). 1 album, N slides. revealLayout: gallery.
- `server/modes/secret.js` — NEW. Classic phases, but all getSeatOrder() calls use room.seatOrder if set. revealLayout: stepper.
- `server/imageutils.js` — NEW. Empty stub, reserved for future image helpers.

---

## Mode-by-Mode Behavior Summary

| Mode | Phases | Albums | revealLayout | Notes |
|---|---|---|---|---|
| classic | write→draw→describe→draw→...→reveal | N albums, N slides each | stepper | Identical to v1 |
| knockoff | write→draw→show→draw→show→...→reveal | N albums, N slides each | stepper | Identical to v1 |
| solo | draw(round=1)→reveal | 1 album, N+1 slides | gallery | FIXED: no wasted write phase |
| story | write→continue→continue→...→reveal | N albums, N slides (all text) | scrollback | NEW |
| animation | write→draw→draw→...→reveal | N albums, N slides (text+frames) | frame-cycle | NEW; reveal:album has animationPrompt+fps |
| coop | write→coop-draw→describe→coop-draw→...→reveal | N albums, N slides | stepper | NEW; draw phases pass prevImage |
| masterpiece | masterpiece-draw(deadline:null)→reveal | 1 album, N slides | gallery | NEW; host skips manually; 15-min cap |
| missingpiece | write→missingpiece-draw→...→reveal | N albums, N slides | stepper | NEW; seeded eraseRect from round 2+ |
| background | background-draw→reveal | 1 album, N slides | gallery | NEW; prevImage = background dataUri |
| secret | write→draw→describe→draw→...→reveal | N albums, N slides | stepper | NEW; uses room.seatOrder for ordering |

---

## Contract Items Wanted to Change But Didn't

1. **Solo revealLayout conflict**: CONTRACT §8 lists Solo under "gallery" layout but CONTRACT §12 notes gallery is for Solo/Masterpiece/Background. The v1 code used `stepper` for Solo since it had stepper reveal. I implemented v1.1 solo as `gallery` per CONTRACT_v2 §8. This is a change from v1 behavior but correct per v1.1 contract.

2. **Animation `draw` phase naming**: The contract (§3) says "For animation, REUSE existing `draw` phase." I followed this exactly — animation uses `draw` as phase name, not `animation-draw`. The `buildAlbums` and `assignmentForPlayer` distinguish it via mode context, not phase name. This is correct per spec but worth noting for Agent C/D who handle phase assignment display.

3. **`coop` phase naming**: The contract introduces `coop-draw` as a new phase name (§3). I implemented this as specified. Agent C's phase:assignment handler needs to treat `coop-draw` the same as `draw` for canvas display but with the extra `prevImage` pre-loaded.

4. **`knockoff-show` in checkAllSubmitted**: The original v1 code explicitly skipped `knockoff-show` from all-submitted auto-advance (time-based only). I preserved this exact behavior.

5. **`background.js` require within assignmentForPlayer**: I used a try/catch require inside `assignmentForPlayer` for Agent G's backgrounds module. This is slightly non-standard (require inside a function) but necessary since Agent G writes that file in parallel. Once backgrounds.js exists, the require will be cached by Node's module system and the try/catch becomes no-op overhead.

---

## Manual Test Steps

### Prerequisites
```
cd /d "C:\Users\Kons\Documents\_KE_VibeApps\KE_GartiK_Phone"
npm start
```

### REST endpoints (no browser needed)
```
curl http://localhost:3000/api/modes
# Should return 11 modes with id/displayName/description/revealLayout

curl http://localhost:3000/api/backgrounds
# Returns { backgrounds: [] } until Agent G ships backgrounds.js
```

### Classic (parity test)
1. Open http://localhost:3000 in two browser tabs
2. Create room as player A, join as player B
3. Set mode=classic, click Start
4. Both players write text, submit
5. Both players draw, submit
6. Both players describe, submit
7. Host should see reveal with stepper layout
8. Advance through slides with reveal:next

### Solo (fix verification)
1. Create room, 2 players, mode=solo
2. Click Start
3. Verify FIRST phase is `draw` (NOT `write`) — this is the bug fix
4. Both players draw + submit
5. Reveal should be gallery layout with both drawings visible

### Masterpiece (manual-advance test)
1. Create room, 2+ players, mode=masterpiece
2. In lobby, send `room:masterprompt` event with `{ prompt: "A mighty dragon" }`
3. Verify room:state shows masterprompt populated
4. Click Start
5. Phase should be `masterpiece-draw` with deadline=null in phase:assignment
6. Players draw
7. Host clicks Skip Phase — verify game advances to reveal
8. Reveal should be gallery layout

### Missing Piece (seeded erase test)
1. Create room, 3 players, mode=missingpiece
2. Start game
3. Round 0: all write text
4. Round 1: all players get phase=missingpiece-draw, eraseRect=null (no erase first round)
5. Round 2: players should receive eraseRect with {x,y,w,h} values
6. Verify two runs with same room code + round + albumIdx produce identical eraseRect

### Background (prevImage test)
1. Create room, 2 players, mode=background
2. After Agent G ships backgrounds.js: send `room:background { backgroundId: 'grid-light' }`
3. Start game
4. phase:assignment should have prevImage populated with background's dataUri

### Secret (seatOrder test)
1. Create room, 3 players (A, B, C), mode=secret
2. Send `room:seatorder { order: ['C_id', 'A_id', 'B_id'] }` (reversed order)
3. Start game
4. Verify slide assignments follow the overridden seat order
5. Reveal should show albums built using the custom seat order

### Story
1. Create room, 3 players, mode=story
2. Start game — first phase is `write`
3. All write opening sentences, submit
4. Phase becomes `continue` — each player sees previous sentence
5. Continue until reveal
6. Reveal should be scrollback layout

### Animation
1. Create room, 3 players, mode=animation
2. Start — first phase is `write`
3. All write animation descriptions
4. Phase becomes `draw` (round 1) — each player draws frame 1
5. Phase becomes `draw` (round 2) — each player draws frame 2 with prevSlide=previous frame
6. Reveal emits `reveal:album` with animationPrompt + fps:3

### Co-Op
1. Create room, 3 players, mode=coop
2. Start — first phase is `write`
3. All write text, submit
4. Phase becomes `coop-draw` — round 1 players have no prevImage (normal)
5. Players submit drawings
6. Phase becomes `describe` — players describe
7. Phase becomes `coop-draw` round 3 — players should receive prevImage of prior drawing in their chain
8. Reveal stepper layout

### New Events Test
```js
// room:seatorder (host only)
socket.emit('room:seatorder', { order: ['p_abc', 'p_def'] });

// room:masterprompt (host only)
socket.emit('room:masterprompt', { prompt: 'A futuristic city' });

// room:background (host only, after backgrounds.js exists)
socket.emit('room:background', { backgroundId: 'grid-light' });
```
All three should broadcast updated room:state.
