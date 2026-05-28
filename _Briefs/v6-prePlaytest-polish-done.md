# v6 Pre-Playtest Polish — Fix Log

Date: 2026-05-27

## FIX 1 — Custom prompts textarea visibility (host.js)

File: `public/js/host.js`
Function: `applyModeSubPanels(mode)`

Line added immediately after the existing `mAnimationFpsWrap` toggle:

```js
if (mCustomPromptsWrap) mCustomPromptsWrap.hidden = (mode !== 'solo' && mode !== 'masterpiece' && mode !== 'background');
```

Pattern used: matches how all other conditional sub-panels are toggled in the same function (guard-null + `.hidden = boolean expression`). `mCustomPromptsWrap` was already captured at line 50 as `document.getElementById('m-custom-prompts-wrap')`.

Modes that show the textarea: `solo`, `masterpiece`, `background`.
All other modes hide it.

---

## FIX 2 — Secret reorder list BEM styles (styles.css)

Class names confirmed by reading `renderSecretOrder()` and `attachSecretDrag()` in host.js (lines 340–454):

| Class emitted by JS | Usage |
|---|---|
| `.host__secret-item` | `li.className = 'host__secret-item'` — each row |
| `.host__secret-arrow` | `upBtn.className = 'host__secret-arrow'` / `downBtn.className = 'host__secret-arrow'` |
| `.host__secret-label` | `label.className = 'host__secret-label'` |
| `.host__secret-item--dragging` | `li.classList.add('host__secret-item--dragging')` on pointerdown |

CSS added (inserted just before the existing `#m-speedrun-btn` block to stay grouped with secret-order styles):

- `.host__secret-item` — flex row, `var(--bg-elev)` bg, `var(--line-2)` border, `var(--radius-sm)`, gap, grab cursor, transition
- `.host__secret-item:hover` — `var(--bg-elev-2)` bg, `var(--ink-xdim)` border
- `.host__secret-arrow` — 26×26px ghost button, accent color + tinted bg on hover, `opacity:0.3 + pointer-events:none` on `:disabled`
- `.host__secret-label` — `flex:1`, ellipsis overflow, `var(--ink)` color
- `.host__secret-item--dragging` — `opacity:0.55`, 2px `var(--accent)` outline

Old `.host__secret-order li` rules kept untouched (additive only).

---

## FIX 3 — Draw banner styles (styles.css)

Class names confirmed by reading `injectDrawBanner()` in play.js (lines 526–535, 891–897):

| Class emitted by JS | Context |
|---|---|
| `play__draw-banner` | Default class for any draw banner; also the base class always present on no-limit banners |
| `play__draw-banner--no-limit` | Applied alongside base for masterpiece "no time limit" messages |

CSS added at end of file (after `.archive__slide-text`):

- `.play__draw-banner` — full-width inset bar, `var(--bg-elev)` with 10% `var(--ink-xdim)` tint, `var(--ink-dim)` text, `var(--radius-sm)`, centered, 0.8rem
- `.play__draw-banner--no-limit` — overrides bg/border/color to green (`var(--accent-3)` = `#00d68f`)
- `@media (prefers-reduced-motion: reduce)` — disables `transition` on `.play__draw-banner`

Aesthetic matches existing `.play__no-timer-banner` (lines 1294–1306) which uses the same `color-mix` + `var(--accent-3)` pattern.
