# v2 Agent F — Theming Done

## Files modified
- `public/css/theme.css` — 3 new tokens added
- `public/css/styles.css` — ~280 lines of new CSS appended before the existing responsive block

---

## Tokens introduced (theme.css)

| Token | Value | Purpose |
|---|---|---|
| `--reveal-tile-radius` | `8px` | Gallery tile corner radius |
| `--reveal-shadow` | `4px 4px 0 0 rgba(0,0,0,0.5)` | Hard-offset shadow for reveal tiles and cycle image |
| `--erase-ghost` | `rgba(255,255,255,0.7)` | Reserved for Missing Piece erased-rect ghost outline visualizations |

---

## Classes added (styles.css)

### Host page
| Selector | Notes |
|---|---|
| `.host__mode-description` | Italic dim paragraph, 3-line clamp |
| `.host__field-label` | Uppercase tracking label, xdim color |
| `#m-bg-picker` | Flex-wrap row container for thumbs |
| `.host__bg-thumb` | 120x90 thumbnail button with label, hover lift |
| `.host__bg-thumb--selected` | Accent border + glow via color-mix |
| `#m-secret-order` | Flex column list container |
| `.host__secret-order li` | Card row with drag-handle cursor, up/down order buttons styled via `.order-btn` child |
| `#m-speedrun-btn` | Ghost button, 2s `speedrunPulse` opacity loop |
| `#m-end-phase-btn` | Hot-pink (`--accent-2`) button with hard offset shadow |
| `.host__player--disconnected` | Grey + italic "reconnecting…" via `::after` |

### Player page
| Selector | Notes |
|---|---|
| `.play__no-timer-banner` | Subtle green-tinted inset bar "No time limit — submit when ready" |
| `.play__frame-badge` | Absolute-positioned top-right pill, monospaced "Frame N/M" |

### Reveal layout containers
| Selector | Notes |
|---|---|
| `.reveal-layout` | Base: full-width, padding, fadeIn animation |
| `.reveal-layout--stepper` | Placeholder rule (no extra styles needed) |
| `.reveal-layout--cycle` | Centered column for frame-cycle |
| `.reveal-layout--gallery` | Flex column wrapper |
| `.reveal-layout--scrollback` | Centered column, max 600px |

### Frame-cycle (`.reveal-layout--cycle`)
| Selector | Notes |
|---|---|
| `.reveal-cycle__prompt` | Quoted italic caption above image |
| `.reveal-cycle__image` | 4px white film border, opacity transition for JS frame swap |
| `.reveal-cycle__image.is-transitioning` | opacity 0.95 (JS adds/removes this class) |
| `.reveal-cycle__counter` | Pill below image, monospaced |
| `.reveal-cycle__author` | Author chip with color dot |

### Gallery (`.reveal-layout--gallery`)
| Selector | Notes |
|---|---|
| `.reveal-gallery__grid` | CSS grid `repeat(auto-fill, minmax(180px, 1fr))` |
| `.reveal-gallery__tile` | Drop shadow, 2px border, hover scale 1.02 + accent glow |
| `.reveal-gallery__author` | Small chip at tile bottom, color dot + name |

### Scrollback (`.reveal-layout--scrollback`)
| Selector | Notes |
|---|---|
| `.reveal-scroll__list` | Inner column, max-width 600px |
| `.reveal-scroll__entry` | Card with staggered fade-in entrance (nth-child up to 8, then caps) |
| `.reveal-scroll__author` | Uppercase dim tracking label |
| `.reveal-scroll__text` | 1.25rem body, 1.7 line-height |

### Keyframes added
| Name | Purpose |
|---|---|
| `speedrunPulse` | Opacity 1 → 0.55 → 1 over 2s for #m-speedrun-btn |
| `scrollEntryIn` | opacity 0 + translateY(8px) → visible for scrollback entries |

---

## prefers-reduced-motion
All new animations (`speedrunPulse`, `scrollEntryIn`, `.reveal-cycle__image` transition, gallery hover) are explicitly disabled in the `@media (prefers-reduced-motion: reduce)` block appended to styles.css, supplementing the global collapse already in theme.css.

---

## Manual verification steps

1. **Host page — settings panel**
   - Select "Background" mode: `#m-bg-picker` should show a flex-wrap row of `.host__bg-thumb` buttons. Clicking one should get `--selected` class applied by Agent E's JS.
   - Select "Secret" mode: `#m-secret-order` should show player rows with ▲/▼ buttons and drag-grab cursor.
   - Verify `#m-mode-description` renders as small italic dim text below the mode `<select>`.
   - Verify `#m-speedrun-btn` is visible and gently pulses. Confirm it stops pulsing if `prefers-reduced-motion` is set in OS.

2. **Host page — phase panel**
   - Start a Masterpiece game. Confirm `#m-end-phase-btn` appears in hot-pink with hard shadow.

3. **Player page — draw screen**
   - Join an Animation game. Confirm `.play__frame-badge` appears top-right of the canvas wrapper.
   - Join a Masterpiece game. Confirm `.play__no-timer-banner` appears below the prompt, green-tinted.

4. **Reveal — frame-cycle (Animation mode)**
   - Start and complete an Animation game, enter reveal.
   - `#m-reveal-cycle` should be visible with the quoted prompt caption above, white-bordered image, frame counter pill below, author chip.

5. **Reveal — gallery (Masterpiece/Background/Solo)**
   - Enter reveal for these modes.
   - `#m-reveal-gallery` should show a responsive grid of tiles. Hover a tile — confirm scale(1.02) and accent border glow. Confirm `--reveal-tile-radius` is applied to tile corners.

6. **Reveal — scrollback (Story)**
   - Enter reveal for Story mode.
   - `#m-reveal-scrollback` should show a centered 600px column of entry cards, each with dim author label and 1.25rem body text. On first load, entries should stagger-fade in.

7. **Reduced motion**
   - Enable "Reduce motion" in OS accessibility settings. Reload.
   - Speedrun button: no pulse. Scrollback entries: no stagger, instantly visible. Gallery hover: no transition. Cycle image: no opacity transition.

8. **Existing styles preserved**
   - Lobby, host, play, and album pages at v1 states should look identical to before this change.
