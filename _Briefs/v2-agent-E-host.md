# v2 Agent E — Host UI Extensions

## Your scope
Add 8 new modes to the mode dropdown, add conditional per-mode sub-panels (Secret reorder, Masterpiece/Background prompt input, Background picker, knockoffShowSeconds input, Speedrun preset button, End Phase button for Masterpiece), wire new client→server events.

## Files you own
- `public/js/host.js` — main extensions
- `public/host.html` — you MAY add new elements inside `#settings-panel` AND inside `#phase-status`. Follow the `#m-*` naming convention in CONTRACT_v2 §11. DO NOT touch existing IDs.

## Required reading
- `_Briefs/CONTRACT_v2.md` — sections 5 (new client events), 7 (room:state additions), 11 (DOM IDs), 13 (validation caps)
- Current `public/js/host.js`
- Current `public/host.html` — note the existing `#settings-panel`, `#phase-status`, `#reveal-panel` sections

## What to add

### 1. Mode dropdown expansion

In `host.html`, modify `#setting-mode` to include all 11 modes:

```html
<select id="setting-mode">
  <option value="classic">Classic</option>
  <option value="knockoff">Knock-Off</option>
  <option value="solo">Solo Prompts</option>
  <option value="story">Story</option>
  <option value="animation">Animation</option>
  <option value="coop">Co-Op</option>
  <option value="masterpiece">Masterpiece</option>
  <option value="missingpiece">Missing Piece</option>
  <option value="background">Background</option>
  <option value="secret">Secret</option>
</select>
```

Below the select, add a description paragraph:
```html
<p id="m-mode-description" class="host__mode-description"></p>
```

### 2. Conditional sub-panels

Add inside `#settings-panel` after the existing fields:

```html
<!-- Knock-Off only -->
<label class="host__field" id="m-knockoff-show-wrap" hidden>
  <span>Knock-Off show seconds</span>
  <input id="m-knockoff-show" type="number" min="3" max="20" value="8" />
</label>

<!-- Masterpiece + Background -->
<label class="host__field" id="m-master-prompt-wrap" hidden>
  <span>Prompt for everyone</span>
  <input id="m-master-prompt" type="text" maxlength="300" placeholder="e.g., A Cinema 4D mascot" />
</label>

<!-- Background only -->
<div id="m-bg-picker-wrap" hidden>
  <div class="host__field-label">Background</div>
  <div id="m-bg-picker" class="host__bg-picker"></div>
</div>

<!-- Secret only -->
<div id="m-secret-order-wrap" hidden>
  <div class="host__field-label">Pass order (drag to reorder)</div>
  <ul id="m-secret-order" class="host__secret-order"></ul>
</div>

<!-- Speedrun preset (always visible) -->
<button id="m-speedrun-btn" class="host__button host__button--ghost" type="button">SPEEDRUN PRESET</button>
```

Inside `#phase-status`, add:
```html
<button id="m-end-phase-btn" class="host__button host__button--primary" type="button" hidden>END PHASE</button>
```

### 3. Mode-change behavior (`host.js`)

Listen for mode-select change. Based on selected mode:
- Show/hide `#m-knockoff-show-wrap` (only knockoff)
- Show/hide `#m-master-prompt-wrap` (masterpiece + background)
- Show/hide `#m-bg-picker-wrap` (only background)
- Show/hide `#m-secret-order-wrap` (only secret)
- Update `#m-mode-description` with a hardcoded description per mode (you provide the text)
- On mode change, also emit `room:settings` with the current mode

### 4. Description text (hardcode in host.js)

```js
const MODE_DESCRIPTIONS = {
  classic: 'The original. Write a sentence, then draw and describe in rotation. See how mangled your prompt gets.',
  knockoff: "Each round you see the previous drawing for a few seconds, then redraw it from memory. Degradation guaranteed.",
  solo: "Everyone draws the same prompt at the same time. Single album, side-by-side reveal.",
  story: "Text-only chain. You see only the previous sentence and write the next. The full story unfolds at reveal.",
  animation: "Each player adds one frame to a tiny animation. Frames loop at the reveal — a flipbook made by committee.",
  coop: "Pass an unfinished drawing — each player continues the previous instead of starting over.",
  masterpiece: "No timer, one drawing per player to a shared prompt. Take your time. Reveal is a gallery.",
  missingpiece: "Draw a sentence, then each round a chunk of the drawing gets erased and the next player fills it back in. Drift incoming.",
  background: "Everyone draws on the same shared background image. Reveal shows them side by side.",
  secret: "Like Classic, but the host sets the pass order instead of going around the room.",
};
```

### 5. Background picker

On mode=background, fetch backgrounds from `GET /api/backgrounds`:

```js
const resp = await fetch('/api/backgrounds');
const { backgrounds } = await resp.json();
```

Render as clickable thumbnails inside `#m-bg-picker`:
```js
backgrounds.forEach(bg => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'host__bg-thumb';
  btn.dataset.bgId = bg.id;
  btn.innerHTML = `<img src="${bg.dataUri}" alt="${bg.name}"><span>${bg.name}</span>`;
  btn.addEventListener('click', () => {
    document.querySelectorAll('.host__bg-thumb').forEach(b => b.classList.remove('host__bg-thumb--selected'));
    btn.classList.add('host__bg-thumb--selected');
    socket.emit('room:background', { backgroundId: bg.id });
  });
  document.getElementById('m-bg-picker').appendChild(btn);
});
```

### 6. Secret-order reorder UI

When mode=secret, render the player list in `#m-secret-order` as a reorderable list. Implementation:
- Each player is a `<li>` with their emoji + name + a "▲" / "▼" button on each side
- On click of ▲: swap with previous; on click of ▼: swap with next
- Optionally support drag-to-reorder via pointer events. Up/down buttons must work as accessible fallback either way.
- After any reorder, emit `room:seatorder` with the current order's player IDs

Listen to `room:state` to keep the list in sync when players join/leave during lobby.

### 7. Master prompt input

When mode=masterpiece or background, the input `#m-master-prompt` is visible. On `input` event (debounced to 500ms), emit:
```js
socket.emit('room:masterprompt', { prompt: inputEl.value.slice(0, 300) });
```

### 8. Knock-Off show seconds

When mode=knockoff, `#m-knockoff-show` is visible. On change, fold it into the settings emit:
```js
socket.emit('room:settings', { ...settings, knockoffShowSeconds: Number(input.value) });
```

### 9. Speedrun preset button

Always visible. On click:
```js
settingWrite.value = 15;
settingDraw.value = 30;
settingDescribe.value = 15;
document.getElementById('m-knockoff-show').value = 4;
socket.emit('room:settings', {
  mode: settingMode.value,  // keep current mode
  writeSeconds: 15,
  drawSeconds: 30,
  describeSeconds: 15,
  knockoffShowSeconds: 4,
});
```

### 10. End Phase button (Masterpiece)

`#m-end-phase-btn` is added inside `#phase-status`. Show it when `room:state.currentPhase.name === 'masterpiece-draw'`. On click: `socket.emit('phase:skip')`. Reuse the existing `phase:skip` event.

### 11. Initial state sync

On page load and on every `room:state`:
- Set the mode select to `state.settings.mode`
- Set `#m-master-prompt.value` to `state.masterprompt || ''`
- If `state.backgroundId`, highlight that thumbnail
- If `state.seatOrder`, render the secret-order list in that order
- Trigger mode-change to show/hide the right sub-panels

## Edge cases

- Mode change after players already joined: keep player order; don't reset.
- Background picker fetch fails: show "Backgrounds unavailable" placeholder.
- Reorder UI on touch devices: must work with finger taps (use pointerdown/up).
- Master prompt for non-masterpiece/background modes: input is hidden so its value doesn't leak.

## Definition of done

- All 11 modes selectable
- Each mode shows the correct sub-panels
- Speedrun preset sets timers in one click
- Secret reorder UI works with up/down arrows
- Background picker shows thumbnails and selects one
- Master prompt is editable for the right modes
- End Phase button appears during Masterpiece
- File ownership respected — only `host.js` and `host.html` (additive edits only)

## Report when done

Write `_Briefs/v2-agent-E-done.md` with: HTML additions, JS hooks, any contract clarifications needed.
