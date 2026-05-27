# FIX-C Completion Note — host.js polish (v0.3 sprint)

Agent: FIX-C
Date: 2026-05-26
File modified: public/js/host.js only

---

## M-7: Listeners moved inside init()

All event listeners that were wired at module top-level (original lines 406-462) have been
moved inside `init()`, immediately after the `emitAck('room:join', ...)` try/catch block
succeeds. The redirect guard (`if (!storedId)`) fires before we reach the listener-wiring
block, so no dead listeners are ever attached on a redirected page.

Listeners moved, in order (matching comment labels 1-7 in the code):

1. `mMasterPrompt` — `input` → debounced `room:masterprompt` emit
2. `mKnockoffShow` — `change` → `room:settings` emit
3. `mSpeedrunBtn` — `click` → speedrun preset values + `room:settings` emit
4. `mEndPhaseBtn` — `click` → `phase:skip` emit (Masterpiece forced advance)
5. `settingMode` — `change` → `applyModeSubPanels` + `room:settings` emit
   `settingWrite`, `settingDraw`, `settingDescribe` — `change` → `room:settings` emit
6. `startGameBtn` — `click` → `room:settings` then `game:start`
7. `skipPhaseBtn` — `click` → `phase:skip`

`onSettingsChange()` and `onMasterPromptInput()` remain as module-level named functions
(not inside init) because they are pure helpers with no closure over init-local state,
and defining them inside init() would make them inaccessible to the `onSettingsChange`
reference in `settingMode`'s handler. The actual `addEventListener` calls are all inside
init().

Socket listeners (`room:state`, `phase:tick`, `error`) were already inside init() and
were not moved.

---

## L-6: Secret drag listener leak fix

Approach chosen: **flag-guarded attach-once**.

Added module-level boolean `_secretDragAttached = false`.

In `attachSecretDrag()`, added early-return guard:

```js
if (_secretDragAttached) return;
_secretDragAttached = true;
```

The four pointer listeners (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`)
are attached to the stable `#m-secret-order` container element exactly once per page
load. `renderSecretOrder()` still calls `attachSecretDrag()` at the end of each render,
but after the first call it is a no-op. Re-rendering the list's children (innerHTML wipe
+ rebuild) does not remove the container-level listeners, so drag continues to work
correctly through repeated re-renders triggered by arrow-button swaps and drag-end
re-renders.

---

## Structural notes for FEAT-HOST

FEAT-HOST will add: vote tally display, custom prompts textarea, kick player buttons,
animation fps input.

The listener-wiring section inside init() is clearly delimited:

```
// --- M-7 fix: wire ALL event listeners here ...
// FEAT-HOST agent: add v2 listener wiring below item 7, before the closing comment.
...
// --- END listener wiring — FEAT-HOST: add v2 listeners above this line ---
```

Guidelines for FEAT-HOST:

1. New DOM refs go in the `// --- Agent E: new DOM refs ---` block at the top of the file.
   Follow the `mCamelCase` naming convention (`#m-*` id prefix → `m` + camelCase variable).

2. New emit helpers (debounced or plain) go as module-level named functions between
   `onMasterPromptInput` and `onSettingsChange` (just above the `// --- Entry point ---`
   comment).

3. New listeners go inside `init()` in the numbered block, as items 8, 9, etc. Add a
   comment label matching the pattern used for items 1-7.

4. The kick button listeners will be added dynamically inside `renderPlayers()` (one per
   non-host player), NOT in the static wiring block. They use `socket.emit('room:kick',
   { playerId })` with a `confirm()` guard per CONTRACT_v3 §10.

5. The animation fps input (`#m-animation-fps`) should only be visible when mode is
   `animation`. Add it to `applyModeSubPanels()` alongside the existing show/hide
   conditionals. Emit `room:animation-fps { fps }` on `change`.

6. `_secretDragAttached` resets to `false` if the page is ever navigated away and the
   module is re-evaluated — this is correct since the container would be a new element.
   There is no need to manually reset it.
