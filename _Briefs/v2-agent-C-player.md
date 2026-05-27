# v2 Agent C — Player UI Extensions

## Your scope
Extend the player game UI to handle five new phase types: `continue`, `coop-draw`, `masterpiece-draw`, `missingpiece-draw`, `background-draw`. Wire the new `prevImage` and `eraseRect` fields from `phase:assignment`.

## Files you own (edit ONLY this file)
- `public/js/play.js`

## Required reading
- `_Briefs/CONTRACT_v2.md` — sections 3 (new phase names), 4 (phase:assignment payload), 8 (reveal layouts; player UI doesn't directly drive reveal but must handle "I'm a spectator now"), 9 (mode-specific spec for what each phase requires)
- Current `public/js/play.js` — existing phase handling pattern
- `public/play.html` — existing screens. **DO NOT EDIT.** Reuse existing screens where possible.

## What to add

### Screen reuse strategy

Reuse existing screens for new phases — do NOT add new HTML elements. Mapping:

| New phase | Screen used | Notes |
|---|---|---|
| `continue` | `#write-screen` | Show prev sentence as a faint subtitle above the textarea |
| `coop-draw` | `#draw-screen` | Pre-load canvas with `assignment.prevImage`; show prev describe text (if any) in `#draw-prompt-display` |
| `masterpiece-draw` | `#draw-screen` | Show master prompt in `#draw-prompt-display`; hide countdown (deadline is null); show a "no time limit — submit when ready" banner |
| `missingpiece-draw` | `#draw-screen` | Pre-load canvas with prevImage + apply eraseRect; show prev text in prompt-display only for round 1 |
| `background-draw` | `#draw-screen` | Pre-load canvas with prevImage (the background); show master prompt in prompt-display |

For `continue`, the previous sentence subtitle: insert a small element above the textarea (you can do this in JS by creating a `<div>` inside `#write-screen` above `#write-input`, or by setting `#write-prompt-label`'s text to "Previous: '…' / Continue the story:"). Keep it simple — set `#write-prompt-label` to e.g. `Previous: "{prevSlide.content}"` and the textarea placeholder hints at continuation.

### Assignment handling

When a `phase:assignment` arrives:

```js
const { phase, prevSlide, prevImage, eraseRect, deadline, meta } = assignment;
```

Render the appropriate screen, then:

1. If `prevImage` is provided AND phase is a draw phase (`coop-draw`, `missingpiece-draw`, `background-draw`):
   - Initialize canvas (if not already): `initCanvas(...)`
   - Await `canvasInstance.setStartImage(prevImage)`
   - If `eraseRect` is provided, call `canvasInstance.applyEraseRect(eraseRect)` after the load resolves

2. If `deadline` is null (Masterpiece):
   - Do NOT start `scheduleAutoSubmit`
   - Hide the countdown element
   - Show a hint: "No time limit — submit when you're done"
   - Submit only happens on button click

3. Otherwise: existing v1 behavior

### Submit handling

Map phase → submit content:
- `continue` → text from `#write-input`
- `coop-draw`, `missingpiece-draw`, `background-draw`, `masterpiece-draw` → JPEG data URI from canvas
- `draw` → unchanged

All submit phases call `emitAck('phase:submit', { phase, round, content })`.

### Reveal handling

When `room:state.state === 'reveal'` or `'ended'`:
- Show `#spectator-screen` with message like "Album reveal in progress — watch the host's screen"
- Do NOT try to render the reveal here; the host page or album page handles it
- This already works in v1; just ensure it still works for new modes

### Meta field

`assignment.meta` may carry mode-specific extras. For v1.1 the only producer is Animation:
```js
meta: { animationPrompt: '...', frameNumber: 2, totalFrames: 5 }
```
If `meta.frameNumber` is present, you can show a small "Frame 2/5" badge in the draw screen. Optional polish; skip if it adds complexity.

## Edge cases

- `prevImage` arrives but canvas isn't initialized yet — initialize first, then setStartImage
- `setStartImage` rejects (invalid data URI) — log to console, show error toast, fall back to blank canvas
- Player joins mid-phase (e.g., reconnect during a masterpiece-draw): server will re-emit phase:assignment to them on rejoin; handle gracefully
- Auto-submit handler must NOT fire for masterpiece-draw (deadline=null)

## Definition of done

- All five new phases render correctly using existing screens
- Canvas-init phases pre-load the image before the player can interact
- Masterpiece submit only on manual click; no auto-submit
- All existing v1 phases (write, draw, describe, knockoff-show, knockoff-draw) still work
- File ownership respected — only `play.js`

## Report when done

Write `_Briefs/v2-agent-C-done.md` with: phase handling table, edge cases hit, how to manually test each new phase.
