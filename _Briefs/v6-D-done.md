# v0.6 Agent D — done

File edited: `public/css/styles.css` (additive append only, no existing rules touched)

## Classes added

### Archive page container / navigation
- `.archive` — max-width 960px centred column, flex column, full-height
- `.archive__back` — small uppercase back link; accent on hover
- `.archive__grid` — responsive CSS grid (`auto-fill minmax(260px, 1fr)`)

### Game-night cards
- `.archive__card` — bg-elev, 2px --line border, --shadow-hard, hover lift translateY(-4px)
- `.archive__card-title` — bold uppercase display font for mode name
- `.archive__card-meta` — dim small text for date / player count / album count
- `.archive__card-meta .archive__code` — mono xdim room-code within meta
- `.archive__card-actions` — flex row, button + delete icon

### Card buttons
- `.archive__replay-btn` — primary accent (--accent yellow, black text, --shadow-accent, hover lift 6px)
- `.archive__delete` — 32px square ghost × button; --danger colour + bg tint on hover; cursor pointer

### Empty state
- `.archive__empty` — centred italic xdim text, generous padding

### Replay viewport
- `.archive__replay` — full-width bg-elev panel, --radius-lg border, fadeIn animation
- `.archive__replay-header` — flex row for counter + close
- `.archive__replay-counter` — dim uppercase tracking label
- `.archive__slide` — centred flex column, bg dark, 1.5px --line border, min-height 320px, fadeIn
- `.archive__slide img` — max 100%/480px, accent border + --shadow-accent
- `.archive__slide-text` — clamp(1.4rem→2.25rem) bold display text for text slides
- `.archive__slide-author` — pill chip matching album__author style
- `.archive__slide-pos` — dim uppercase slide position indicator

### Nav buttons
- `.archive__nav` — centred flex row with wrap
- `.archive__nav-btn` — ghost nav button (matches album__nav-btn pattern)
- `.archive__nav-btn--primary` — accent variant for primary direction

### Host link
- `.host__past-link` — 0.65rem uppercase xdim link; accent on hover; used in host header and/or lobby

## Tokens used
`--bg`, `--bg-elev`, `--ink`, `--ink-dim`, `--ink-xdim`, `--accent`, `--danger`, `--line`, `--line-2`, `--radius`, `--radius-sm`, `--radius-lg`, `--shadow-hard`, `--shadow-accent`, `--font-display`, `--font-body`, `--font-mono`, `--dur-fast`, `--dur-normal`, `--dur-slow`, `--ease-out`, `--sp-1` through `--sp-8`

## Motion
All hover transitions wrapped in `@media (prefers-reduced-motion: reduce)` block that disables transform/transition/animation on `.archive__card`, `.archive__replay-btn`, `.archive__delete`, `.archive__replay`, `.archive__slide`, `.archive__nav-btn`.
