# v0.5 Fix A — Reveal Navigation Done

File edited: `server/game.js` only.

---

## Exact lines changed

### Change 1 — reveal:next guard (line 691)

**Before:**
```js
if (!room || room.state !== 'reveal') return;
```

**After:**
```js
if (!room || (room.state !== 'reveal' && room.state !== 'ended')) return;
```

### Change 2 — reveal:prev guard (line 744)

**Before:**
```js
if (!room || room.state !== 'reveal') return;
```

**After:**
```js
if (!room || (room.state !== 'reveal' && room.state !== 'ended')) return;
```

### Change 3 — reveal:prev body, stepper layout (lines 754-765)

**Before:**
```js
if (layout === 'stepper') {
  if (slideIdx > 0) {
    room.revealCursor.slideIdx = slideIdx - 1;
  } else if (albumIdx > 0) {
    const prevAlbum = room.albums[albumIdx - 1];
    room.revealCursor.albumIdx = albumIdx - 1;
    room.revealCursor.slideIdx = prevAlbum.length - 1;
  }
  broadcastState(io, room);
  emitRevealSlide(io, room);
```

**After:**
```js
if (layout === 'stepper') {
  // Navigating backward from 'ended' always re-enters review mode
  if (room.state === 'ended') room.state = 'reveal';
  if (slideIdx > 0) {
    room.revealCursor.slideIdx = slideIdx - 1;
  } else if (albumIdx > 0) {
    const prevAlbum = room.albums[albumIdx - 1];
    room.revealCursor.albumIdx = albumIdx - 1;
    room.revealCursor.slideIdx = prevAlbum.length - 1;
  }
  // PREV at slide 0 of album 0: state stays 'reveal', cursor unchanged — clamp
  broadcastState(io, room);
  emitRevealSlide(io, room);
```

### Change 4 — reveal:prev body, gallery layout (lines 767-770)

**Before:**
```js
} else if (layout === 'gallery') {
  // no-op
  broadcastState(io, room);
```

**After:**
```js
} else if (layout === 'gallery') {
  // Single album, no-op — but restore state if ended so UI re-enters review
  if (room.state === 'ended') room.state = 'reveal';
  broadcastState(io, room);
```

### Change 5 — reveal:prev body, frame-cycle/scrollback layout (lines 772-787)

**Before:**
```js
} else {
  // frame-cycle, scrollback: step album-by-album
  if (albumIdx > 0) {
    room.revealCursor.albumIdx = albumIdx - 1;
    room.revealCursor.slideIdx = 0;
    broadcastState(io, room);
    emitRevealAlbum(io, room, room.revealCursor.albumIdx);
  }
  // If at start, do nothing
}
```

**After:**
```js
} else {
  // frame-cycle, scrollback: step album-by-album
  if (albumIdx > 0) {
    // Navigating backward from 'ended' always re-enters review mode
    if (room.state === 'ended') room.state = 'reveal';
    room.revealCursor.albumIdx = albumIdx - 1;
    room.revealCursor.slideIdx = 0;
    broadcastState(io, room);
    emitRevealAlbum(io, room, room.revealCursor.albumIdx);
  } else {
    // At album 0 — clamp; if ended, still re-enter reveal so host can review
    if (room.state === 'ended') room.state = 'reveal';
    broadcastState(io, room);
    emitRevealAlbum(io, room, albumIdx);
  }
}
```

---

## How prev-from-ended restores 'reveal' for each layout

### stepper
The `room.state = 'reveal'` assignment runs unconditionally at the top of the stepper branch before any cursor movement. Whether prev is moving backward a slide, crossing an album boundary, or clamping at slide 0 / album 0, the state is already flipped to 'reveal' before `broadcastState` fires. All clients receiving `room:state` will see `state: 'reveal'` and re-render the review panel. `emitRevealSlide` then fires to push the current (or newly-decremented) cursor position.

### gallery
Gallery is a single-album no-op for navigation. The guard relaxation lets the event through when state is 'ended'. The state is restored to 'reveal' and `broadcastState` fires. No cursor moves (there is nothing to move). Clients re-render the review panel.

### frame-cycle / scrollback
If albumIdx > 0, state is restored to 'reveal' before decrementing the cursor and calling `emitRevealAlbum`. If albumIdx === 0 (clamped at start), state is still restored to 'reveal', broadcastState fires, and `emitRevealAlbum` re-emits the current album so the album page re-renders correctly — previously this branch did nothing at all, which would have left a host stuck in 'ended' with no way to re-enter review.

---

## State machine trace — stepper (most common layout, N=3 classic)

Starting conditions: 3 albums, each 3 slides. Initial cursor: albumIdx=0, slideIdx=0. State: 'reveal'.

```
reveal  cursor(0,0) -- NEXT --> reveal  cursor(0,1)   [emitRevealSlide]
reveal  cursor(0,1) -- NEXT --> reveal  cursor(0,2)   [emitRevealSlide]
reveal  cursor(0,2) -- NEXT --> reveal  cursor(1,0)   [emitRevealSlide]
reveal  cursor(1,0) -- NEXT --> reveal  cursor(1,1)   [emitRevealSlide]
reveal  cursor(1,1) -- NEXT --> reveal  cursor(1,2)   [emitRevealSlide]
reveal  cursor(1,2) -- NEXT --> reveal  cursor(2,0)   [emitRevealSlide]
reveal  cursor(2,0) -- NEXT --> reveal  cursor(2,1)   [emitRevealSlide]
reveal  cursor(2,1) -- NEXT --> reveal  cursor(2,2)   [emitRevealSlide]
reveal  cursor(2,2) -- NEXT --> ended   cursor(2,2)   [broadcastState only — natural finish]

--- host presses PREV ---

ended   cursor(2,2) -- PREV --> reveal  cursor(2,1)   [state='reveal', cursor decremented, broadcastState, emitRevealSlide]
reveal  cursor(2,1) -- PREV --> reveal  cursor(2,0)   [broadcastState, emitRevealSlide]
reveal  cursor(2,0) -- PREV --> reveal  cursor(1,2)   [album boundary crossed, broadcastState, emitRevealSlide]

--- host presses NEXT again to the end ---

reveal  cursor(1,2) -- NEXT --> reveal  cursor(2,0)   [emitRevealSlide]
reveal  cursor(2,0) -- NEXT --> reveal  cursor(2,1)   [emitRevealSlide]
reveal  cursor(2,1) -- NEXT --> reveal  cursor(2,2)   [emitRevealSlide]
reveal  cursor(2,2) -- NEXT --> ended   cursor(2,2)   [broadcastState only — 'ended' set cleanly again]
```

---

## Edge cases verified

- **PREV at album 0, slide 0 (stepper):** state set to 'reveal', neither cursor branch fires (both conditions false), `broadcastState` + `emitRevealSlide` re-emit the current first slide. Cursor stays (0,0). No crash.
- **PREV at album 0 (frame-cycle/scrollback):** hits the new `else` branch — state restored, broadcastState + emitRevealAlbum re-emit album 0. Cursor stays at 0. No crash.
- **NEXT after prev re-entered 'reveal':** the `reveal:next` guard now passes for both 'reveal' and 'ended', so if state is 'reveal' (after a prev), next works normally and will set 'ended' again when it reaches the last position.
- **Gallery NEXT/PREV:** guard relaxed, state restored on prev, broadcastState fired. No cursor movement. No crash.
- **No other handlers touched.** `advancePhase`, `checkAllSubmitted`, `reveal:vote`, `phase:submit`, `game:reset` — all unchanged.
