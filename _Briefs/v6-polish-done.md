# v0.6 CSS Polish — Done

Date: 2026-05-27
Agent: CSS Polish (Sonnet)

## Files edited

- `public/css/styles.css` — additive only; new rules inserted between `.archive__slide-pos` and the `v0.6 HOST__PAST-LINK` section
- `public/past.html` — one-line fix for double-.archive (see below)

## Classes added to styles.css

| Class | What it does |
|---|---|
| `.archive__header` | Flex row, space-between, wraps on small screens; border-bottom separates it from content |
| `.archive__title` | Fluid display heading (clamp 1.1–1.5rem), bold, uppercase, letter-spacing 0.08em, `var(--ink)` |
| `.archive__main` | Column flex with `gap: var(--sp-5)`, inherits width from body.archive |
| `.archive__nav-label` | 0.68rem dim uppercase mono counter; `flex:1` so it fills space between prev/next buttons |
| `.archive__slide-img` | `max-width:100%`, `max-height:60vh`, `object-fit:contain`, centered with `margin:0 auto`; accent border + shadow matching `.archive__slide img` |
| `.archive__card-meta-mode` | Bold `var(--accent)` display text — primary label on each card |
| `.archive__card-meta-date` | 0.75rem `var(--ink-xdim)` — dim secondary |
| `.archive__card-meta-counts` | 0.75rem `var(--ink-dim)` — dim secondary |

A `prefers-reduced-motion` block explicitly zeroes transitions on `.archive__card`, `.archive__replay-btn`, `.archive__delete`, `.archive__nav-btn` (theme.css already covers all `*`, but this makes intent explicit for archive-specific transitions).

## Double-.archive fix

**Resolution: option (a)** — removed `class="archive"` from `#archive-list` in `past.html`.

Verification: `past.js` targets the list exclusively via `document.getElementById('archive-list')` (lines 10–12) — it never queries by `.archive` class. The `.archive` styling (max-width, padding, flex column) is correctly applied only to `body.archive`; `#archive-list` inherits layout as a flex child and needs no container class of its own.
