# v2 Agent E — Done Report

## Files Modified

- `public/host.html` — additive edits only; no existing IDs touched
- `public/js/host.js` — extended; no existing event wiring removed

---

## HTML Elements Added

### Inside `#settings-panel`

| Element | ID | Notes |
|---|---|---|
| `<p>` | `#m-mode-description` | Always visible; below `#setting-mode` select |
| `<label>` wrapper | `#m-knockoff-show-wrap` | `hidden` by default; shown when mode=knockoff |
| `<input type="number">` | `#m-knockoff-show` | min=3 max=20 default=8 |
| `<label>` wrapper | `#m-master-prompt-wrap` | `hidden` by default; shown when mode=masterpiece or background |
| `<input type="text">` | `#m-master-prompt` | maxlength=300 |
| `<div>` wrapper | `#m-bg-picker-wrap` | `hidden` by default; shown when mode=background |
| `<div>` | `#m-bg-picker` | Filled dynamically by `loadBackgroundPicker()` |
| `<div>` wrapper | `#m-secret-order-wrap` | `hidden` by default; shown when mode=secret |
| `<ul>` | `#m-secret-order` | Filled dynamically by `renderSecretOrder()` |
| `<button>` | `#m-speedrun-btn` | Always visible; above `#start-game` |

### Inside `#phase-status`

| Element | ID | Notes |
|---|---|---|
| `<button>` | `#m-end-phase-btn` | `hidden` by default; shown when `currentPhase.name === 'masterpiece-draw'` |

---

## JS Hooks (host.js additions)

### Constants
- `MODE_DESCRIPTIONS` object — hardcoded description per mode (10 modes)
- `_bgLoaded` — boolean flag prevents double-fetch of `/api/backgrounds`
- `_currentPlayers` — module-level cache of latest player array; updated on every `room:state`

### Functions Added
- `applyModeSubPanels(mode)` — show/hide all conditional sub-panels; updates description; triggers background fetch or secret order render as needed
- `loadBackgroundPicker()` — async; fetches `/api/backgrounds`, renders `<button class="host__bg-thumb">` thumbnails; on failure renders "Backgrounds unavailable" message and resets `_bgLoaded` to allow retry
- `renderSecretOrder(players, seatOrder)` — renders reorderable `<li>` items with ▲/▼ arrow buttons + pointer-drag support; accepts optional seatOrder array for correct initial ordering
- `swapSecretOrder(fromIdx, toIdx)` — swaps two list items in DOM, emits `room:seatorder`, re-renders to refresh arrow disabled states
- `getSecretOrderedPlayers()` — reads current DOM order and returns player objects from `_currentPlayers`
- `emitSeatOrder()` — emits `room:seatorder` with current DOM order
- `attachSecretDrag()` — attaches `pointerdown/pointermove/pointerup/pointercancel` listeners to `#m-secret-order` for drag-to-reorder; uses `setPointerCapture` for touch; skips drag start if target is an arrow button
- `onMasterPromptInput()` — debounced (500ms) handler emitting `room:masterprompt`
- `getCurrentPlayers()` — returns `_currentPlayers` (used by `applyModeSubPanels`)

### Event Listeners Added
- `#m-master-prompt` `input` → `onMasterPromptInput()` (debounced `room:masterprompt`)
- `#m-knockoff-show` `change` → `room:settings` (full settings object via `readSettings()`)
- `#m-speedrun-btn` `click` → sets write=15, draw=30, describe=15, knockoffShow=4 in DOM + emits `room:settings`
- `#m-end-phase-btn` `click` → emits `phase:skip` (reuses existing v1 event)

### Modified Behaviour
- `settingMode` `change` → now also calls `applyModeSubPanels()` before `onSettingsChange()`
- `readSettings()` → now includes `knockoffShowSeconds: Number(mKnockoffShow.value)`
- `applyState()` → now also:
  - Populates `_currentPlayers`
  - Syncs `mKnockoffShow.value` from server settings
  - Calls `applyModeSubPanels()` after syncing settings in lobby
  - Syncs `mMasterPrompt.value` from `state.masterprompt` (only if value differs)
  - Calls `renderSecretOrder()` when in lobby and mode=secret
  - Highlights selected bg thumbnail when `state.backgroundId` is set
  - Shows/hides `#m-end-phase-btn` based on `currentPhase.name === 'masterpiece-draw'`
- `init()` → calls `applyModeSubPanels(settingMode.value)` immediately after setting up socket listeners

---

## Edge Cases Handled

1. **Background fetch failure** — `loadBackgroundPicker()` catches fetch errors and shows "Backgrounds unavailable" placeholder; resets `_bgLoaded = false` so next mode switch will retry.
2. **Rapid mode switches** — `_bgLoaded` flag prevents concurrent background fetches. Flag is set to `true` before the async fetch begins.
3. **Secret mode with no players yet** — `renderSecretOrder()` is guarded: only called if `players.length > 0`. If mode is switched to secret before any players join, the list stays empty and will be populated on the next `room:state` that arrives with players.
4. **Secret mode player join/leave** — `applyState()` calls `renderSecretOrder()` with fresh player list whenever state is lobby + mode=secret. Preserves seatOrder if server sends one.
5. **Master prompt sync loop** — `applyState` only updates `mMasterPrompt.value` if the new value differs from what's currently in the input, preventing mid-type overwrite.
6. **Drag on touch devices** — `setPointerCapture` on the `<li>` element ensures `pointermove` events are received even if the pointer leaves the element during fast swipes.
7. **Arrow buttons vs. drag** — `pointerdown` handler early-returns if `e.target.classList.contains('host__secret-arrow')`, so tapping an arrow button does not also initiate a drag.
8. **End Phase button hidden outside masterpiece-draw** — `mEndPhaseBtn.hidden` is set on every `room:state` update, so it correctly disappears if the phase advances past `masterpiece-draw`.
9. **Mode descriptions for unknown modes** — `MODE_DESCRIPTIONS[mode] || ''` falls back to empty string gracefully.
10. **knockoffShowSeconds not in readSettings previously** — now included; Speedrun preset and `#m-knockoff-show` change both emit the full settings object.

---

## Manual Test Instructions

### Prerequisite
Server running at localhost:3000. Open `/host/<code>` in browser.

### 1. Mode dropdown
- Open Settings section. Confirm all 10 modes appear in dropdown.
- Select each mode. Confirm description text updates below the select.

### 2. Mode sub-panels
- **Classic / Solo / Story / Animation / Co-Op / Missing Piece**: confirm no extra panels visible.
- **Knock-Off**: confirm "Knock-Off show seconds" field appears; other panels hidden.
- **Masterpiece**: confirm "Prompt for everyone" field appears; background picker hidden.
- **Background**: confirm both "Prompt for everyone" and background picker appear. Confirm thumbnails load (or "Backgrounds unavailable" if Agent A's `/api/backgrounds` is not yet live).
- **Secret**: confirm pass-order list appears with all joined players.

### 3. Speedrun preset
- Click SPEEDRUN PRESET. Confirm Write=15, Draw=30, Describe=45→15, Knock-Off show=4 in inputs.
- Check server receives `room:settings` with those values (check server logs or smoke tester).

### 4. Secret reorder
- Join 3+ players. Switch to Secret mode.
- Click ▲/▼ arrows. Confirm list reorders and server receives `room:seatorder`.
- Drag an item with mouse/finger. Confirm it repositions correctly.
- Confirm top item's ▲ is disabled; bottom item's ▼ is disabled.

### 5. Master prompt
- Switch to Masterpiece. Type in "Prompt for everyone" field. After 500ms, confirm `room:masterprompt` emitted.
- Switch to Background. Same test.
- Switch to Classic. Confirm field is hidden and no events emitted.

### 6. Background picker
- Switch to Background. Confirm thumbnails render from `/api/backgrounds`.
- Click a thumbnail. Confirm it gets `host__bg-thumb--selected` class and `room:background` is emitted.

### 7. End Phase button
- Start a game in Masterpiece mode.
- During `masterpiece-draw` phase, confirm END PHASE button appears in NOW PLAYING section.
- Click it. Confirm `phase:skip` is emitted and phase advances.
- In any other phase, confirm the button is hidden.

### 8. State sync on reconnect
- With mode=Secret and a custom seatOrder set, reload the page.
- Confirm mode, seatOrder, and masterprompt are correctly restored from `room:state`.
