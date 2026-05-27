# FEAT-ALB Completion Note — Vote Tallies + Winners Gallery

Agent: FEAT-ALB
Date: 2026-05-26
File edited: `public/js/album.js` (only)

---

## Summary

All three deliverables implemented: vote tally badges on all four reveal layouts (both host and standalone branches), winners gallery (host branch uses existing `#m-winners-gallery` / `#m-winners-gallery-body`; standalone branch injects them via JS), and PNG strip download includes vote count annotations.

---

## New Shared Helpers (module-level)

| Function | Purpose |
|---|---|
| `getVoteCount(tallies, albumIdx, slideIdx)` | Returns vote count; falls back to 0 for any missing entry |
| `getWinnerSlideIdx(tallies, albumIdx)` | Returns slideIdx with highest count; -1 if no votes |
| `voteBadgeHtml(count)` | Utility; not currently used by renderers (they inline the badge HTML for data-attr support) |

Tallies format expected: `[ { albumIdx, votes: [ { slideIdx, count } ] }, ... ]` — the same shape emitted by `vote:tally` and derived from `state.votes.perAlbum` (mapping `totals` → `votes`).

---

## Vote Badge Rendering — All Four Layouts

### Stepper (`renderSlide`)
- Signature extended: `renderSlide(slide, author, imgEl, textEl, authorEl, voteCount?)`.
- When `voteCount` is defined and slide is not system-authored: renders `innerHTML` with `<span class="reveal-vote-badge" data-vote-badge>N votes</span>` appended to the author chip.
- After rendering, `reveal:slide` handler tags the badge with `data-album` / `data-slide` attributes for `updateVoteBadgesInDOM` to update in-place on later `vote:tally` events.
- System slides (authorId==='system') always get plain `textContent`, no badge.

### Frame-cycle (`renderFrameCycle`)
- `payload.tallies` added. `showFrame(idx)` looks up vote count via `getVoteCount` and injects badge HTML into the `reveal-cycle__author` span with `data-vote-badge data-album data-slide` attributes.

### Gallery (`renderGallery`)
- `payload.tallies` and `payload.albumIdx` used.
- `getWinnerSlideIdx` determines which tile gets `reveal-gallery__tile--winner` class + absolute-positioned `🏆` span.
- Each non-system tile's `.reveal-gallery__author` gets a badge with `data-vote-badge` attrs.

### Scrollback (`renderScrollback`)
- `payload.tallies` used. Each `.reveal-scroll__author` span gets an inline badge appended with `data-vote-badge` attrs.

---

## `updateVoteBadgesInDOM()`

Two implementations — one per branch, same logic:
- Queries `[data-vote-badge][data-album][data-slide]` across the document.
- Updates `badge.textContent` to current count from cached tallies.
- Does NOT rebuild any layout — zero flicker for non-stepper layouts.
- Stepper author badge is tagged with data-attrs after `reveal:slide` fires, so it also updates in-place.

---

## HOST branch — `vote:tally` socket listener

```js
socket.on('vote:tally', ({ tallies, myVote }) => {
  _cachedTallies = tallies;
  _cachedMyVote  = myVote;
  updateVoteBadgesInDOM();
  // If winners gallery is already visible (state=ended), re-render it with new counts
  if (_hostAlbums && _cachedTallies) {
    const winnersEl = document.getElementById('m-winners-gallery');
    if (winnersEl && !winnersEl.hidden) {
      renderWinnersGallery(_hostAlbums, _cachedTallies);
    }
  }
});
```

`room:state` also syncs `_cachedTallies` from `state.votes.perAlbum` to handle reconnects.
`_hostPlayers` cached from `state.players` for author name lookups in winners cards.

---

## Winners Gallery

### Host branch (`renderWinnersGallery`)
- Populates existing `#m-winners-gallery` / `#m-winners-gallery-body` from `host.html`.
- Shown when `state.state === 'ended'` AND tallies exist AND at least one album has a non-system winner.
- Hidden otherwise (including non-reveal states, reveal-only, or no votes yet).
- One `.album-winners__card` per album: thumbnail/text preview, winner badge, author chip.
- System slides skipped. Ties resolved by picking the first slideIdx with the max count (per CONTRACT §6).

### Standalone branch (`renderStandaloneWinnersGallery`)
- Same logic. `#m-winners-gallery` injected via JS (album.html doesn't have it); appended to `#album-root`.
- Re-rendered on each 30s REST poll if `state.state === 'ended'` and tallies present.

---

## PNG Download — Vote Count Annotations

`downloadAlbumStrip` extended:
- After the author label strip is drawn, if `_standaloneTallies` is set and the slide is not system-authored, renders vote count right-aligned in the label strip in `#e0d97a` (gold) text.
- Uses `getVoteCount(_standaloneTallies, albumCursor, i)` where `i` is the slide index within the album.

---

## Standalone Branch — Badge Refresh After Poll

`fetchAndApply` calls `updateVoteBadgesInDOM()` after each successful REST poll, keeping badge counts current every 30s without rebuilding layouts.

---

## Constraints Verified

- ONLY `public/js/album.js` was edited.
- All four existing layouts continue to work unchanged when no tallies are present (tallies parameter is optional everywhere; `undefined` skips badge rendering).
- Pass 1 REST polling + download-as-PNG continue to work.
- PNG export includes vote count badges.
- No socket join added to standalone branch.
- System slides never get vote badges in any layout.

---

## Known Limitations

- Frame-cycle layout: the author display cycles with each frame, so `updateVoteBadgesInDOM` will only update the badge for whichever frame is currently displayed. Counts refresh correctly on next frame tick or on next `vote:tally` event that triggers a re-render — acceptable for a cycling animation view.
- The `voteBadgeHtml()` helper function is defined but currently unused externally (all renderers inline the badge HTML directly to include `data-*` attributes). It could be refactored in a future cleanup pass.
