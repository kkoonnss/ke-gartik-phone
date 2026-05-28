// album.js — Album Reveal Player
// Included by both host.html and album.html.
// Detects which page it's on and runs only the appropriate branch.
//
// v1.1: Adds four layout modes: stepper (existing), frame-cycle, gallery, scrollback.
// Listens to reveal:album (new) in addition to reveal:slide (stepper only).
//
// v1.2 (FEAT-ALB): Vote tally badges on all layouts; winners gallery; standalone badge refresh.

import {
  getSocket,
  getRoomCodeFromPath,
} from '/js/socket-client.js';

// ---------------------------------------------------------------------------
// Archive save hook (HOST branch only) — imported lazily so phone/album pages
// are never burdened by the IndexedDB module.
// ---------------------------------------------------------------------------
import { saveGame } from '/js/album-store.js';

// Dedupe guard: tracks the last saved game signature so the same game is not
// saved again on subsequent room:state events during the reveal.
// Format: "<code>:<albumCount>:<firstAlbumLength>" or null.
let _archivedSignature = null;

// ---------------------------------------------------------------------------
// Shared slide rendering helper (stepper only)
// ---------------------------------------------------------------------------

/**
 * Renders a single slide into the provided element references.
 * @param {object} slide      - { type: 'text'|'drawing', content: string, authorId?: string }
 * @param {object} author     - { name: string, emoji: string } or null
 * @param {HTMLImageElement} imgEl
 * @param {HTMLElement}      textEl
 * @param {HTMLElement}      authorEl
 * @param {number}           [voteCount]  - optional vote count to show as badge
 */
function renderSlide(slide, author, imgEl, textEl, authorEl, voteCount) {
  if (slide.type === 'drawing') {
    imgEl.src = slide.content || '';
    imgEl.hidden = !slide.content;
    textEl.textContent = slide.content ? '' : '[blank]';
    textEl.hidden = !!slide.content;
  } else {
    imgEl.hidden = true;
    imgEl.src = '';
    textEl.textContent = slide.content || '[blank]';
    textEl.hidden = false;
  }

  if (authorEl) {
    const { name, emoji } = author || { name: 'Anonymous', emoji: '🎭' };
    const isSystem = slide.authorId === 'system';
    if (isSystem || voteCount === undefined) {
      authorEl.textContent = `${emoji} ${name}`;
    } else {
      // Use innerHTML to render the badge; author text is escaped
      authorEl.innerHTML =
        `${escapeHtml(emoji)} ${escapeHtml(name)}` +
        `<span class="reveal-vote-badge" data-vote-badge style="` +
          `display:inline-block;background:rgba(0,0,0,0.55);color:#e0d97a;` +
          `font-size:0.7rem;font-weight:700;letter-spacing:0.05em;padding:1px 6px;` +
          `border-radius:3px;margin-left:6px;vertical-align:middle;` +
        `">${voteCount} vote${voteCount === 1 ? '' : 's'}</span>`;
    }
  }
}

// ---------------------------------------------------------------------------
// ensureRevealContainers — create #m-reveal-* divs if Agent E hasn't yet
// ---------------------------------------------------------------------------

/**
 * Creates any missing #m-reveal-* containers inside parentEl.
 * Safe to call multiple times — idempotent.
 * @param {HTMLElement} parentEl
 */
function ensureRevealContainers(parentEl) {
  ['m-reveal-stepper', 'm-reveal-cycle', 'm-reveal-gallery', 'm-reveal-scrollback'].forEach((id) => {
    if (!document.getElementById(id)) {
      const div = document.createElement('div');
      div.id = id;
      div.className = 'reveal-layout reveal-layout--' + id.replace('m-reveal-', '');
      div.hidden = true;
      parentEl.appendChild(div);
    }
  });
}

// ---------------------------------------------------------------------------
// Layout helpers — show only the active layout container
// ---------------------------------------------------------------------------

const LAYOUT_IDS = ['m-reveal-stepper', 'm-reveal-cycle', 'm-reveal-gallery', 'm-reveal-scrollback'];

/**
 * Show only the container matching layoutName, hide the others.
 * Also show/hide the legacy stepper elements as appropriate.
 * @param {string} layoutName  'stepper'|'frame-cycle'|'gallery'|'scrollback'
 */
function activateLayout(layoutName) {
  const mapping = {
    'stepper':    'm-reveal-stepper',
    'frame-cycle':'m-reveal-cycle',
    'gallery':    'm-reveal-gallery',
    'scrollback': 'm-reveal-scrollback',
  };
  const activeId = mapping[layoutName] || 'm-reveal-stepper';

  LAYOUT_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = (id !== activeId);
  });

  // Legacy stepper elements (#reveal-image, etc.) live outside #m-reveal-stepper
  // in Agent E's current markup. Keep them visible only for stepper layout.
  const legacyEls = ['reveal-image', 'reveal-text', 'reveal-author', 'reveal-position'];
  legacyEls.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // For stepper, visibility is managed per-slide by renderSlide.
    // For other layouts, hide the legacy elements entirely.
    if (layoutName !== 'stepper') {
      el.hidden = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Frame-cycle renderer
// ---------------------------------------------------------------------------

let _cycleInterval = null;

/**
 * Clears any running frame-cycle interval.
 */
function clearCycleInterval() {
  if (_cycleInterval !== null) {
    clearInterval(_cycleInterval);
    _cycleInterval = null;
  }
}

/**
 * Renders the frame-cycle layout into #m-reveal-cycle.
 * @param {object} payload  { albumIdx, album, authors, total, animationPrompt, fps, tallies? }
 */
function renderFrameCycle(payload) {
  clearCycleInterval();

  const container = document.getElementById('m-reveal-cycle');
  if (!container) return;

  const { albumIdx, album, authors, total, animationPrompt, fps, tallies } = payload;
  const frames = album.filter((s) => s.type === 'drawing');

  if (!frames.length) {
    container.innerHTML = `
      <div class="reveal-cycle__prompt">${escapeHtml(animationPrompt || '')}</div>
      <div class="reveal-cycle__empty" style="color:var(--ink-dim);text-align:center;padding:2rem;">No frames in this album.</div>
    `;
    return;
  }

  // Build authorMap from index-aligned authors array
  // authors[i] corresponds to album[i]
  function authorForFrame(frameIdx) {
    // frames are a filtered subset; find their original album index
    const originalIdx = album.indexOf(frames[frameIdx]);
    if (originalIdx >= 0 && authors && authors[originalIdx]) {
      return authors[originalIdx];
    }
    return { name: 'Anonymous', emoji: '🎭' };
  }

  // Get original album slide index for a given frame index
  function origIdxForFrame(frameIdx) {
    return album.indexOf(frames[frameIdx]);
  }

  // Pre-decode images
  const imgObjects = frames.map((s) => {
    const img = new Image();
    img.src = s.content || '';
    return img;
  });

  let frameIdx = 0;

  container.innerHTML = `
    <div class="reveal-cycle__prompt">${escapeHtml(animationPrompt || '')}</div>
    <div class="reveal-cycle__frame-wrap" style="display:flex;justify-content:center;">
      <img class="reveal-cycle__image" alt="" />
    </div>
    <div class="reveal-cycle__frame-info" style="display:flex;gap:1rem;justify-content:center;align-items:center;margin-top:0.75rem;">
      <span class="reveal-cycle__counter"></span>
      <span class="reveal-cycle__author"></span>
    </div>
    <div class="reveal-cycle__album-pos" style="text-align:center;color:var(--ink-dim);margin-top:0.5rem;font-size:0.85rem;letter-spacing:0.08em;text-transform:uppercase;"></div>
  `;

  const imgEl        = container.querySelector('.reveal-cycle__image');
  const counterEl    = container.querySelector('.reveal-cycle__counter');
  const authorEl     = container.querySelector('.reveal-cycle__author');
  const albumPosEl   = container.querySelector('.reveal-cycle__album-pos');

  albumPosEl.textContent = `Album ${albumIdx + 1} / ${total.albums}`;

  function showFrame(idx) {
    const img = imgObjects[idx];
    imgEl.src = img.src || '';
    imgEl.hidden = !img.src;
    counterEl.textContent = `Frame ${idx + 1} / ${frames.length}`;
    const auth = authorForFrame(idx);
    const origIdx = origIdxForFrame(idx);
    const frameSlide = frames[idx];
    const isSystem = frameSlide && frameSlide.authorId === 'system';
    if (!isSystem && tallies !== undefined) {
      const count = getVoteCount(tallies, albumIdx, origIdx);
      authorEl.innerHTML =
        `${escapeHtml(auth.emoji || '')} ${escapeHtml(auth.name || 'Anonymous')}` +
        `<span class="reveal-vote-badge" data-vote-badge data-album="${albumIdx}" data-slide="${origIdx}" style="` +
          `display:inline-block;background:rgba(0,0,0,0.55);color:#e0d97a;` +
          `font-size:0.7rem;font-weight:700;letter-spacing:0.05em;padding:1px 6px;` +
          `border-radius:3px;margin-left:6px;vertical-align:middle;` +
        `">${count} vote${count === 1 ? '' : 's'}</span>`;
    } else {
      authorEl.textContent = `${auth.emoji || ''} ${auth.name || 'Anonymous'}`;
    }
  }

  showFrame(0);

  const intervalMs = Math.round(1000 / (fps || 3));
  _cycleInterval = setInterval(() => {
    frameIdx = (frameIdx + 1) % frames.length;
    showFrame(frameIdx);
  }, intervalMs);
}

// ---------------------------------------------------------------------------
// Gallery renderer
// ---------------------------------------------------------------------------

/**
 * Renders the gallery layout into #m-reveal-gallery.
 * @param {object} payload  { albumIdx, album, authors, total, animationPrompt, tallies? }
 */
function renderGallery(payload) {
  const container = document.getElementById('m-reveal-gallery');
  if (!container) return;

  const { albumIdx, album, authors, tallies } = payload;

  // Find master prompt from slide 0 if type=text
  let masterPrompt = '';
  if (album.length && album[0].type === 'text') {
    masterPrompt = album[0].content || '';
  }

  const drawingSlides = album.filter((s) => s.type === 'drawing');

  // Find winning slide index (highest votes) for winner highlight
  const winnerSlideIdx = (tallies !== undefined)
    ? getWinnerSlideIdx(tallies, albumIdx)
    : -1;

  let tilesHtml = '';
  drawingSlides.forEach((slide) => {
    // Find original album index for this drawing
    const origIdx = album.indexOf(slide);
    const auth = (authors && authors[origIdx]) || { name: 'Anonymous', emoji: '🎭' };
    const src = slide.content || '';
    const dotColor = (auth.color || '#888888');
    const isSystem = slide.authorId === 'system';
    const isWinner = !isSystem && tallies !== undefined && origIdx === winnerSlideIdx && winnerSlideIdx >= 0;
    const count = (!isSystem && tallies !== undefined) ? getVoteCount(tallies, albumIdx, origIdx) : null;

    const tileClass = `reveal-gallery__tile${isWinner ? ' reveal-gallery__tile--winner' : ''}`;
    const badgeHtml = (count !== null)
      ? `<span class="reveal-vote-badge" data-vote-badge data-album="${albumIdx}" data-slide="${origIdx}" style="` +
          `display:inline-block;background:rgba(0,0,0,0.55);color:#e0d97a;` +
          `font-size:0.7rem;font-weight:700;letter-spacing:0.05em;padding:1px 6px;` +
          `border-radius:3px;margin-left:6px;vertical-align:middle;` +
        `">${count} vote${count === 1 ? '' : 's'}</span>`
      : '';
    const trophyHtml = isWinner
      ? `<span class="reveal-gallery__trophy" style="` +
          `position:absolute;top:4px;right:6px;font-size:1.3rem;line-height:1;` +
        `">🏆</span>`
      : '';

    tilesHtml += `
      <div class="${tileClass}" style="position:relative;">
        ${trophyHtml}
        ${src
          ? `<img src="${escapeHtmlAttr(src)}" alt="" />`
          : `<div class="reveal-gallery__blank" style="aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;color:var(--ink-dim);">[blank]</div>`
        }
        <div class="reveal-gallery__author"><span class="player-dot" style="background:${escapeHtmlAttr(dotColor)}"></span>${escapeHtml(auth.emoji || '')} ${escapeHtml(auth.name || 'Anonymous')}${badgeHtml}</div>
      </div>
    `;
  });

  container.innerHTML = `
    ${masterPrompt ? `<div class="gallery__prompt" style="text-align:center;font-style:italic;color:var(--ink-dim);margin-bottom:1rem;font-size:1.1rem;">${escapeHtml(masterPrompt)}</div>` : ''}
    <div class="reveal-gallery__grid">${tilesHtml}</div>
  `;
}

// ---------------------------------------------------------------------------
// Scrollback renderer
// ---------------------------------------------------------------------------

/**
 * Renders the scrollback layout into #m-reveal-scrollback.
 * @param {object} payload  { albumIdx, album, authors, total, tallies? }
 */
function renderScrollback(payload) {
  const container = document.getElementById('m-reveal-scrollback');
  if (!container) return;

  const { albumIdx, album, authors, total, tallies } = payload;

  const textSlides = album.filter((s) => s.type === 'text');

  let rowsHtml = '';
  textSlides.forEach((slide) => {
    const origIdx = album.indexOf(slide);
    const auth = (authors && authors[origIdx]) || { name: 'Anonymous', emoji: '🎭' };
    const isSystem = slide.authorId === 'system';
    let voteNote = '';
    if (!isSystem && tallies !== undefined) {
      const count = getVoteCount(tallies, albumIdx, origIdx);
      voteNote = ` <span class="reveal-vote-badge" data-vote-badge data-album="${albumIdx}" data-slide="${origIdx}" style="` +
        `display:inline-block;background:rgba(0,0,0,0.55);color:#e0d97a;` +
        `font-size:0.7rem;font-weight:700;letter-spacing:0.05em;padding:1px 6px;` +
        `border-radius:3px;margin-left:6px;vertical-align:middle;` +
        `">${count} vote${count === 1 ? '' : 's'}</span>`;
    }
    rowsHtml += `
      <div class="reveal-scroll__entry">
        <span class="reveal-scroll__author">${escapeHtml(auth.emoji || '')} ${escapeHtml(auth.name || 'Anonymous')}${voteNote}</span>
        <p class="reveal-scroll__text">${escapeHtml(slide.content || '[blank]')}</p>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="scrollback__header" style="text-align:center;color:var(--ink-dim);margin-bottom:1.5rem;font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase;">Album ${albumIdx + 1} / ${total.albums}</div>
    <div class="reveal-scroll__list">${rowsHtml || '<div class="scrollback__empty" style="text-align:center;color:var(--ink-dim);padding:2rem;">No text slides in this album.</div>'}</div>
  `;

  // Reset scroll to top
  container.scrollTop = 0;
}

// ---------------------------------------------------------------------------
// HTML escaping helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Vote tally helpers (shared by both branches)
// ---------------------------------------------------------------------------

/**
 * Returns the vote count for a specific slide given a tallies array.
 * tallies format: [ { albumIdx, votes: [ { slideIdx, count } ] }, ... ]
 * Falls back to 0 for any missing entry.
 * @param {Array|null} tallies
 * @param {number} albumIdx
 * @param {number} slideIdx
 * @returns {number}
 */
function getVoteCount(tallies, albumIdx, slideIdx) {
  if (!tallies || !tallies.length) return 0;
  const albumEntry = tallies.find((t) => t.albumIdx === albumIdx);
  if (!albumEntry || !albumEntry.votes) return 0;
  const voteEntry = albumEntry.votes.find((v) => v.slideIdx === slideIdx);
  return (voteEntry && voteEntry.count) || 0;
}

/**
 * Returns the slideIdx with the highest vote count for an album.
 * Returns -1 if no votes or all counts are 0.
 * @param {Array|null} tallies
 * @param {number} albumIdx
 * @returns {number}
 */
function getWinnerSlideIdx(tallies, albumIdx) {
  if (!tallies || !tallies.length) return -1;
  const albumEntry = tallies.find((t) => t.albumIdx === albumIdx);
  if (!albumEntry || !albumEntry.votes || !albumEntry.votes.length) return -1;
  let best = -1;
  let bestCount = 0;
  for (const v of albumEntry.votes) {
    if (v.count > bestCount) {
      bestCount = v.count;
      best = v.slideIdx;
    }
  }
  return best;
}

/**
 * Builds a small HTML string for a vote badge.
 * @param {number} count
 * @returns {string}
 */
function voteBadgeHtml(count) {
  return `<span class="reveal-vote-badge" style="` +
    `display:inline-block;background:rgba(0,0,0,0.55);color:#e0d97a;` +
    `font-size:0.7rem;font-weight:700;letter-spacing:0.05em;padding:1px 6px;` +
    `border-radius:3px;margin-left:6px;vertical-align:middle;` +
    `">${count} vote${count === 1 ? '' : 's'}</span>`;
}

// ---------------------------------------------------------------------------
// Page detection
// ---------------------------------------------------------------------------

const isHostPage  = !!document.getElementById('reveal-panel');
const isAlbumPage = !!document.getElementById('album-root');

// ---------------------------------------------------------------------------
// HOST branch
// ---------------------------------------------------------------------------

if (isHostPage) {
  const socket = getSocket();

  const revealPanel    = document.getElementById('reveal-panel');
  const phaseStatus    = document.getElementById('phase-status');
  const settingsPanel  = document.getElementById('settings-panel');
  const revealImage    = document.getElementById('reveal-image');
  const revealText     = document.getElementById('reveal-text');
  const revealAuthor   = document.getElementById('reveal-author');
  const revealPosition = document.getElementById('reveal-position');
  const revealNext     = document.getElementById('reveal-next');
  const revealPrev     = document.getElementById('reveal-prev');

  // Current layout, set from room:state.revealLayout
  let currentLayout = 'stepper';

  // Buffer for reveal:album that arrives before room:state.revealLayout is known
  let _pendingAlbumPayload = null;
  let _layoutKnown = false;

  // Cached vote tallies received from vote:tally events
  let _cachedTallies = null;
  let _cachedMyVote  = null;

  // Last known state.albums — used to re-render with vote tallies
  let _hostAlbums  = null;
  // Last album payload sent to layout renderers — used by updateVoteBadgesInDOM
  let _lastAlbumPayload = null;
  // Cached players list for author name lookups in winners gallery
  let _hostPlayers = [];

  // Ensure the four layout containers exist inside #reveal-panel
  ensureRevealContainers(revealPanel);

  // ---------------------------------------------------------------------------
  // updateVoteBadgesInDOM — refreshes existing badges without full re-render
  // ---------------------------------------------------------------------------
  function updateVoteBadgesInDOM() {
    if (!_cachedTallies) return;
    // Find all badges with data-vote-badge + data-album + data-slide attributes
    const badges = document.querySelectorAll('[data-vote-badge][data-album][data-slide]');
    badges.forEach((badge) => {
      const albumIdx = parseInt(badge.dataset.album, 10);
      const slideIdx = parseInt(badge.dataset.slide, 10);
      if (!isNaN(albumIdx) && !isNaN(slideIdx)) {
        const count = getVoteCount(_cachedTallies, albumIdx, slideIdx);
        badge.textContent = `${count} vote${count === 1 ? '' : 's'}`;
      }
    });

    // For the stepper's revealAuthor element (which may not carry data attrs —
    // it's rewritten on each reveal:slide), nothing to update here since it
    // gets rebuilt on next reveal:slide. The updateVoteBadgesInDOM handles
    // the non-stepper layouts' data-attr badges above.
  }

  // ---------------------------------------------------------------------------
  // renderWinnersGallery — populates #m-winners-gallery-body
  // ---------------------------------------------------------------------------
  function renderWinnersGallery(albums, tallies) {
    const galleryEl = document.getElementById('m-winners-gallery');
    const bodyEl    = document.getElementById('m-winners-gallery-body');
    if (!galleryEl || !bodyEl) return;

    const hasTallies = tallies && tallies.length;
    if (!albums || !albums.length || !hasTallies) {
      galleryEl.hidden = true;
      return;
    }

    let cardsHtml = '';
    albums.forEach((albumEntry, aIdx) => {
      const slidesArr = Array.isArray(albumEntry) ? albumEntry : (albumEntry.slides || []);
      const winnerIdx = getWinnerSlideIdx(tallies, aIdx);
      if (winnerIdx < 0) return; // no votes for this album

      const winSlide = slidesArr[winnerIdx];
      if (!winSlide) return;
      if (winSlide.authorId === 'system') return; // skip system slides

      // Look up author from cached players list
      const authorId = winSlide.authorId || '';
      const authorPlayer = _hostPlayers.find((p) => p.id === authorId);
      const authorName   = authorPlayer ? authorPlayer.name  : 'Anonymous';
      const authorEmoji  = authorPlayer ? (authorPlayer.emoji || '') : '🎭';
      const count = getVoteCount(tallies, aIdx, winnerIdx);

      let thumbHtml = '';
      if (winSlide.type === 'drawing' && winSlide.content) {
        thumbHtml = `<img src="${escapeHtmlAttr(winSlide.content)}" alt="" style="width:100%;display:block;border-radius:4px;margin-bottom:0.5rem;" />`;
      } else if (winSlide.type === 'text') {
        thumbHtml = `<div style="background:#0d0d1a;border-radius:4px;padding:0.5rem 0.75rem;font-size:0.85rem;color:#f0f0f0;margin-bottom:0.5rem;word-break:break-word;">${escapeHtml(winSlide.content || '[blank]')}</div>`;
      }

      cardsHtml += `
        <div class="album-winners__card" style="background:#1e1e38;border-radius:8px;padding:0.75rem;border:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:0.75rem;color:var(--ink-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.5rem;">Album ${aIdx + 1}</div>
          ${thumbHtml}
          <div style="font-size:0.8rem;color:#c0c0d8;margin-bottom:0.25rem;">
            <span class="reveal-vote-badge" style="background:rgba(0,0,0,0.55);color:#e0d97a;font-size:0.7rem;font-weight:700;letter-spacing:0.05em;padding:2px 8px;border-radius:3px;">WINNER · ${count} vote${count === 1 ? '' : 's'}</span>
          </div>
          <div style="font-size:0.8rem;color:#c0c0d8;">${escapeHtml(authorEmoji)} ${escapeHtml(authorName)}</div>
        </div>
      `;
    });

    if (!cardsHtml) {
      galleryEl.hidden = true;
      return;
    }

    bodyEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;">${cardsHtml}</div>`;
    galleryEl.hidden = false;
  }

  // Apply a reveal:album payload to the correct layout renderer (injects tallies)
  function applyAlbumPayload(payload) {
    // Attach current tallies to payload so renderers can show badges
    const enriched = Object.assign({}, payload, { tallies: _cachedTallies || [] });
    _lastAlbumPayload = enriched;
    if (currentLayout === 'frame-cycle') {
      renderFrameCycle(enriched);
    } else if (currentLayout === 'gallery') {
      renderGallery(enriched);
    } else if (currentLayout === 'scrollback') {
      renderScrollback(enriched);
    }
    // stepper doesn't use reveal:album
  }

  // Show/hide reveal panel based on room state; also capture revealLayout
  socket.on('room:state', (state) => {
    const inReveal = state.state === 'reveal' || state.state === 'ended';
    revealPanel.hidden = !inReveal;

    // Cache albums and players for winners gallery
    if (state.albums) _hostAlbums = state.albums;
    if (state.players) _hostPlayers = state.players;

    // Sync vote tallies from room:state (they're also in vote:tally, but keep in sync)
    if (state.votes && state.votes.perAlbum) {
      // Convert perAlbum format to tallies format
      _cachedTallies = state.votes.perAlbum.map((entry) => ({
        albumIdx: entry.albumIdx,
        votes: entry.totals || [],
      }));
    }

    // -----------------------------------------------------------------------
    // Archive save hook — save completed game to IndexedDB ONCE per game.
    // Only fires when reveal or ended with actual album data present.
    // -----------------------------------------------------------------------
    if (inReveal && state.albums && state.albums.length) {
      const firstAlbumLength = Array.isArray(state.albums[0])
        ? state.albums[0].length
        : (state.albums[0] && state.albums[0].slides ? state.albums[0].slides.length : 0);
      const sig = `${state.code}:${state.albums.length}:${firstAlbumLength}`;
      if (sig !== _archivedSignature) {
        _archivedSignature = sig;
        try {
          saveGame({
            code: state.code,
            mode: (state.settings && state.settings.mode) || 'classic',
            playedAt: Date.now(),
            players: (state.players || []).map((p) => ({
              id: p.id,
              name: p.name,
              emoji: p.emoji,
              color: p.color,
            })),
            albums: state.albums,
          }).catch((err) => {
            console.warn('[album] saveGame failed (non-fatal):', err);
          });
        } catch (err) {
          console.warn('[album] saveGame threw (non-fatal):', err);
        }
      }
    } else if (state.state === 'lobby' || state.state === 'playing') {
      // New game starting — clear the dedupe guard so the next reveal saves fresh.
      _archivedSignature = null;
    }

    if (inReveal) {
      if (phaseStatus)   phaseStatus.hidden   = true;
      if (settingsPanel) settingsPanel.hidden = true;

      // Capture layout
      const layout = state.revealLayout || 'stepper';
      if (layout !== currentLayout) {
        // Layout switch — clear any running cycle
        clearCycleInterval();
      }
      currentLayout = layout;
      _layoutKnown = true;

      // Activate the correct container
      activateLayout(currentLayout);

      // Re-show legacy stepper nav buttons for all layouts (they are used for
      // album-level navigation in frame-cycle and scrollback too)
      // For gallery they become no-ops but remain visible (harmless)
      if (revealNext) revealNext.hidden = false;
      if (revealPrev) revealPrev.hidden = false;

      // If a reveal:album was buffered before we knew the layout, apply it now
      if (_pendingAlbumPayload) {
        applyAlbumPayload(_pendingAlbumPayload);
        _pendingAlbumPayload = null;
      }

      // Winners gallery: show only when ended
      if (state.state === 'ended' && _hostAlbums && _cachedTallies) {
        renderWinnersGallery(_hostAlbums, _cachedTallies);
      } else {
        const galleryEl = document.getElementById('m-winners-gallery');
        if (galleryEl) galleryEl.hidden = true;
      }
    } else {
      // Not in reveal — clear cycle and hide winners gallery
      clearCycleInterval();
      _layoutKnown = false;
      const galleryEl = document.getElementById('m-winners-gallery');
      if (galleryEl) galleryEl.hidden = true;
    }
  });

  // Render incoming reveal:slide (stepper layout only)
  socket.on('reveal:slide', (payload) => {
    if (currentLayout !== 'stepper') return; // guard: ignore if wrong layout

    const { albumIdx, slideIdx, slide, author, total } = payload;

    // Resolve vote count for this slide
    const isSystem = slide.authorId === 'system';
    const voteCount = (!isSystem && _cachedTallies)
      ? getVoteCount(_cachedTallies, albumIdx, slideIdx)
      : undefined;

    // For stepper, the legacy elements are outside #m-reveal-stepper in v1 HTML,
    // so render directly into them as before.
    renderSlide(slide, author, revealImage, revealText, revealAuthor, voteCount);

    // Tag the authorEl badge with data attrs for future updateVoteBadgesInDOM calls
    if (revealAuthor && !isSystem && _cachedTallies !== null) {
      const badge = revealAuthor.querySelector('[data-vote-badge]');
      if (badge) {
        badge.dataset.album = String(albumIdx);
        badge.dataset.slide  = String(slideIdx);
      }
    }

    if (revealPosition) {
      revealPosition.textContent =
        `Album ${albumIdx + 1}/${total.albums} · Slide ${slideIdx + 1}/${total.slidesInAlbum}`;
    }
  });

  // NEW: receive full album payload for non-stepper layouts
  socket.on('reveal:album', (payload) => {
    clearCycleInterval(); // always stop previous cycle before starting new one

    if (!_layoutKnown) {
      // Buffer until we know the layout
      _pendingAlbumPayload = payload;
      return;
    }

    applyAlbumPayload(payload);
  });

  // ---------------------------------------------------------------------------
  // vote:tally listener — update tallies cache and refresh badges in DOM
  // ---------------------------------------------------------------------------
  socket.on('vote:tally', ({ tallies, myVote }) => {
    _cachedTallies = tallies;
    _cachedMyVote  = myVote;
    // Re-render vote badges in current layout WITHOUT rebuilding the whole layout
    updateVoteBadgesInDOM();

    // If state is ended and we have albums, refresh winners gallery too
    // (we check by looking at whether winners gallery is already visible/populated)
    if (_hostAlbums && _cachedTallies) {
      // Only show winners gallery if we're in ended state — check the panel is visible
      const winnersEl = document.getElementById('m-winners-gallery');
      if (winnersEl && !winnersEl.hidden) {
        renderWinnersGallery(_hostAlbums, _cachedTallies);
      }
    }
  });

  // Button wiring
  if (revealNext) {
    revealNext.addEventListener('click', () => {
      socket.emit('reveal:next');
    });
  }

  if (revealPrev) {
    revealPrev.addEventListener('click', () => {
      socket.emit('reveal:prev');
    });
  }

  // Keyboard navigation (host page only)
  document.addEventListener('keydown', (e) => {
    if (revealPanel.hidden) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      socket.emit('reveal:next');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      socket.emit('reveal:prev');
    }
  });

  // Clean up interval on page unload
  window.addEventListener('beforeunload', clearCycleInterval);
}

// ---------------------------------------------------------------------------
// ALBUM standalone branch
// ---------------------------------------------------------------------------

if (isAlbumPage) {
  const albumRoot        = document.getElementById('album-root');
  const albumSlideImage  = document.getElementById('album-slide-image');
  const albumSlideText   = document.getElementById('album-slide-text');
  const albumSlideAuthor = document.getElementById('album-slide-author');
  const albumPosition    = document.getElementById('album-position');
  const albumNext        = document.getElementById('album-next');
  const albumPrev        = document.getElementById('album-prev');

  // Current layout from state.revealLayout
  let standaloneLayout = 'stepper';

  // Frame-cycle state for standalone
  let _standaloneCycleInterval = null;
  let _standaloneCycleAlbumIdx = null;

  // Vote tallies from the most recent REST poll (state.votes.perAlbum → tallies format)
  let _standaloneTallies = null;

  function clearStandaloneCycle() {
    if (_standaloneCycleInterval !== null) {
      clearInterval(_standaloneCycleInterval);
      _standaloneCycleInterval = null;
    }
    _standaloneCycleAlbumIdx = null;
  }

  // Ensure layout containers exist inside #album-root
  ensureRevealContainers(albumRoot);

  // Local playback cursor for stepper layout
  let albums    = null;
  let players   = [];
  let flatSlides = [];
  let flatCursor = 0;

  // Album-level cursor for non-stepper layouts
  let albumCursor = 0;

  // Currently displayed album entry — kept in sync for PNG download
  let currentAlbum = null;

  function buildFlatList(albumsArr) {
    flatSlides = [];
    albumsArr.forEach((album, aIdx) => {
      const slidesArr = Array.isArray(album) ? album : (album.slides || []);
      slidesArr.forEach((slide, sIdx) => {
        flatSlides.push({ albumIdx: aIdx, slideIdx: sIdx, slide });
      });
    });
  }

  function lookupAuthor(authorId) {
    if (!authorId || authorId === 'system') {
      return { name: 'System', emoji: '🎲' };
    }
    const p = players.find((pl) => pl.id === authorId);
    return p || { name: 'Anonymous', emoji: '🎭' };
  }

  // Build authors array (index-aligned with album slides) for an album
  function buildAuthors(slidesArr) {
    return slidesArr.map((slide) => lookupAuthor(slide.authorId));
  }

  // Get normalized slides array from album entry
  function getSlidesArr(albumEntry) {
    return Array.isArray(albumEntry) ? albumEntry : (albumEntry.slides || []);
  }

  // ---------------------------------------------------------------------------
  // updateVoteBadgesInDOM — refreshes existing badges in standalone page
  // ---------------------------------------------------------------------------
  function updateVoteBadgesInDOM() {
    if (!_standaloneTallies) return;
    const badges = document.querySelectorAll('[data-vote-badge][data-album][data-slide]');
    badges.forEach((badge) => {
      const albumIdx = parseInt(badge.dataset.album, 10);
      const slideIdx = parseInt(badge.dataset.slide, 10);
      if (!isNaN(albumIdx) && !isNaN(slideIdx)) {
        const count = getVoteCount(_standaloneTallies, albumIdx, slideIdx);
        badge.textContent = `${count} vote${count === 1 ? '' : 's'}`;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // renderStandaloneWinnersGallery — inject/populate winners gallery on album page
  // ---------------------------------------------------------------------------
  function renderStandaloneWinnersGallery(albumsArr, tallies) {
    const hasTallies = tallies && tallies.length;
    if (!albumsArr || !albumsArr.length || !hasTallies) {
      const existing = document.getElementById('m-winners-gallery');
      if (existing) existing.hidden = true;
      return;
    }

    // Inject the winners gallery element if not present in album.html
    let galleryEl = document.getElementById('m-winners-gallery');
    if (!galleryEl) {
      galleryEl = document.createElement('div');
      galleryEl.id = 'm-winners-gallery';
      galleryEl.className = 'host__winners-gallery';
      galleryEl.style.cssText = 'margin-top:2rem;padding:1rem;background:#13132a;border-radius:8px;';
      galleryEl.innerHTML = `
        <h3 style="text-align:center;text-transform:uppercase;letter-spacing:0.1em;font-size:1rem;color:#c0c0d8;margin-bottom:1rem;">WINNERS GALLERY</h3>
        <div id="m-winners-gallery-body"></div>
      `;
      albumRoot.appendChild(galleryEl);
    }

    const bodyEl = document.getElementById('m-winners-gallery-body');
    if (!bodyEl) return;

    let cardsHtml = '';
    albumsArr.forEach((albumEntry, aIdx) => {
      const slidesArr = getSlidesArr(albumEntry);
      const winnerIdx = getWinnerSlideIdx(tallies, aIdx);
      if (winnerIdx < 0) return;

      const winSlide = slidesArr[winnerIdx];
      if (!winSlide) return;
      if (winSlide.authorId === 'system') return;

      const auth = lookupAuthor(winSlide.authorId);
      const count = getVoteCount(tallies, aIdx, winnerIdx);

      let thumbHtml = '';
      if (winSlide.type === 'drawing' && winSlide.content) {
        thumbHtml = `<img src="${escapeHtmlAttr(winSlide.content)}" alt="" style="width:100%;display:block;border-radius:4px;margin-bottom:0.5rem;" />`;
      } else if (winSlide.type === 'text') {
        thumbHtml = `<div style="background:#0d0d1a;border-radius:4px;padding:0.5rem 0.75rem;font-size:0.85rem;color:#f0f0f0;margin-bottom:0.5rem;word-break:break-word;">${escapeHtml(winSlide.content || '[blank]')}</div>`;
      }

      cardsHtml += `
        <div class="album-winners__card" style="background:#1e1e38;border-radius:8px;padding:0.75rem;border:1px solid rgba(255,255,255,0.1);">
          <div style="font-size:0.75rem;color:var(--ink-dim,#888);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.5rem;">Album ${aIdx + 1}</div>
          ${thumbHtml}
          <div style="font-size:0.8rem;color:#c0c0d8;margin-bottom:0.25rem;">
            <span class="reveal-vote-badge" style="background:rgba(0,0,0,0.55);color:#e0d97a;font-size:0.7rem;font-weight:700;letter-spacing:0.05em;padding:2px 8px;border-radius:3px;">WINNER · ${count} vote${count === 1 ? '' : 's'}</span>
          </div>
          <div style="font-size:0.8rem;color:#c0c0d8;">${escapeHtml(auth.emoji || '')} ${escapeHtml(auth.name || 'Anonymous')}</div>
        </div>
      `;
    });

    if (!cardsHtml) {
      galleryEl.hidden = true;
      return;
    }

    bodyEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;">${cardsHtml}</div>`;
    galleryEl.hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Stepper: show current flat slide
  // ---------------------------------------------------------------------------
  function showStepperCurrent() {
    if (!flatSlides.length) return;
    const entry = flatSlides[flatCursor];
    const totalAlbums = albums.length;
    const albumAt = albums[entry.albumIdx];
    const slidesInAlbum = getSlidesArr(albumAt).length;

    const author = lookupAuthor(entry.slide.authorId);
    const isSystem = entry.slide.authorId === 'system';
    const voteCount = (!isSystem && _standaloneTallies)
      ? getVoteCount(_standaloneTallies, entry.albumIdx, entry.slideIdx)
      : undefined;

    renderSlide(entry.slide, author, albumSlideImage, albumSlideText, albumSlideAuthor, voteCount);

    // Tag badge with data attrs for updateVoteBadgesInDOM
    if (albumSlideAuthor && !isSystem && _standaloneTallies !== null) {
      const badge = albumSlideAuthor.querySelector('[data-vote-badge]');
      if (badge) {
        badge.dataset.album = String(entry.albumIdx);
        badge.dataset.slide  = String(entry.slideIdx);
      }
    }

    if (albumPosition) {
      albumPosition.textContent =
        `Album ${entry.albumIdx + 1}/${totalAlbums} · Slide ${entry.slideIdx + 1}/${slidesInAlbum}`;
    }

    if (albumPrev) albumPrev.disabled = flatCursor === 0;
    if (albumNext) albumNext.disabled = flatCursor === flatSlides.length - 1;
  }

  // ---------------------------------------------------------------------------
  // Frame-cycle standalone: cycle the current album
  // ---------------------------------------------------------------------------
  function showStandaloneFrameCycle(albumIdx) {
    clearStandaloneCycle();
    if (!albums || !albums.length) return;
    _standaloneCycleAlbumIdx = albumIdx;

    const container = document.getElementById('m-reveal-cycle');
    if (!container) return;

    const albumEntry = albums[albumIdx];
    const slidesArr = getSlidesArr(albumEntry);
    const authors = buildAuthors(slidesArr);

    // Derive animationPrompt from slide 0 if text
    const animationPrompt = (slidesArr.length && slidesArr[0].type === 'text')
      ? (slidesArr[0].content || '')
      : '';

    // Render using the same helper, adapting to standalone shape
    renderFrameCycle({
      albumIdx,
      album: slidesArr,
      authors,
      total: { albums: albums.length },
      animationPrompt,
      fps: 3,
      tallies: _standaloneTallies || [],
    });

    // Update position display (container has its own album-pos element)
    if (albumPosition) {
      albumPosition.textContent = `Album ${albumIdx + 1} / ${albums.length}`;
    }
    if (albumPrev) albumPrev.disabled = albumIdx === 0;
    if (albumNext) albumNext.disabled = albumIdx === albums.length - 1;
  }

  // ---------------------------------------------------------------------------
  // Gallery standalone: show current album
  // ---------------------------------------------------------------------------
  function showStandaloneGallery(albumIdx) {
    if (!albums || !albums.length) return;

    const albumEntry = albums[albumIdx];
    const slidesArr = getSlidesArr(albumEntry);
    const authors = buildAuthors(slidesArr);

    renderGallery({
      albumIdx,
      album: slidesArr,
      authors,
      total: { albums: albums.length },
      tallies: _standaloneTallies || [],
    });

    if (albumPosition) {
      albumPosition.textContent = `Album ${albumIdx + 1} / ${albums.length}`;
    }
    // Gallery is single-album in host mode, but in standalone we still allow nav
    if (albumPrev) albumPrev.disabled = albumIdx === 0;
    if (albumNext) albumNext.disabled = albumIdx === albums.length - 1;
  }

  // ---------------------------------------------------------------------------
  // Scrollback standalone: show current album
  // ---------------------------------------------------------------------------
  function showStandaloneScrollback(albumIdx) {
    clearStandaloneCycle();
    if (!albums || !albums.length) return;

    const albumEntry = albums[albumIdx];
    const slidesArr = getSlidesArr(albumEntry);
    const authors = buildAuthors(slidesArr);

    renderScrollback({
      albumIdx,
      album: slidesArr,
      authors,
      total: { albums: albums.length },
      tallies: _standaloneTallies || [],
    });

    if (albumPosition) {
      albumPosition.textContent = `Album ${albumIdx + 1} / ${albums.length}`;
    }
    if (albumPrev) albumPrev.disabled = albumIdx === 0;
    if (albumNext) albumNext.disabled = albumIdx === albums.length - 1;
  }

  // ---------------------------------------------------------------------------
  // Show current position based on layout
  // ---------------------------------------------------------------------------
  function showCurrent() {
    if (!albums || !albums.length) return;

    if (standaloneLayout === 'stepper') {
      showStepperCurrent();
    } else if (standaloneLayout === 'frame-cycle') {
      showStandaloneFrameCycle(albumCursor);
    } else if (standaloneLayout === 'gallery') {
      showStandaloneGallery(albumCursor);
    } else if (standaloneLayout === 'scrollback') {
      showStandaloneScrollback(albumCursor);
    }
  }

  function setNotReady(message) {
    clearStandaloneCycle();
    if (albumSlideImage) { albumSlideImage.hidden = true; albumSlideImage.src = ''; }
    if (albumSlideText)  { albumSlideText.textContent = message || 'Game is not finished yet.'; albumSlideText.hidden = false; }
    if (albumSlideAuthor) albumSlideAuthor.textContent = '';
    if (albumPosition)   albumPosition.textContent = '';
    if (albumNext) albumNext.disabled = true;
    if (albumPrev) albumPrev.disabled = true;
  }

  function applyState(state) {
    players = state.players || [];

    // Extract vote tallies from state.votes (perAlbum → tallies array format)
    if (state.votes && state.votes.perAlbum) {
      _standaloneTallies = state.votes.perAlbum.map((entry) => ({
        albumIdx: entry.albumIdx,
        votes: entry.totals || [],
      }));
    } else {
      _standaloneTallies = null;
    }

    if (state.state !== 'reveal' && state.state !== 'ended') {
      setNotReady('Game is not finished yet.');
      albums = null;
      flatSlides = [];
      // Hide winners gallery if visible
      const galleryEl = document.getElementById('m-winners-gallery');
      if (galleryEl) galleryEl.hidden = true;
      return;
    }

    if (!state.albums || !state.albums.length) {
      setNotReady('Album data not yet available. (state.albums missing)');
      albums = null;
      flatSlides = [];
      return;
    }

    const newLayout = state.revealLayout || 'stepper';
    const layoutChanged = newLayout !== standaloneLayout;

    // If layout changed, clear cycle and reset cursors
    if (layoutChanged) {
      clearStandaloneCycle();
      flatCursor = 0;
      albumCursor = 0;
    }

    standaloneLayout = newLayout;
    albums = state.albums;

    // Build flat list for stepper regardless (used only when layout=stepper)
    buildFlatList(albums);

    if (!albums.length) {
      setNotReady('No albums found.');
      return;
    }

    // Clamp cursors
    if (flatCursor >= flatSlides.length) flatCursor = 0;
    if (albumCursor >= albums.length) albumCursor = 0;

    // Activate layout containers; hide legacy stepper elements for non-stepper
    activateLayout(standaloneLayout);

    // For stepper, show legacy #album-player area; hide for other layouts
    const albumPlayerEl = document.getElementById('album-player');
    if (albumPlayerEl) {
      albumPlayerEl.hidden = (standaloneLayout !== 'stepper');
    }

    // For non-stepper, hide legacy nav? Keep it for next/prev navigation
    // (all layouts benefit from prev/next buttons except gallery which makes them no-ops)

    showCurrent();

    // Winners gallery: show when ended and votes exist
    if (state.state === 'ended' && _standaloneTallies) {
      renderStandaloneWinnersGallery(albums, _standaloneTallies);
    } else {
      const galleryEl = document.getElementById('m-winners-gallery');
      if (galleryEl) galleryEl.hidden = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Button wiring — stepper advances slides, other layouts advance albums
  // ---------------------------------------------------------------------------
  function syncCurrentAlbum() {
    if (albums && albums.length) {
      const idx = Math.min(albumCursor, albums.length - 1);
      currentAlbum = albums[idx] || null;
    }
  }

  if (albumNext) {
    albumNext.addEventListener('click', () => {
      if (!albums || !albums.length) return;

      if (standaloneLayout === 'stepper') {
        if (flatCursor < flatSlides.length - 1) {
          flatCursor++;
          showCurrent();
        }
      } else {
        // gallery: single album in host mode but we allow multi-album browse standalone
        if (albumCursor < albums.length - 1) {
          albumCursor++;
          showCurrent();
          syncCurrentAlbum();
        }
      }
    });
  }

  if (albumPrev) {
    albumPrev.addEventListener('click', () => {
      if (!albums || !albums.length) return;

      if (standaloneLayout === 'stepper') {
        if (flatCursor > 0) {
          flatCursor--;
          showCurrent();
        }
      } else {
        if (albumCursor > 0) {
          albumCursor--;
          showCurrent();
          syncCurrentAlbum();
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // REST fetch — no socket join, no player slot consumed
  // ---------------------------------------------------------------------------

  /**
   * Fetches current room state from the REST endpoint added by FIX-A.
   * @param {string} code
   * @returns {Promise<object>} room object from serializeRoom
   */
  async function fetchRoomState(code) {
    const resp = await fetch(`/api/room/${encodeURIComponent(code)}`);
    if (!resp.ok) {
      if (resp.status === 404) throw new Error('Room not found');
      throw new Error(`Server returned ${resp.status}`);
    }
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load room');
    return data.room;
  }

  // ---------------------------------------------------------------------------
  // Error banner
  // ---------------------------------------------------------------------------

  let _errorBanner = null;

  function showErrorBanner(message) {
    if (!_errorBanner) {
      _errorBanner = document.createElement('div');
      _errorBanner.id = 'album-error-banner';
      _errorBanner.style.cssText =
        'background:#c0392b;color:#fff;padding:0.75rem 1.25rem;text-align:center;' +
        'font-size:0.95rem;letter-spacing:0.04em;border-radius:6px;margin-bottom:1rem;';
      albumRoot.insertBefore(_errorBanner, albumRoot.firstChild);
    }
    _errorBanner.textContent = message;
    _errorBanner.hidden = false;
  }

  function hideErrorBanner() {
    if (_errorBanner) _errorBanner.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // Download album as PNG strip
  // ---------------------------------------------------------------------------

  /**
   * Wraps text onto multiple lines within maxWidth using ctx.measureText.
   * Returns an array of line strings.
   */
  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  /**
   * Resolves when an Image element has loaded, or rejects on error.
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = src;
    });
  }

  /**
   * Composes all slides of the current album into a single PNG strip and
   * triggers a file download.
   */
  async function downloadAlbumStrip() {
    if (!currentAlbum) return;

    const STRIP_W      = 480;
    const SLIDE_H_TEXT = 200;   // height for text slides
    const SLIDE_H_DRAW = 360;   // height for drawing slides (720:540 = 4:3 → 480x360)
    const GAP          = 20;
    const LABEL_H      = 32;
    const FONT_SIZE    = 24;
    const FONT_FACE    = `${FONT_SIZE}px sans-serif`;
    const LABEL_FONT   = '14px sans-serif';
    const PAD          = 16;

    // Build slide list
    const slidesArr = getSlidesArr(currentAlbum);
    if (!slidesArr.length) return;

    // Pre-load all drawing images
    const imageCache = new Map();
    for (const slide of slidesArr) {
      if (slide.type === 'drawing' && slide.content) {
        try {
          imageCache.set(slide.content, await loadImage(slide.content));
        } catch (_) {
          // If image fails to load, we'll render a blank rectangle
        }
      }
    }

    // Calculate total canvas height
    let totalH = 0;
    for (let i = 0; i < slidesArr.length; i++) {
      const slide = slidesArr[i];
      const slideH = slide.type === 'drawing' ? SLIDE_H_DRAW : SLIDE_H_TEXT;
      totalH += slideH + LABEL_H;
      if (i < slidesArr.length - 1) totalH += GAP;
    }

    const canvas = document.createElement('canvas');
    canvas.width  = STRIP_W;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, STRIP_W, totalH);

    let y = 0;
    for (let i = 0; i < slidesArr.length; i++) {
      const slide  = slidesArr[i];
      const author = lookupAuthor(slide.authorId);
      const slideH = slide.type === 'drawing' ? SLIDE_H_DRAW : SLIDE_H_TEXT;

      // Slide background
      ctx.fillStyle = '#0d0d1a';
      ctx.fillRect(0, y, STRIP_W, slideH);

      if (slide.type === 'drawing') {
        const img = imageCache.get(slide.content);
        if (img) {
          ctx.drawImage(img, 0, y, STRIP_W, SLIDE_H_DRAW);
        } else {
          ctx.fillStyle = '#333355';
          ctx.fillRect(0, y, STRIP_W, SLIDE_H_DRAW);
          ctx.fillStyle = '#888888';
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('[blank]', STRIP_W / 2, y + SLIDE_H_DRAW / 2);
        }
      } else {
        // Text slide — word-wrap
        ctx.fillStyle = '#f0f0f0';
        ctx.font = FONT_FACE;
        ctx.textAlign = 'left';
        const maxTextW = STRIP_W - PAD * 2;
        const lines = wrapText(ctx, slide.content || '[blank]', maxTextW);
        const lineH  = FONT_SIZE * 1.4;
        const blockH = lines.length * lineH;
        let ty = y + (SLIDE_H_TEXT - blockH) / 2;
        for (const line of lines) {
          ctx.fillText(line, PAD, ty + FONT_SIZE);
          ty += lineH;
        }
      }

      // Author label below slide
      const labelY = y + slideH;
      ctx.fillStyle = '#2a2a40';
      ctx.fillRect(0, labelY, STRIP_W, LABEL_H);
      ctx.fillStyle = '#c0c0d8';
      ctx.font = LABEL_FONT;
      ctx.textAlign = 'left';
      const authorLabel = `${author.emoji || ''} ${author.name || 'Anonymous'}`.trim();
      ctx.fillText(authorLabel, PAD, labelY + LABEL_H / 2 + 5);

      // Vote count annotation (right-aligned in label strip)
      const isSystemSlide = slide.authorId === 'system';
      if (!isSystemSlide && _standaloneTallies) {
        // albumCursor is the album index for the currently displayed album
        const voteCount = getVoteCount(_standaloneTallies, albumCursor, i);
        const voteLabel = `${voteCount} vote${voteCount === 1 ? '' : 's'}`;
        ctx.fillStyle = '#e0d97a';
        ctx.textAlign = 'right';
        ctx.fillText(voteLabel, STRIP_W - PAD, labelY + LABEL_H / 2 + 5);
        // Reset alignment
        ctx.textAlign = 'left';
      }

      y += slideH + LABEL_H;
      if (i < slidesArr.length - 1) y += GAP;
    }

    // Download via temporary <a>
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `album-${code || 'download'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  // ---------------------------------------------------------------------------
  // Download button — injected at top of #album-root
  // ---------------------------------------------------------------------------

  const _downloadBtn = document.createElement('button');
  _downloadBtn.id          = 'album-download-btn';
  _downloadBtn.textContent = 'DOWNLOAD ALBUM AS PNG';
  _downloadBtn.style.cssText =
    'display:block;margin:0 auto 1rem auto;padding:0.6rem 1.4rem;' +
    'background:#4a3f8c;color:#fff;border:none;border-radius:6px;' +
    'font-size:0.9rem;letter-spacing:0.08em;text-transform:uppercase;' +
    'cursor:pointer;';
  _downloadBtn.hidden = true;   // shown once albums are available
  _downloadBtn.addEventListener('click', downloadAlbumStrip);
  albumRoot.insertBefore(_downloadBtn, albumRoot.firstChild);

  // ---------------------------------------------------------------------------
  // Auto-refresh
  // ---------------------------------------------------------------------------

  const REFRESH_INTERVAL_MS = 30_000;
  let _refreshInterval = null;

  async function fetchAndApply() {
    try {
      const room = await fetchRoomState(code);
      hideErrorBanner();

      applyState(room);

      // If game is not yet in reveal/ended, override the message with polling note.
      // (applyState already called setNotReady for non-reveal states.)
      if (room.state !== 'reveal' && room.state !== 'ended') {
        setNotReady('Game not finished yet — checking again in 30s...');
      }

      // Update currentAlbum AFTER applyState so albumCursor is final.
      // albums is the outer-scope variable updated by applyState.
      if (albums && albums.length) {
        const idx = Math.min(albumCursor, albums.length - 1);
        currentAlbum = albums[idx] || null;
        _downloadBtn.hidden = false;
      } else {
        currentAlbum = null;
        _downloadBtn.hidden = true;
      }

      // Refresh vote badges in place (handles 30s polling tallies update)
      updateVoteBadgesInDOM();
    } catch (err) {
      console.error('[album] fetchAndApply error:', err);
      showErrorBanner(`Could not load room: ${err.message}. Retrying in 30s...`);
    }
  }

  // ---------------------------------------------------------------------------
  // Load and start polling
  // ---------------------------------------------------------------------------

  const code = getRoomCodeFromPath();

  if (!code) {
    setNotReady('No room code in URL. Visit /album/XXXX to load a game.');
  } else {
    // Initial load
    fetchAndApply();

    // Start 30-second polling
    _refreshInterval = setInterval(fetchAndApply, REFRESH_INTERVAL_MS);
  }

  // Clean up on unload
  window.addEventListener('beforeunload', () => {
    clearStandaloneCycle();
    if (_refreshInterval !== null) {
      clearInterval(_refreshInterval);
      _refreshInterval = null;
    }
  });

}
