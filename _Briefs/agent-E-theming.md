# Agent E — Monday Meeting Theming

## Your scope
Build the visual identity. Monday Meeting is a motion design / animation / VFX community with a bold, uppercase, dark-mode aesthetic. The wordmark is heavy sans-serif "MONDAY MEETING" stacked or single-line. Their site lives at mondaymeeting.org. Their community lives on Discord/Patreon and serves motion designers.

This is a party game, so the styling should feel **fun, bold, motion-design-friendly, and slightly playful**, not corporate.

## Files you own (write ONLY these)
- `public/css/theme.css` — design tokens + global resets + typography
- `public/css/styles.css` — component styles for all four pages
- `public/assets/` — any logos, backgrounds, favicons you create as inline SVG files

## Pre-written files you target
- All four HTML files. Classes are listed under "DOM Element ID Map" in `_Briefs/CONTRACT.md` for each page.

## Required reading
- `_Briefs/CONTRACT.md` — every class name you must style is listed there
- `_Briefs/ke-gartik-phone-scope.md`

## Design direction

### Aesthetic
- **Dark mode default**. Background: deep near-black with a subtle motion-design hint (e.g., a faint grid or noise SVG overlay).
- **Bold uppercase typography**. Use a heavy geometric sans-serif. Suggested: Space Grotesk 700 + Inter 500. Load from Google Fonts via CSS `@import` or `<link>` (you'll add the import to `theme.css`).
- **Accent palette**: a confident primary (suggest a punchy yellow `#FFD400` or hot pink `#FF2E63`) plus the per-player palette from CONTRACT.
- Generous whitespace, big chunky buttons, sharp 2px borders, no shadows OR a single hard offset shadow (motion-design feel).
- Subtle motion: button hover slides, countdown number ticks, screen-transition fades.

### Tokens (define in `theme.css`)
```css
:root {
  --bg: #0b0b0f;
  --bg-elev: #14141c;
  --ink: #f5f5f7;
  --ink-dim: #9a9aa8;
  --accent: #FFD400;       /* feel free to refine — keep it bold */
  --accent-2: #FF2E63;
  --danger: #ff4d6d;
  --success: #00d68f;
  --line: #2a2a36;
  --radius: 14px;
  --font-display: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
}
```
You may tune any of these — they're starting points.

### Logo
- Inline SVG wordmark "MONDAY MEETING" as a heavy uppercase lockup. Save as `public/assets/logo.svg`. Used at top of host page and lobby.
- A small icon mark (3 stacked horizontal lines + a circle, evoking a meeting agenda + a play button) for favicon. Save as `public/assets/favicon.svg`. Link it in all four HTML files via a CSS `@page` trick OR add the link tag yourself — actually you can NOT edit HTML, so produce just the SVG and the orchestrator will wire it.

### Page-specific styling

**Lobby (`.lobby`)**
- Center card on dark BG with subtle grid overlay
- `.lobby__title` huge stacked uppercase, accent color
- `.lobby__subtitle` thin uppercase tracking
- Forms vertical, large rounded inputs
- Primary button: filled with `--accent`, black text, bold uppercase
- Secondary: outlined

**Host (`.host`)**
- Two-column or grid layout (left: QR + code, right: players + settings/phase/reveal)
- `.host__code` HUGE display, monospace or display sans, 80-100px desktop
- QR image at ~256-320px with crisp white background card (QR codes need white)
- Player chips with their assigned color dot

**Play (`.play`)**
- Mobile-first. Full-height screens, big touch targets.
- `.play__countdown` large pill in upper-right with accent color
- `.play__btn--primary` thumb-friendly (min 48px tall, full-width on small screens)
- Canvas wrap with thick accent border
- Toolbar: horizontal row of color swatches + brush sizes + undo/clear icons. Sticky bottom on mobile.
- `.play__textarea` large, dark, big legible font

**Album (`.album`)**
- Clean playback view, similar dark aesthetic
- Image/text fills the slide area with author chip at the bottom

### Animation/motion touches
- Buttons: hover lifts (translateY -2px), 120ms ease
- Phase transitions: fade in (200ms) for sections being unhidden — you can do this with a CSS class added/removed via `[hidden]` attribute transitions
- Countdown urgency: when countdown < 10s, pulse red

## Required: Inline-SVG noise/grid background
A faint repeating grid SVG as `data-uri` in `--bg` body, or a tiled background image — your call. Keep it subtle (5-10% opacity max).

## Implementation notes
- All styles in two files. No preprocessor.
- Use modern CSS (custom properties, grid, flexbox, `clamp()`, `:has()` ok).
- Honor `prefers-reduced-motion`.
- Aim for legibility first; flourishes second.

## Definition of done
- All four pages render in a recognizably Monday-Meeting-flavored dark mode with bold uppercase typography
- Lobby looks like an invite to a creative gathering
- Host page reads as a control room
- Play screens are mobile-first and legible at arm's length
- File ownership respected — only the three files/folders listed

## Report when done
Write `_Briefs/agent-E-done.md` with: files written, font sources used, palette finalized.
