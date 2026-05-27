# FEAT-SND-CSS Completion Note — v0.3 Pass 2

Agent: FEAT-SND-CSS
Files edited: `public/js/sounds.js` (new), `public/css/styles.css` (additive), `public/css/theme.css` (additive)
Date: 2026-05-26

---

## sounds.js Exports

| Export | Signature | Description |
|---|---|---|
| `init` | `async () => void` | Calls `Tone.start()` — must be called inside a user gesture |
| `setEnabled` | `(bool) => void` | Sets enabled flag + persists to `localStorage('gartik.sound')` |
| `isEnabled` | `() => boolean` | Returns current enabled flag |
| `mountSoundToggle` | `(parentEl) => void` | Injects `.sound-toggle` checkbox UI into parentEl |
| `playPhaseStart` | `async () => void` | C5→E5 ascending chime, ~150ms |
| `playPhaseEnd` | `async () => void` | E5→C5 descending tone, ~200ms |
| `playSubmit` | `async () => void` | C6 confirm tone, ~80ms |
| `playReveal` | `async () => void` | C5→E5→G5 fanfare, ~500ms |
| `playVote` | `async () => void` | A4 soft pluck, ~100ms |
| `playKicked` | `async () => void` | A4→F4 descending sad tones, ~600ms |

Default: OFF. Reads `localStorage('gartik.sound') === 'on'` on module init.

CDN: `https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js`

Loading: Lazy — CDN `<script>` injected on first call to any play function. Cached via `_loadPromise`. If load fails, all play functions silently no-op.

---

## CSS Classes Added — grouped by domain

### Vote Panel (play.js injects into #spectator-screen)
- `.play__vote-panel` — dark card, padding, max-width 540px, top margin
- `.play__vote-title` — large bold uppercase title
- `.play__vote-album-info` — small uppercase dim subtitle
- `.play__vote-options` — flex wrap grid with gap
- `.play__vote-option` — clickable card; hover lift +translate; default unselected
- `.play__vote-option--system` — non-interactive variant, 55% opacity, no hover lift
- `.play__vote-option--selected` — accent border + glow ring + ✓ pseudo-element top-right
- `.play__vote-thumb` — img thumbnail, 4:3 aspect ratio
- `.play__vote-thumb--text` — text preview box, same aspect ratio, italic content
- `.play__vote-count` — vote count pill, bottom-right, accent color
- `.play__vote-author` — author name chip inside option
- `.play__vote-empty` — dim italic empty-state text

### Host Vote Tally Panel (#m-vote-tally, #m-vote-tally-body)
- `#m-vote-tally` — card style with border, padding, margin-top
- `.host__vote-tally-title` — small uppercase dim title with bottom border
- `.host__vote-tally-body` — flex column with gap

### Host Winners Gallery (#m-winners-gallery, #m-winners-gallery-body)
- `#m-winners-gallery` — card with accent border + subtle accent glow
- `.host__winners-gallery-title` — uppercase accent-colored title
- `.host__winners-gallery-body` — CSS grid auto-fill 160px columns
- `.album-winners__card` — card with image, hover lift + winner-glow shadow
- `.album-winners__card-author` — author label row
- `.album-winners__card-label` — "WINNER · N votes" accent uppercase label

### Album Vote Badges
- `.reveal-vote-badge` — inline pill, vote-badge-bg, accent border + text, monospace
- `.reveal-gallery__tile--winner` — accent border + winner-glow box-shadow; 🏆 pseudo top-right

### Host Player Kick Button
- `.host__player-kick` — small × button; 0.4 opacity default; danger color + border on hover; margin-left:auto pushes to row end

### Custom Prompts Textarea
- `#m-custom-prompts` — full-width, monospace font, 4-row min-height, dark BG, accent focus border
- `.host__field-hint` — small dim italic hint text

### Sound Toggle
- `.sound-toggle` — fixed bottom-right, pill shape, checkbox + "Sound" label, subtle styling

### Kicked Banner
- `#kicked-overlay` / `.kicked-banner` — fixed inset 0, z-index 99999, dark blurred backdrop, scale-in animation
- `.kicked-banner__title` / `#kicked-overlay .kicked-title` — large bold danger-colored title
- `.kicked-banner__reason` / `#kicked-overlay .kicked-reason` — body text, dim
- `.kicked-banner__countdown` / `#kicked-overlay .kicked-countdown` — large monospace countdown number

### Download Album Button
- `#album-download-btn` / `.album-download-btn` — primary accent-style button, overrides album.js inline styles via `!important` + ID selector

---

## CSS Tokens Introduced (theme.css)

| Token | Value | Used by |
|---|---|---|
| `--winner-glow` | `0 0 18px var(--accent)` | `.reveal-gallery__tile--winner`, `.album-winners__card:hover`, `#m-winners-gallery` |
| `--vote-badge-bg` | `rgba(255, 212, 0, 0.18)` | `.reveal-vote-badge`, `.play__vote-count` |

---

## Reduced Motion

All new animations/transitions wrapped in `@media (prefers-reduced-motion: reduce)` block at bottom of styles.css. Disables: vote option hover lift, winners card hover, kicked overlay scale animation, download button hover lift, sound toggle transition. Existing theme.css global `0.01ms !important` rule already handles most animations.

---

## Notes

- `sounds.js` is a pure ES module with no hard dependencies — `import('./sounds.js')` from `play.js`'s `tryPlaySound` helper works as designed.
- `album.js` uses inline `style.cssText` on `#album-download-btn`; CSS overrides use `!important` on the ID selector to win specificity.
- `voteBadgeHtml()` in album.js also emits inline styles on `.reveal-vote-badge`; the CSS rule adds semantic overrides but won't fully displace inline styles — this is acceptable (both produce consistent visual output).
- No HTML files were touched. No JS files other than new `sounds.js` were touched.
