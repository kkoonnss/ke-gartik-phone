# v2 Agent F — Theming for v1.1 Mode Screens

## Your scope
Extend the visual design system to cover all new UI elements introduced by v1.1: per-mode host sub-panels, the four new reveal layouts, the masterpiece no-timer banner, the missing-piece erased-rect ghost outline.

## Files you own (edit ONLY these)
- `public/css/styles.css` — extend (additive)
- `public/css/theme.css` — light additions only (new tokens if needed)

## Required reading
- `_Briefs/CONTRACT_v2.md` — section 11 (DOM IDs Agent E adds), section 8 (reveal layouts)
- Current `public/css/theme.css`, `public/css/styles.css` — preserve existing tokens + components

## Style targets

### Host page additions (per Agent E)

- `.host__mode-description` — small italic paragraph below the mode select, dim text, max ~3 lines
- `#m-master-prompt-wrap` field — same style as existing settings fields
- `#m-bg-picker` — flexbox row of thumbnails, wraps on narrow screens
- `.host__bg-thumb` — button with thumbnail image (~120x90), name label below, 2px border, hover lift
- `.host__bg-thumb--selected` — accent border (use `--accent`) and slight glow
- `#m-secret-order` — vertical list, each `<li>` is a row with emoji+name and ▲/▼ buttons on the right
- `.host__secret-order li` — soft background card, 2px border, drag-handle cursor
- `.host__field-label` — small uppercase tracking label, dim color
- `#m-speedrun-btn` — small ghost button, place at bottom of settings panel, optional pulse animation
- `#m-end-phase-btn` — danger-ish but not destructive: use `--accent-2` (hot pink) as background

### Player page additions (per Agent C — but C reuses existing screens, so styling needs only:)

- A "no time limit" banner inside the draw screen for masterpiece: subtle inset bar, message "No time limit — submit when ready"
- A "frame N/M" badge in the corner of the draw screen during animation (small pill, top-right)

Add a `.play__no-timer-banner` and `.play__frame-badge` classes that Agent C will optionally use.

### Reveal layout containers

- `.reveal-layout` — base class on each `#m-reveal-*` container, full width, padding
- `.reveal-layout--stepper` — current single-slide layout (no new CSS needed beyond what exists)
- `.reveal-layout--cycle` — frame-cycle layout
  - Main image area centered, ~720x540 max
  - Subtitle for animation prompt above
  - Frame counter pill below
- `.reveal-layout--gallery` — grid layout
  - CSS grid, `repeat(auto-fill, minmax(180px, 1fr))`
  - Each tile has a thumbnail image, author chip below
  - Hover: scale 1.02, glow
  - Click expands? (optional polish; Agent D may or may not implement)
- `.reveal-layout--scrollback` — vertical text column
  - Max-width 600px, centered
  - Each entry: author label dim above the sentence
  - Generous line-height, room to breathe
  - Optional: each sentence fades in as you scroll (CSS scroll-driven animation or just a subtle transform)

### Album standalone page additions
Reuse the same layout classes. The album page styles them inside `#album-root`.

### Animation reveal
- `.reveal-cycle__image` — the cycling frame image, has a subtle 4px white border to evoke film
- `.reveal-cycle__prompt` — above the image, the round-0 write text as a quoted caption
- `.reveal-cycle__counter` — pill below the image with "Frame 2 of 5"
- `.reveal-cycle__author` — current frame's author chip

### Gallery reveal
- `.reveal-gallery__tile` — drop shadow, 2px border
- `.reveal-gallery__author` — small chip at bottom of tile with color dot + name

### Scrollback reveal
- `.reveal-scroll__entry` — flex column, vertical spacing 1.5rem
- `.reveal-scroll__author` — small uppercase tracking label, dim
- `.reveal-scroll__text` — body text, bigger than usual (~1.25rem)

### Player list disconnected state polish
- `.host__player--disconnected` — already grey; add small italic "reconnecting…" via `::after { content: 'reconnecting' }` (optional polish)

## Tokens you may add to theme.css

```css
--reveal-tile-radius: 8px;
--reveal-shadow: 4px 4px 0 0 rgba(0,0,0,0.5);
--erase-ghost: rgba(255, 255, 255, 0.7);  /* if visualizing erased rects */
```

## Animations

- Speedrun button: subtle pulse (1s loop) via keyframes — respects `prefers-reduced-motion`
- Frame-cycle image transitions: opacity 0.95 → 1.0 quick fade between frames (handled by JS in Agent D, but the CSS transition lives here)
- Gallery hover scale: 150ms ease

## Definition of done

- All new host elements styled
- All four reveal layouts have appropriate CSS
- Existing v1 styles preserved
- Honor `prefers-reduced-motion`
- File ownership respected

## Report when done

Write `_Briefs/v2-agent-F-done.md` with: classes added, screenshots not required (we're remote-only), any tokens introduced.
