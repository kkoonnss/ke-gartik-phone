# v2 Agent D — Done

## Layouts Implemented

| Layout | Trigger | Host Nav | Standalone Nav |
|---|---|---|---|
| stepper | reveal:slide | slide-by-slide (reveal:next/prev) | slide-by-slide (album-next/prev) |
| frame-cycle | reveal:album | album-by-album | album-by-album; frames auto-cycle at 3fps |
| gallery | reveal:album | no-op (host fires reveal:next/prev harmlessly) | album-by-album |
| scrollback | reveal:album | album-by-album | album-by-album |

## New Socket Events Handled

- `reveal:album` — new listener on host page routes to frame-cycle / gallery / scrollback renderer based on `currentLayout`. Buffered if `room:state.revealLayout` hasn't arrived yet.
- `room:state` — now also reads `state.revealLayout` to determine which layout container to activate.
- `reveal:slide` — unchanged; guarded with `if (currentLayout !== 'stepper') return`.

## Dynamic DOM Created

`ensureRevealContainers(parentEl)` is called at init time on both pages:

- Host page: `ensureRevealContainers(document.getElementById('reveal-panel'))`
- Album page: `ensureRevealContainers(document.getElementById('album-root'))`

The helper creates any of the four containers that Agent E hasn't added yet:

| ID | Class | Role |
|---|---|---|
| `#m-reveal-stepper` | `reveal-layout reveal-layout--stepper` | Stepper container (wraps existing stepper if Agent E adds it; otherwise stepper uses legacy elements directly) |
| `#m-reveal-cycle` | `reveal-layout reveal-layout--cycle` | Frame-cycle container |
| `#m-reveal-gallery` | `reveal-layout reveal-layout--gallery` | Gallery container |
| `#m-reveal-scrollback` | `reveal-layout reveal-layout--scrollback` | Scrollback container |

All four start `hidden = true`; `activateLayout(name)` shows the matching one and hides the others.

## CSS Classes Emitted (for Agent F to style)

- `.reveal-layout`, `.reveal-layout--stepper`, `.reveal-layout--cycle`, `.reveal-layout--gallery`, `.reveal-layout--scrollback`
- `.reveal-cycle__prompt`, `.reveal-cycle__frame-wrap`, `.reveal-cycle__img`, `.reveal-cycle__frame-info`, `.reveal-cycle__frame-counter`, `.reveal-cycle__author-chip`, `.reveal-cycle__album-pos`, `.reveal-cycle__empty`
- `.gallery__prompt`, `.album-gallery`, `.gallery-tile`, `.gallery-tile__img`, `.gallery-tile__blank`, `.gallery-tile__author`
- `.scrollback__header`, `.scrollback__column`, `.scrollback-entry`, `.scrollback-entry__author`, `.scrollback-entry__text`, `.scrollback__empty`

## Edge Cases Handled

- `reveal:album` before `room:state.revealLayout` known: buffered in `_pendingAlbumPayload`, applied on next `room:state`.
- Layout switch mid-game: `clearCycleInterval()` called, cursors reset.
- Frame-cycle interval cleared on: album switch, reveal:album, page `beforeunload`, reveal panel hidden (state leaves reveal).
- Empty slide content `''`: shows `[blank]` placeholder in all layouts.
- Agent E containers absent: created dynamically by `ensureRevealContainers`.

## Manual Test Instructions

### Stepper (Classic / Knock-Off / Co-Op / Missing Piece / Secret)

1. Start a Classic game with 2+ players, complete all phases.
2. Host page: ALBUM REVEAL panel appears; NEXT/PREV step slide-by-slide. Arrow keys also work.
3. Album page (`/album/XXXX`): NEXT/PREV steps slide-by-slide through all albums.
4. Confirm `revealLayout` in `room:state` is `'stepper'` (browser devtools network tab → WS).

### Frame-Cycle (Animation)

1. Start an Animation game with 2+ players, complete write + all draw phases.
2. Host page: `reveal:album` arrives; `#m-reveal-cycle` becomes visible. Frames should cycle at ~3fps automatically. Animation prompt text shown above. "Frame N / M" counter updates. Album position shown.
3. NEXT/PREV advance to the next album; cycle restarts from frame 1.
4. Album page: identical auto-cycling per album; NEXT/PREV switch albums.
5. Confirm no interval leak: switch albums, check old interval is cleared (no double-speed cycling).

### Gallery (Solo / Masterpiece / Background)

1. Start a Masterpiece (or Solo/Background) game; complete draw phase.
2. Host page: `reveal:album` arrives; `#m-reveal-gallery` becomes visible. All drawings shown in a responsive grid (`.album-gallery`). Master prompt shown at top if present.
3. NEXT/PREV do nothing (server no-ops them for gallery; host fires harmlessly).
4. Album page: grid renders for each album; NEXT/PREV switch albums.

### Scrollback (Story)

1. Start a Story game with 2+ players, complete write + all continue phases.
2. Host page: `reveal:album` arrives; `#m-reveal-scrollback` becomes visible. Full text column shown with faint author labels. "Album X / Y" header at top.
3. NEXT/PREV advance album-by-album; scroll resets to top on each new album.
4. Album page: same column view; NEXT/PREV switch albums.

## Files Modified

- `public/js/album.js` — only file touched (per contract section 1).
