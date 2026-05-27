# v2 Agent G — Done Report

## Files Written

- `server/backgrounds.js` (new)
- `server/prompts.js` (extended)

---

## Backgrounds Catalogue

| id | name | SVG approach | Estimated dataUri length |
|---|---|---|---|
| blank-white | Blank White | 1 rect #ffffff | ~220 bytes |
| blank-black | Blank Black | 1 rect #0b0b0f | ~220 bytes |
| grid-light | Grid (Light) | 30 `<line>` elements (17 vertical + 13 horizontal), #e0e0e0 on white | ~4 KB |
| grid-dots | Dot Grid | 252 `<circle>` elements (18×14 grid), r=3 #cccccc on white | ~15 KB |
| zoom-grid | Zoom Grid Mockup | 9 cells × (dark rect + camera body rect + 2 lens circles) = 36 elements | ~7 KB |
| color-bars | TV Color Bars | 8 `<rect>` bars (white/yellow/cyan/green/magenta/red/blue/black) | ~800 bytes |
| spotlight | Spotlight | radialGradient #ffe066→#0b0b0f + 2 rects | ~600 bytes |
| film-frame | Film Frame | black bg + white center + 16 sprocket holes (8 per side) | ~3 KB |

All 8 backgrounds are 720×540 SVG data URIs encoded as `data:image/svg+xml;utf8,<encodeURIComponent>`. All estimated well under 50KB.

---

## Prompt Deck Counts

| Export | Count |
|---|---|
| PROMPTS (existing, preserved) | 30 |
| MASTERPIECE_PROMPTS | 20 |
| ANIMATION_PROMPTS | 15 |
| BACKGROUND_PROMPTS | 10 |

`pickRandom(deckName)` helper exported — accepts any of the four deck names, falls back to PROMPTS for unknown keys.

---

## Notes

- `server/backgrounds.js` builds SVG strings programmatically at module load time (IIFE closures for grid/dots/zoom). No runtime overhead on requests.
- The dead IIFE stub on line 27-29 of backgrounds.js (comment-only block) is harmless; module loads cleanly.
- `getById(id)` does a linear scan of the 8-element array — trivially fast.
- CONTRACT_v2 section 6 calls the field `backgrounds` in the JSON response; Agent A maps `BACKGROUNDS` from this module to that key in the REST handler.
- The `pickRandom` implementation uses an explicit `decks` lookup object (not `this`) so it works correctly whether called as a method or standalone.
