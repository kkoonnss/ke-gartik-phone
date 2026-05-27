# FEAT-PLAY Completion Note — v3 Pass 2

Agent: FEAT-PLAY
File edited: `public/js/play.js`
Date: 2026-05-26

---

## Vote Panel Injection Approach

The vote panel is injected dynamically into `#spectator-screen` as a child `<div id="m-vote-panel" class="play__vote-panel">`. It is never written to `play.html`.

`buildVotePanel(albumIdx, roomState)` is the core builder. It:
1. Removes any existing `#m-vote-panel`.
2. Hides `#spectator-message` (the rotating "Waiting on others" text) since we're in reveal mode.
3. Reads `roomState.albums[albumIdx].slides` and renders one element per slide:
   - `slide.authorId === 'system'` → non-interactive `<div class="play__vote-option play__vote-option--system">` (no click handler, no vote badge).
   - All other slides → `<button class="play__vote-option">` with a thumbnail (`<img>` for drawings, `<span>` for text), author chip, and a `<span data-badge-slideidx>` vote count badge.
4. On button click: emits `reveal:vote { albumIdx, slideIdx }` and calls `tryPlaySound('playVote')`. Applies optimistic selection via `_applyVoteSelection`.
5. After building, applies any cached `pendingTally` or re-highlights the player's stored vote for this album from `myCurrentVote`.
6. Also reads `roomState.votes.perAlbum` to pre-fill count badges when joining mid-reveal.

Author name resolution uses `roomState.players.find(p => p.id === slide.authorId)` and formats as `emoji name`.

Empty album guard: shows `<p class="play__vote-empty">No slides to vote on</p>`.

---

## Socket Events Listened To

| Event | Handler behavior |
|---|---|
| `reveal:slide` | Updates `currentAlbumIdx`; if albumIdx changed, calls `buildVotePanel` to rebuild for new album. |
| `reveal:album` | Same as above (non-stepper layouts send this instead of per-slide ticks). |
| `vote:tally` | If `currentAlbumIdx` is set, calls `_applyTally` which updates badge counts and re-highlights own vote. If `currentAlbumIdx` is null (panel not ready), caches payload in `pendingTally` for application on next `buildVotePanel`. |

`reveal:vote` is emitted client→server (not received), triggered by button click.

---

## State Transition Handling

| Transition | Action |
|---|---|
| `playing → reveal` (detected in `room:state` handler) | Sets `currentAlbumIdx = 0`, clears `myCurrentVote` and `pendingTally`. `applyState` then calls `renderSpectator(roomState)` → `showVotePanelForCurrentAlbum` → `buildVotePanel(0, roomState)`. |
| `reveal → ended` | Vote panel stays; `renderSpectator` still shows vote panel (both `reveal` and `ended` states trigger vote mode). Players can still vote. |
| `* → lobby` (game reset) | `removeVotePanel()` is called in the `room:state` lobby branch. Removes panel, restores `#spectator-message` visibility, resets `currentAlbumIdx`, `pendingTally`, `myCurrentVote` to null. |
| Player joins mid-reveal | `resp.room` in the join response contains `state.albums` and `state.votes.perAlbum`. `applyState` calls `renderSpectator` → `buildVotePanel`, which reads existing tallies from `roomState.votes.perAlbum` and pre-fills badges. `currentAlbumIdx` defaults to 0 if `reveal:album`/`reveal:slide` haven't arrived yet. |

---

## renderSpectator Signature Change

`renderSpectator()` now takes `roomState` as a parameter. All call sites updated:
- `doSubmit` (try + catch paths)
- `renderKnockoffShow` (setTimeout callback)
- `applyState` (all branches that called renderSpectator)

When `roomState.state === 'reveal' || 'ended'`: shows vote panel.
Otherwise (between-phase waiting): removes any stray vote panel, restores `#spectator-message`, calls `nextSpectatorMessage()` as before.

---

## Edge Cases

| Case | Handling |
|---|---|
| `vote:tally` arrives before panel is ready | Cached in `pendingTally`; applied at end of `buildVotePanel` on next call. |
| Host advances to next album before player has voted | `reveal:slide` or `reveal:album` fires with new `albumIdx`; `buildVotePanel` rebuilds entirely. Previous album's selection is not carried over (per-album voting, one vote per album). |
| System-authored slides | Rendered as non-interactive `<div>`, no vote badge, no click handler. |
| Empty album | Defensive `<p>No slides to vote on</p>` shown inside `.play__vote-options`. |
| Player already voted when panel rebuilds | `myCurrentVote` persists across rebuilds; `_applyVoteSelection` re-highlights correct button after `buildVotePanel` completes. |
| `roomState` null in `renderSpectator` | Guards on `state = roomState && roomState.state`; falls through to the waiting-message branch safely. |

---

## Files NOT touched

- `play.html` — untouched
- `public/js/canvas.js` — untouched
- `public/js/host.js` — untouched
- `public/js/album.js` — untouched
- All CSS files — untouched (CSS classes follow CONTRACT_v3 naming; FEAT-SND-CSS adds styles)

---

## No Issues / Stops Required

All changes stayed within `public/js/play.js`. No contract divergences found. FIX-B work (canvas refactor, sound hooks, kicked banner) is fully preserved.
