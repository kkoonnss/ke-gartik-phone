# v2 Agent D — Reveal Player Extensions

## Your scope
Extend the album/reveal player with four layout modes: `stepper` (existing), `frame-cycle` (Animation), `gallery` (Solo/Masterpiece/Background), `scrollback` (Story). Listen to the new `reveal:album` event in addition to `reveal:slide`.

## Files you own (edit ONLY this file)
- `public/js/album.js`

## Required reading
- `_Briefs/CONTRACT_v2.md` — sections 8 (reveal layouts), 11 (DOM element IDs for layouts: `#m-reveal-stepper`, `#m-reveal-cycle`, `#m-reveal-gallery`, `#m-reveal-scrollback`)
- Current `public/js/album.js` — existing host + standalone branches
- `public/host.html` and `public/album.html` — Agent E will add the `#m-reveal-*` containers; treat them as available DOM elements (use `document.getElementById` defensively in case Agent E uses slightly different markup)

## What to add

### Layout selection

When `room:state.revealLayout` arrives, store it and use it to:
- Show only the matching `#m-reveal-*` container
- Hide the other three reveal containers
- Hide or show the existing `#reveal-image`/`#reveal-text` (these belong inside `#m-reveal-stepper`)

If `#m-reveal-*` containers don't exist on the page (i.e., album.html or Agent E hasn't added them yet), create them dynamically inside `#reveal-panel` (host page) or `#album-root` (album page). Be tolerant — your code should work whether Agent E added the containers or not.

### Layout: stepper (existing behavior, refactor only)
- Driven by `reveal:slide` events
- Uses existing `#reveal-image`, `#reveal-text`, `#reveal-author`, `#reveal-position`
- `#reveal-next` / `#reveal-prev` emit `reveal:next` / `reveal:prev`
- Already works; ensure your refactor doesn't break it

### Layout: frame-cycle (Animation)
- Driven by `reveal:album` events (NEW)
- Receives `{ albumIdx, album, authors, total, animationPrompt, fps }`
- Renders the animation:
  - Display the `animationPrompt` text above the cycler
  - Identify the frame slides: `album.filter(s => s.type === 'drawing')` (slide 0 is text prompt)
  - Pre-decode all frames (`new Image()` for each) and start cycling at `fps` (3fps default)
  - Show frame N/total below the image
  - Show current frame's author chip
- `#reveal-next` / `#reveal-prev` advance album-by-album (emit `reveal:next`/`prev`)
- `#reveal-position` shows `Album {albumIdx+1} / {total.albums}`
- Stop the cycle interval when switching album OR when revealPanel is hidden

### Layout: gallery (Solo, Masterpiece, Background)
- Driven by `reveal:album` events
- Renders all slides as a responsive grid (CSS grid; Agent F styles `.album-gallery`)
- Each tile: small image + author chip below
- Single album only (no nav). `#reveal-next` / `#reveal-prev` are no-ops in this layout (you can hide them or accept that they fire harmlessly)
- Show the master prompt (if present in album's slide 0 of type text) at the top as a heading

### Layout: scrollback (Story)
- Driven by `reveal:album` events
- Renders all text slides as a vertical column inside a scrollable area
- Each entry: faint author label + the sentence
- `#reveal-next` / `#reveal-prev` advance album-by-album, scrolling resets to top
- Show "Album X / Y" at the top

### Album standalone page (`/album/:code`)

For each layout, the standalone page needs equivalent rendering. Recommended approach:
- Detect layout from `state.revealLayout` (server now includes this in state)
- For stepper: existing v1 logic; build flat slide list and step through with local cursor
- For frame-cycle: cycle through albums; within an album, auto-cycle frames at 3fps
- For gallery: render album as grid
- For scrollback: render album as column

The standalone page does NOT receive `reveal:album` events from the server (those are tied to the host's reveal cursor). Instead, it reads `state.albums` directly from `room:state` and constructs the layout views locally. The user navigates between albums with `#album-next`/`#album-prev`.

### Receiving `reveal:album`

Add a new socket listener for `reveal:album`. On host page:
- Update the appropriate layout container
- Stop any frame-cycle interval from previous album
- Cache the latest album/authors locally

On album page: this event is not the source of truth (host is). The album page reads from `state.albums`.

## DOM helpers

Add this helper at the top of album.js:

```js
function ensureRevealContainers(parentEl) {
  ['m-reveal-stepper','m-reveal-cycle','m-reveal-gallery','m-reveal-scrollback'].forEach(id => {
    if (!document.getElementById(id)) {
      const div = document.createElement('div');
      div.id = id;
      div.className = 'reveal-layout reveal-layout--' + id.replace('m-reveal-','');
      div.hidden = true;
      parentEl.appendChild(div);
    }
  });
}
```

For host page: `ensureRevealContainers(document.getElementById('reveal-panel'))`.
For album page: `ensureRevealContainers(document.getElementById('album-root'))`.

Then show/hide containers based on layout, populate their innerHTML from your render functions.

## Edge cases

- Layout switches mid-game (shouldn't happen but defensive: clear current view first)
- `reveal:album` arrives before layout is known — buffer it and apply once `room:state.revealLayout` is known
- Frame-cycle interval not cleared on page unload — register a `beforeunload` cleanup
- Slide content empty string ('') — show a placeholder "[blank]" rather than an empty img

## Definition of done

- All four layouts render correctly per their spec
- Stepper layout behaves identically to v1
- Frame-cycle correctly loops at ~3fps
- Gallery shows a responsive grid
- Scrollback shows full text column
- Album standalone page works for all four
- File ownership respected — only `album.js`

## Report when done

Write `_Briefs/v2-agent-D-done.md` with: layouts implemented, any new DOM elements you created dynamically, manual test instructions per layout.
