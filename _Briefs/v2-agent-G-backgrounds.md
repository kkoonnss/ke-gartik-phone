# v2 Agent G — Backgrounds + Prompts

## Your scope
Build a catalogue of 8 stock backgrounds for Background mode. Extend the prompts deck with mode-specific banks.

## Files you own (write ONLY these)
- `server/backgrounds.js` (new)
- `server/prompts.js` (extend — preserve existing `PROMPTS` export, add new exports)

## Required reading
- `_Briefs/CONTRACT_v2.md` — section 6 (REST endpoints; you provide the data, Agent A serves it)
- Current `server/prompts.js`

## Backgrounds spec

Export an array `BACKGROUNDS` from `server/backgrounds.js`:

```js
module.exports = {
  BACKGROUNDS: [
    { id: 'blank-white',  name: 'Blank White',       dataUri: '...' },
    { id: 'blank-black',  name: 'Blank Black',       dataUri: '...' },
    { id: 'grid-light',   name: 'Grid (Light)',      dataUri: '...' },
    { id: 'grid-dots',    name: 'Dot Grid',          dataUri: '...' },
    { id: 'zoom-grid',    name: 'Zoom Grid Mockup',  dataUri: '...' },
    { id: 'color-bars',   name: 'TV Color Bars',     dataUri: '...' },
    { id: 'spotlight',    name: 'Spotlight',         dataUri: '...' },
    { id: 'film-frame',   name: 'Film Frame',        dataUri: '...' },
  ],
  getById: function(id) { return this.BACKGROUNDS.find(b => b.id === id); },
};
```

### Background image requirements
- 720x540 pixels (matches canvas internal resolution)
- Format: SVG → data URI (`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`) for the simple geometric ones. For the more complex ones (zoom-grid, color-bars, spotlight, film-frame), still SVG with patterns or rects.
- Each data URI should be under 50KB
- Designs should be subtle enough that players can draw clearly on top
- Light/white-based backgrounds work best; dark ones are an option but the canvas's "eraser" tool is white so it'll show as a white smudge on a black bg

### Design details

**blank-white**: solid `#ffffff`, just a single rect

**blank-black**: solid `#0b0b0f`

**grid-light**: `#ffffff` background with `#e0e0e0` 1px lines every 40px, forming a square grid

**grid-dots**: `#ffffff` background with `#cccccc` 3px-radius dots every 40px

**zoom-grid**: a 3x3 grid of dark `#1c1e25` rectangles with thin `#0b0b0f` gutters, each rect with a tiny camera-icon white circle in the upper-right corner. Evokes a Zoom call layout.

**color-bars**: classic SMPTE 8-bar color bars across the full width (yellow, cyan, green, magenta, red, blue, white, black). Iconic.

**spotlight**: black background with a radial gradient from `#ffe066` center to `#0b0b0f` edges, ~50% of the way out. A theater spotlight feel.

**film-frame**: `#ffffff` center with a thick black border with 8 evenly-spaced rectangular sprocket holes on the left and right sides. Looks like a single film frame.

You can hand-author these SVGs. Keep them small and aesthetic. Use inline `<rect>`, `<pattern>`, `<radialGradient>` etc.

## Prompts spec

Extend `server/prompts.js` to ADD (not replace) the following exports:

```js
module.exports = {
  PROMPTS: [/* existing array, keep as-is */],

  // Used by Solo mode (existing) — extend the deck for more variety.
  // Already exported in v1; just add more entries.

  MASTERPIECE_PROMPTS: [
    // ~20 motion-design-flavored prompts for Masterpiece mode if host doesn't set one
    "Your dream studio setup",
    "A motion designer's coffee mug",
    "Cinema 4D's new mascot",
    "The Render Goblin",
    "After Effects fan-art",
    "A logo for Monday Meeting",
    "Render at 99% forever",
    "Spline gone wrong",
    "Houdini in the wild",
    "Bezier handles having a fight",
    "Selfie of an animator at 3am",
    "Tablet pen vs mouse showdown",
    "Keyframe in a frame",
    "Studio cat",
    "Easter egg in the credits",
    "Mograph cloner romance",
    "Premiere's spinning ball",
    "Final Cut returns",
    "The export bar of doom",
    "A new design law",
  ],

  ANIMATION_PROMPTS: [
    // ~15 simple actions easy to draw in a few frames
    "A bouncing ball",
    "A blinking eye",
    "A waving hand",
    "Sun rising",
    "A flower blooming",
    "A logo morphing",
    "A character walking",
    "Hair blowing in wind",
    "A clock ticking",
    "Coffee being poured",
    "A spaceship launching",
    "Page turning",
    "Frog jumping",
    "Heart beating",
    "Wave crashing",
  ],

  BACKGROUND_PROMPTS: [
    // ~10 simple prompts for Background mode (paired with the background image)
    "Make this room feel cozy",
    "Add monsters",
    "Plants take over",
    "Add yourself",
    "Add a celebrity",
    "Make it Halloween",
    "Make it underwater",
    "Add the year 3000",
    "Now it's a music video",
    "Disco",
  ],

  pickRandom: function(deck) {
    const arr = this[deck] || this.PROMPTS;
    return arr[Math.floor(Math.random() * arr.length)];
  },
};
```

## Definition of done

- `server/backgrounds.js` exports 8 backgrounds, each a valid 720x540 SVG data URI, each under 50KB
- `server/prompts.js` exports the original `PROMPTS` plus three new decks
- Modules require cleanly with no syntax errors
- File ownership respected

## Report when done

Write `_Briefs/v2-agent-G-done.md` with: backgrounds catalogue, total file size, any visual references.
