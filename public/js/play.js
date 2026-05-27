// play.js — Player game UI controller for KE_GartiK_Phone
// FIX-B: Canvas pointer listeners are now registered exactly once (M-1 fix).
//         _initDrawScreen calls canvasInstance.reset() instead of initCanvas().
// FEAT-PLAY (v3 Pass 2): Vote panel injected into #spectator-screen during reveal/ended.

import {
  getSocket,
  emitAck,
  getRoomCodeFromPath,
  getStoredPlayerId,
  getStoredName,
  getStoredEmoji,
  setStoredPlayerId,
} from './socket-client.js';

import { initCanvas } from './canvas.js';

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const SPECTATOR_MESSAGES = [
  'Nice work. Waiting on the others...',
  'Almost there...',
  "Don't peek 👀",
];

let spectatorMsgIdx = 0;

function nextSpectatorMessage() {
  const el = document.getElementById('spectator-message');
  if (el) {
    el.textContent = SPECTATOR_MESSAGES[spectatorMsgIdx % SPECTATOR_MESSAGES.length];
    spectatorMsgIdx++;
  }
}

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------

// SCREEN REUSE PATTERN (v1.1+):
// The SCREENS array only lists the canonical HTML element IDs that showScreen()
// toggles.  New phase types introduced in v1.1 intentionally REUSE existing
// screen IDs rather than adding new ones:
//
//   'continue'          → reuses 'write-screen'   (same textarea / submit button)
//   'coop-draw'         → reuses 'draw-screen'
//   'masterpiece-draw'  → reuses 'draw-screen'
//   'missingpiece-draw' → reuses 'draw-screen'
//   'background-draw'   → reuses 'draw-screen'
//
// If you add a phase type that genuinely needs its OWN distinct HTML screen,
// add the element ID to this array AND to play.html; otherwise showScreen()
// will not hide it when switching to a different screen.
const SCREENS = [
  'waiting-screen',
  'write-screen',
  'draw-screen',
  'describe-screen',
  'knockoff-show-screen',
  'spectator-screen',
];

function showScreen(id) {
  SCREENS.forEach((sid) => {
    const el = document.getElementById(sid);
    if (!el) return;
    if (sid === id) {
      el.removeAttribute('hidden');
    } else {
      el.setAttribute('hidden', '');
    }
  });
}

// ---------------------------------------------------------------------------
// Error toast
// ---------------------------------------------------------------------------

let errorToastTimer = null;

function showErrorToast(message) {
  const toast = document.getElementById('error-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.removeAttribute('hidden');
  if (errorToastTimer) clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(() => {
    toast.setAttribute('hidden', '');
  }, 3000);
}

// ---------------------------------------------------------------------------
// Countdown rendering
// ---------------------------------------------------------------------------

let countdownInterval = null;
let currentDeadline = null; // ms epoch

function startCountdown(endsAt, elementId) {
  currentDeadline = endsAt;
  if (countdownInterval) clearInterval(countdownInterval);

  function update() {
    const el = document.getElementById(elementId);
    if (!el) return;
    const remaining = Math.max(0, Math.ceil((currentDeadline - Date.now()) / 1000));
    el.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  update();
  countdownInterval = setInterval(update, 500);
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
  currentDeadline = null;
}

// ---------------------------------------------------------------------------
// Sound hooks (FEAT-SND-CSS pass 2 — sounds.js written by another agent)
// ---------------------------------------------------------------------------

/**
 * tryPlaySound(name) — defensive sound trigger.
 * Dynamically imports ./sounds.js and calls the named export if it exists.
 * Silently no-ops if sounds.js is absent, disabled, or throws.
 * The actual implementation lives in public/js/sounds.js (FEAT-SND-CSS).
 * @param {string} name — export name, e.g. 'playPhaseStart'
 */
async function tryPlaySound(name) {
  try {
    const m = await import('./sounds.js');
    if (typeof m[name] === 'function') m[name]();
  } catch (e) {
    // sounds.js not loaded or disabled — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

let myPlayerId = null;
let roomCode = null;
let lastRoomState = null;
let lastAssignment = null; // phase:assignment payload
let hasSubmitted = false;

// Canvas instance — initialized ONCE at page load (see initCanvasOnce).
// Pointer listeners are attached exactly once; reset() is called between phases.
let canvasInstance = null;

// Auto-submit timer handle
let autoSubmitTimer = null;

// Knockoff-show auto-advance timer
let knockoffShowTimer = null;

// ---------------------------------------------------------------------------
// Vote panel state (FEAT-PLAY v3)
// ---------------------------------------------------------------------------

// Index of the album currently being revealed (0-based). Set by reveal:slide /
// reveal:album events, and also when transitioning into reveal state.
let currentAlbumIdx = null;

// Cached vote:tally payload. Arrives before currentAlbumIdx is set if player
// joins mid-reveal; applied when the vote panel is next rendered.
let pendingTally = null;

// The slideIdx this player has voted for in currentAlbumIdx (-1 = no vote yet).
let myCurrentVote = null; // { albumIdx, slideIdx } | null

// ---------------------------------------------------------------------------
// Vote panel helpers (FEAT-PLAY v3)
// ---------------------------------------------------------------------------

/**
 * buildVotePanel(albumIdx, roomState)
 *
 * Injects (or replaces) #m-vote-panel inside #spectator-screen.
 * Reads slide data from roomState.albums[albumIdx].
 * Each non-system slide gets a .play__vote-option button.
 * System-authored slides render as non-interactive labels.
 */
function buildVotePanel(albumIdx, roomState) {
  if (albumIdx === null || albumIdx === undefined) return;
  if (!roomState || !roomState.albums) return;

  const album = roomState.albums[albumIdx];
  const spectatorScreen = document.getElementById('spectator-screen');
  if (!spectatorScreen) return;

  // Remove any existing panel
  const existing = document.getElementById('m-vote-panel');
  if (existing) existing.remove();

  // Hide the rotating "Waiting on others" message — we're in reveal mode
  const spectatorMsg = document.getElementById('spectator-message');
  if (spectatorMsg) spectatorMsg.setAttribute('hidden', '');

  // Build panel
  const panel = document.createElement('div');
  panel.id = 'm-vote-panel';
  panel.className = 'play__vote-panel';

  const title = document.createElement('div');
  title.className = 'play__vote-title';
  title.textContent = 'Vote for the funniest slide';
  panel.appendChild(title);

  const albumInfo = document.createElement('div');
  albumInfo.className = 'play__vote-album-info';
  const totalAlbums = roomState.albums ? roomState.albums.length : 0;
  albumInfo.textContent = `Album ${albumIdx + 1} / ${totalAlbums}`;
  panel.appendChild(albumInfo);

  const optionsEl = document.createElement('div');
  optionsEl.className = 'play__vote-options';

  if (!album || !album.slides || album.slides.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'play__vote-empty';
    empty.textContent = 'No slides to vote on';
    optionsEl.appendChild(empty);
  } else {
    album.slides.forEach((slide, slideIdx) => {
      const isSystem = slide.authorId === 'system';

      // Resolve author name from room players
      let authorName = '';
      if (slide.authorId) {
        const player = (roomState.players || []).find((p) => p.id === slide.authorId);
        authorName = player ? `${player.emoji || ''} ${player.name}`.trim() : slide.authorId;
      }

      if (isSystem) {
        // Non-votable: render as a label div
        const label = document.createElement('div');
        label.className = 'play__vote-option play__vote-option--system';
        label.dataset.slideidx = slideIdx;

        const thumb = _buildSlideThumbnail(slide);
        const authorChip = document.createElement('span');
        authorChip.className = 'play__vote-author';
        authorChip.textContent = authorName || 'System';

        label.appendChild(thumb);
        label.appendChild(authorChip);
        optionsEl.appendChild(label);
      } else {
        // Votable button
        const btn = document.createElement('button');
        btn.className = 'play__vote-option';
        btn.dataset.slideidx = slideIdx;

        const thumb = _buildSlideThumbnail(slide);
        const authorChip = document.createElement('span');
        authorChip.className = 'play__vote-author';
        authorChip.textContent = authorName || 'Unknown';

        const badge = document.createElement('span');
        badge.className = 'play__vote-count';
        badge.dataset.badgeSlideidx = slideIdx;
        badge.textContent = '0';

        btn.appendChild(thumb);
        btn.appendChild(authorChip);
        btn.appendChild(badge);

        btn.addEventListener('click', () => {
          const socket = getSocket();
          socket.emit('reveal:vote', { albumIdx, slideIdx });
          tryPlaySound('playVote');
          // Optimistic selection highlight
          _applyVoteSelection(albumIdx, slideIdx);
        });

        optionsEl.appendChild(btn);
      }
    });
  }

  panel.appendChild(optionsEl);
  spectatorScreen.appendChild(panel);

  // Apply any pending tally or current known vote
  if (pendingTally) {
    _applyTally(pendingTally);
    pendingTally = null;
  } else if (myCurrentVote && myCurrentVote.albumIdx === albumIdx) {
    // Re-highlight selection for this album if we already voted
    _applyVoteSelection(albumIdx, myCurrentVote.slideIdx);
  }

  // Apply vote counts from room state if available (joins mid-reveal)
  if (roomState.votes && roomState.votes.perAlbum) {
    const entry = roomState.votes.perAlbum.find((e) => e.albumIdx === albumIdx);
    if (entry && entry.totals) {
      _updateBadgesFromTotals(albumIdx, entry.totals);
    }
  }
}

/**
 * _buildSlideThumbnail(slide)
 * Returns an img (for drawings) or a span (for text slides).
 */
function _buildSlideThumbnail(slide) {
  if (slide.type === 'drawing') {
    const img = document.createElement('img');
    img.className = 'play__vote-thumb';
    img.src = slide.content || '';
    img.alt = '';
    return img;
  } else {
    const span = document.createElement('span');
    span.className = 'play__vote-thumb play__vote-thumb--text';
    // Truncate for display
    const txt = (slide.content || '').slice(0, 80);
    span.textContent = txt || '(empty)';
    return span;
  }
}

/**
 * _applyVoteSelection(albumIdx, slideIdx)
 * Marks the selected button with --selected class; removes it from others.
 * Only operates on buttons whose album matches currentAlbumIdx.
 */
function _applyVoteSelection(albumIdx, slideIdx) {
  if (albumIdx !== currentAlbumIdx) return;
  const panel = document.getElementById('m-vote-panel');
  if (!panel) return;
  panel.querySelectorAll('.play__vote-option').forEach((btn) => {
    const idx = parseInt(btn.dataset.slideidx, 10);
    if (idx === slideIdx) {
      btn.classList.add('play__vote-option--selected');
    } else {
      btn.classList.remove('play__vote-option--selected');
    }
  });
}

/**
 * _updateBadgesFromTotals(albumIdx, totals)
 * totals: [ { slideIdx, count } ]
 * Updates count badges on the vote panel if the panel is currently showing
 * the given albumIdx.
 */
function _updateBadgesFromTotals(albumIdx, totals) {
  if (albumIdx !== currentAlbumIdx) return;
  const panel = document.getElementById('m-vote-panel');
  if (!panel) return;
  (totals || []).forEach(({ slideIdx, count }) => {
    const badge = panel.querySelector(`[data-badge-slideidx="${slideIdx}"]`);
    if (badge) badge.textContent = String(count);
  });
}

/**
 * _applyTally(tallyPayload)
 * Processes a vote:tally payload.  Finds the entry for currentAlbumIdx
 * (using the new contract shape: totals not votes array).
 * Also highlights the player's own vote.
 */
function _applyTally(tallyPayload) {
  if (!tallyPayload) return;

  const { tallies, myVote } = tallyPayload;

  // Update myCurrentVote tracking
  if (myVote) {
    myCurrentVote = myVote;
  }

  if (!tallies || currentAlbumIdx === null) return;

  // CONTRACT §3: tallies[].votes is [{ slideIdx, count }]
  const entry = tallies.find((t) => t.albumIdx === currentAlbumIdx);
  if (entry) {
    _updateBadgesFromTotals(currentAlbumIdx, entry.votes || []);
  }

  // Re-apply selection highlight
  if (myVote && myVote.albumIdx === currentAlbumIdx) {
    _applyVoteSelection(myVote.albumIdx, myVote.slideIdx);
  }
}

/**
 * removeVotePanel()
 * Called when game returns to lobby state. Removes panel and restores the
 * "Waiting on others" message.
 */
function removeVotePanel() {
  const existing = document.getElementById('m-vote-panel');
  if (existing) existing.remove();

  const spectatorMsg = document.getElementById('spectator-message');
  if (spectatorMsg) spectatorMsg.removeAttribute('hidden');

  currentAlbumIdx = null;
  pendingTally = null;
  myCurrentVote = null;
}

/**
 * showVotePanelForCurrentAlbum(roomState)
 * Called when entering reveal/ended state, or on state update while in reveal.
 * If currentAlbumIdx has been set (via reveal:slide / reveal:album), uses it.
 * Otherwise defaults to 0.
 */
function showVotePanelForCurrentAlbum(roomState) {
  if (!roomState || !roomState.albums || roomState.albums.length === 0) return;

  // Default to 0 if we haven't received a reveal:album/slide event yet
  if (currentAlbumIdx === null) {
    currentAlbumIdx = 0;
  }

  buildVotePanel(currentAlbumIdx, roomState);
}

// ---------------------------------------------------------------------------
// Submit helpers (prevent double-submit)
// ---------------------------------------------------------------------------

let submitInFlight = false;

async function doSubmit(phase, content) {
  if (submitInFlight || hasSubmitted) return;
  submitInFlight = true;

  // M-2: Capture the assignment that triggered this submit.
  // If a new phase:assignment arrives while the emitAck is in-flight,
  // lastAssignment will be overwritten.  We check at the end so we don't
  // flash spectator-screen over a phase that has already re-rendered.
  const submittedAssignment = lastAssignment;
  const round = lastAssignment ? lastAssignment.round : 0;

  try {
    await emitAck('phase:submit', { phase, round, content });
    hasSubmitted = true;
    clearAutoSubmit();
    // Sound hook: successful submit
    tryPlaySound('playSubmit');
    // Only navigate to spectator if no new assignment arrived during the await
    if (lastAssignment === submittedAssignment) {
      renderSpectator(lastRoomState);
    }
  } catch (err) {
    // Server may have timed out and advanced — swallow silently
    // unless it's a real validation error
    if (err.message && err.message.includes('VALIDATION')) {
      showErrorToast(err.message);
    }
    // Regardless, treat as submitted so we don't loop
    hasSubmitted = true;
    if (lastAssignment === submittedAssignment) {
      renderSpectator(lastRoomState);
    }
  } finally {
    submitInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Auto-submit on deadline
// ---------------------------------------------------------------------------

function scheduleAutoSubmit(endsAt, phase, getContent) {
  clearAutoSubmit();
  const delay = endsAt - Date.now();
  if (delay <= 0) {
    // Already past — fire immediately
    doSubmit(phase, getContent());
    return;
  }
  autoSubmitTimer = setTimeout(() => {
    if (!hasSubmitted) {
      doSubmit(phase, getContent());
    }
  }, delay);
}

function clearAutoSubmit() {
  if (autoSubmitTimer) clearTimeout(autoSubmitTimer);
  autoSubmitTimer = null;
}

// ---------------------------------------------------------------------------
// Draw-screen banner helpers (no-time-limit / frame badge)
// ---------------------------------------------------------------------------

/** Remove any dynamic banner injected by previous phase renderers. */
function clearDrawBanners() {
  const existing = document.getElementById('draw-banner');
  if (existing) existing.remove();
}

/**
 * Inject a small informational banner just above the draw-submit button.
 * Uses a plain <div> so it's fully in-JS and play.html stays untouched.
 */
function injectDrawBanner(text, cssClass) {
  clearDrawBanners();
  const submitBtn = document.getElementById('draw-submit');
  if (!submitBtn) return;
  const banner = document.createElement('div');
  banner.id = 'draw-banner';
  banner.className = cssClass || 'play__draw-banner';
  banner.textContent = text;
  submitBtn.parentElement.insertBefore(banner, submitBtn);
}

// ---------------------------------------------------------------------------
// Phase renderers
// ---------------------------------------------------------------------------

function renderWaiting(roomState) {
  showScreen('waiting-screen');
  stopCountdown();
  const ul = document.getElementById('waiting-players');
  if (ul && roomState && roomState.players) {
    ul.innerHTML = roomState.players
      .map((p) => `<li>${p.emoji || ''} ${p.name}</li>`)
      .join('');
  }
}

function renderWrite(assignment) {
  showScreen('write-screen');
  hasSubmitted = false;

  const input = document.getElementById('write-input');
  const submit = document.getElementById('write-submit');

  if (input) {
    input.value = '';
    // L-4: Reset placeholder to original default.
    // renderContinue sets it to 'Keep the story going...' and write-screen is
    // reused, so without this reset the placeholder leaks into the next write phase.
    input.placeholder = 'A motion designer fighting a keyframe dragon...';
    // Scroll into view on focus (mobile keyboard)
    input.addEventListener('focus', () => {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, { once: true });
    input.focus();
  }

  startCountdown(assignment.deadline, 'write-countdown');

  function handleSubmit() {
    const content = (input ? input.value.trim() : '') || '...';
    doSubmit('write', content);
  }

  // Submit button
  if (submit) {
    submit.onclick = handleSubmit;
  }

  // Cmd/Ctrl + Enter on textarea
  if (input) {
    input.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
  }

  scheduleAutoSubmit(assignment.deadline, 'write', () => {
    return (input ? input.value.trim() : '') || '...';
  });
}

function renderDraw(assignment) {
  showScreen('draw-screen');
  hasSubmitted = false;
  clearDrawBanners();

  // Show prompt from prevSlide
  const promptDisplay = document.getElementById('draw-prompt-display');
  if (promptDisplay) {
    if (assignment.prevSlide && assignment.prevSlide.type === 'text') {
      promptDisplay.textContent = assignment.prevSlide.content;
    } else if (assignment.prevSlide && assignment.prevSlide.type === 'drawing') {
      // Shouldn't happen for draw phase from text, but handle gracefully
      promptDisplay.textContent = '';
    } else {
      promptDisplay.textContent = '';
    }
  }

  const phaseKey = assignment.phase; // 'draw' or 'knockoff-draw'

  // _initDrawScreen also restores the countdown element visibility
  _initDrawScreen(phaseKey);

  startCountdown(assignment.deadline, 'draw-countdown');

  scheduleAutoSubmit(assignment.deadline, phaseKey, () => {
    return canvasInstance ? canvasInstance.getDataUrl() : '';
  });
}

function renderDescribe(assignment) {
  showScreen('describe-screen');
  hasSubmitted = false;

  const img = document.getElementById('describe-image');
  if (img && assignment.prevSlide) {
    img.src = assignment.prevSlide.content || '';
  }

  const input = document.getElementById('describe-input');
  const submit = document.getElementById('describe-submit');

  if (input) {
    input.value = '';
    input.addEventListener('focus', () => {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, { once: true });
    input.focus();
  }

  startCountdown(assignment.deadline, 'describe-countdown');

  function handleSubmit() {
    const content = (input ? input.value.trim() : '') || '...';
    doSubmit('describe', content);
  }

  if (submit) {
    submit.onclick = handleSubmit;
  }

  if (input) {
    input.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
  }

  scheduleAutoSubmit(assignment.deadline, 'describe', () => {
    return (input ? input.value.trim() : '') || '...';
  });
}

function renderKnockoffShow(assignment, roomSettings) {
  showScreen('knockoff-show-screen');

  const img = document.getElementById('knockoff-show-image');
  if (img && assignment.prevSlide) {
    img.src = assignment.prevSlide.content || '';
  }

  // Start countdown display
  startCountdown(assignment.deadline, 'knockoff-show-countdown');

  // Auto-advance client-side after knockoffShowSeconds
  if (knockoffShowTimer) clearTimeout(knockoffShowTimer);

  const delay = assignment.deadline - Date.now();
  knockoffShowTimer = setTimeout(() => {
    knockoffShowTimer = null;
    // Server will emit next phase:assignment (knockoff-draw).
    // The client-side transition is just a UI hint — we do nothing here
    // except show a waiting state until server sends the next assignment.
    // Brief transition: show spectator while waiting for next assignment.
    // Pass lastRoomState so renderSpectator picks the right mode.
    renderSpectator(lastRoomState);
  }, Math.max(0, delay));
}

// ---------------------------------------------------------------------------
// New v1.1 phase renderers
// ---------------------------------------------------------------------------

/**
 * renderContinue — reuses #write-screen.
 * Shows the previous sentence as the prompt label so the player knows what
 * to continue from.  Everything else works exactly like renderWrite.
 */
function renderContinue(assignment) {
  showScreen('write-screen');
  hasSubmitted = false;

  const label = document.getElementById('write-prompt-label');
  if (label) {
    const prev = assignment.prevSlide && assignment.prevSlide.content
      ? assignment.prevSlide.content
      : '';
    label.textContent = prev
      ? `Previous: "${prev}" — Continue the story:`
      : 'Continue the story:';
  }

  const input = document.getElementById('write-input');
  const submit = document.getElementById('write-submit');

  if (input) {
    input.value = '';
    input.placeholder = 'Keep the story going...';
    input.addEventListener('focus', () => {
      input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, { once: true });
    input.focus();
  }

  startCountdown(assignment.deadline, 'write-countdown');

  function handleSubmit() {
    const content = (input ? input.value.trim() : '') || '...';
    doSubmit('continue', content);
  }

  if (submit) {
    submit.onclick = handleSubmit;
  }

  if (input) {
    input.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
  }

  scheduleAutoSubmit(assignment.deadline, 'continue', () => {
    return (input ? input.value.trim() : '') || '...';
  });
}

/**
 * initCanvasOnce() — called ONCE at page load from init().
 * Registers pointer listeners exactly once for the lifetime of the page.
 * All subsequent draw phases call canvasInstance.reset() via _initDrawScreen.
 */
function initCanvasOnce() {
  const canvasEl = document.getElementById('draw-canvas');
  const toolbarEl = document.getElementById('draw-toolbar');
  if (!canvasEl || !toolbarEl) return; // draw elements not present — that's OK
  if (canvasInstance) return;          // guard: never call twice
  canvasInstance = initCanvas(canvasEl, toolbarEl);
}

/**
 * _initDrawScreen — shared setup for all draw-phase renders.
 *
 * M-1 FIX: No longer calls initCanvas() (which would add new pointer listeners).
 * canvasInstance is initialized ONCE at page load by initCanvasOnce().
 * This function only calls canvasInstance.reset() (clears pixels + undo stack,
 * rebuilds toolbar DOM) and re-wires the submit button onclick.
 *
 * Also restores countdown element visibility (masterpiece-draw hides it).
 *
 * NOTE: reset() is async because it may load a startImage.  For phases that
 * need a prevImage (coop-draw, missingpiece-draw, background-draw), those
 * callers call reset() directly with { startImage } — they do NOT go through
 * _initDrawScreen for the image load.
 *
 * @param {string} phaseKey
 */
function _initDrawScreen(phaseKey) {
  // Always restore countdown visibility — masterpiece-draw hides it, and a
  // subsequent phase on the same session must show it again.
  const countdown = document.getElementById('draw-countdown');
  if (countdown) {
    countdown.removeAttribute('hidden');
  }

  // Reset canvas state + toolbar DOM without adding new listeners.
  // reset() is async but we don't await here — the blank white canvas is
  // available synchronously; startImage loading is handled by each caller
  // (coop-draw, missingpiece-draw, background-draw) after _initDrawScreen returns.
  if (canvasInstance) {
    canvasInstance.reset();
  }

  const submitBtn = document.getElementById('draw-submit');
  function handleDrawSubmit() {
    const dataUrl = canvasInstance ? canvasInstance.getDataUrl() : null;
    doSubmit(phaseKey, dataUrl || '');
  }
  if (submitBtn) {
    submitBtn.onclick = handleDrawSubmit;
  }

  return canvasInstance;
}

/**
 * renderCoopDraw — reuses #draw-screen.
 * Pre-loads canvas with prevImage (the last drawing in this album chain).
 */
async function renderCoopDraw(assignment) {
  showScreen('draw-screen');
  hasSubmitted = false;
  clearDrawBanners();

  const promptDisplay = document.getElementById('draw-prompt-display');
  if (promptDisplay) {
    promptDisplay.textContent =
      assignment.prevSlide && assignment.prevSlide.content
        ? assignment.prevSlide.content
        : '';
  }

  _initDrawScreen('coop-draw');

  // Show countdown before async image load; auto-submit is set after
  startCountdown(assignment.deadline, 'draw-countdown');

  if (assignment.prevImage) {
    try {
      await canvasInstance.setStartImage(assignment.prevImage);
    } catch (err) {
      console.error('[play.js] coop-draw setStartImage failed:', err);
      showErrorToast('Could not load previous drawing. Starting with blank canvas.');
    }
  }

  scheduleAutoSubmit(assignment.deadline, 'coop-draw', () => {
    return canvasInstance ? canvasInstance.getDataUrl() : '';
  });
}

/**
 * renderMasterpieceDraw — reuses #draw-screen.
 * deadline is null — NO auto-submit. Hides countdown, shows banner.
 */
function renderMasterpieceDraw(assignment) {
  showScreen('draw-screen');
  hasSubmitted = false;
  clearDrawBanners();

  const promptDisplay = document.getElementById('draw-prompt-display');
  if (promptDisplay) {
    promptDisplay.textContent =
      assignment.prevSlide && assignment.prevSlide.content
        ? assignment.prevSlide.content
        : 'Draw your masterpiece!';
  }

  // _initDrawScreen restores countdown visibility first — then we hide it again
  // because masterpiece has no deadline.
  _initDrawScreen('masterpiece-draw');

  // Hide the countdown element — deadline is null for masterpiece
  const countdown = document.getElementById('draw-countdown');
  if (countdown) {
    countdown.textContent = '';
    countdown.setAttribute('hidden', '');
  }
  stopCountdown();

  // Choose banner text: prefer meta frame info if present
  if (assignment.meta && assignment.meta.frameNumber) {
    injectDrawBanner(
      `Frame ${assignment.meta.frameNumber}/${assignment.meta.totalFrames} — No time limit`,
      'play__draw-banner play__draw-banner--no-limit',
    );
  } else {
    injectDrawBanner('No time limit — submit when you\'re done', 'play__draw-banner play__draw-banner--no-limit');
  }

  // DO NOT call scheduleAutoSubmit — deadline is null, submit is manual only.
}

/**
 * renderMissingpieceDraw — reuses #draw-screen.
 * Pre-loads canvas with prevImage, then applies eraseRect (white fill).
 */
async function renderMissingpieceDraw(assignment) {
  showScreen('draw-screen');
  hasSubmitted = false;
  clearDrawBanners();

  const promptDisplay = document.getElementById('draw-prompt-display');
  if (promptDisplay) {
    // CONTRACT §9: "show prev text in prompt-display only for round 1"
    if (assignment.round <= 1 && assignment.prevSlide && assignment.prevSlide.type === 'text') {
      promptDisplay.textContent = assignment.prevSlide.content || '';
    } else {
      promptDisplay.textContent = '';
    }
  }

  _initDrawScreen('missingpiece-draw');
  startCountdown(assignment.deadline, 'draw-countdown');

  if (assignment.prevImage) {
    try {
      await canvasInstance.setStartImage(assignment.prevImage);
      if (assignment.eraseRect) {
        canvasInstance.applyEraseRect(assignment.eraseRect);
      }
    } catch (err) {
      console.error('[play.js] missingpiece-draw setStartImage failed:', err);
      showErrorToast('Could not load previous drawing. Starting with blank canvas.');
    }
  } else if (assignment.eraseRect) {
    // Shouldn't happen per CONTRACT but guard anyway: no image, rect ignored.
    console.warn('[play.js] missingpiece-draw: eraseRect present but no prevImage — ignoring rect');
  }

  scheduleAutoSubmit(assignment.deadline, 'missingpiece-draw', () => {
    return canvasInstance ? canvasInstance.getDataUrl() : '';
  });
}

/**
 * renderBackgroundDraw — reuses #draw-screen.
 * Pre-loads canvas with prevImage (the chosen background data URI).
 */
async function renderBackgroundDraw(assignment) {
  showScreen('draw-screen');
  hasSubmitted = false;
  clearDrawBanners();

  const promptDisplay = document.getElementById('draw-prompt-display');
  if (promptDisplay) {
    promptDisplay.textContent =
      assignment.prevSlide && assignment.prevSlide.content
        ? assignment.prevSlide.content
        : '';
  }

  _initDrawScreen('background-draw');
  startCountdown(assignment.deadline, 'draw-countdown');

  if (assignment.prevImage) {
    try {
      await canvasInstance.setStartImage(assignment.prevImage);
    } catch (err) {
      console.error('[play.js] background-draw setStartImage failed:', err);
      showErrorToast('Could not load background. Starting with blank canvas.');
    }
  }

  scheduleAutoSubmit(assignment.deadline, 'background-draw', () => {
    return canvasInstance ? canvasInstance.getDataUrl() : '';
  });
}

/**
 * renderSpectator(roomState)
 *
 * Two modes:
 *  1. Between-phase waiting (player submitted, others haven't):
 *     Show the rotating "Waiting on others" message. No vote panel.
 *  2. Reveal / ended:
 *     Show the vote panel. Hide the rotating message.
 *
 * Called from applyState — always pass the current roomState so the vote
 * panel can be built / refreshed.
 */
function renderSpectator(roomState) {
  stopCountdown();
  clearAutoSubmit();
  showScreen('spectator-screen');

  const state = roomState && roomState.state;

  if (state === 'reveal' || state === 'ended') {
    // Vote mode — panel manages #spectator-message visibility
    showVotePanelForCurrentAlbum(roomState);
  } else {
    // Between-phase waiting mode — show rotating message, no vote panel
    // Remove vote panel if somehow present
    const panel = document.getElementById('m-vote-panel');
    if (panel) panel.remove();
    const spectatorMsg = document.getElementById('spectator-message');
    if (spectatorMsg) spectatorMsg.removeAttribute('hidden');
    nextSpectatorMessage();
  }
}

// ---------------------------------------------------------------------------
// Determine which screen to show based on current state + assignment
// ---------------------------------------------------------------------------

function applyState(roomState, assignment, submitted) {
  if (!roomState) return;

  const state = roomState.state;

  // Reveal or ended → spectator with vote panel
  if (state === 'reveal' || state === 'ended') {
    renderSpectator(roomState);
    return;
  }

  // Lobby
  if (state === 'lobby') {
    renderWaiting(roomState);
    return;
  }

  // Playing — use assignment to decide screen
  if (state === 'playing') {
    if (!assignment) {
      renderWaiting(roomState);
      return;
    }

    if (submitted) {
      renderSpectator(roomState);
      return;
    }

    const phase = assignment.phase;

    if (phase === 'write') {
      renderWrite(assignment);
    } else if (phase === 'draw' || phase === 'knockoff-draw') {
      renderDraw(assignment);
    } else if (phase === 'describe') {
      renderDescribe(assignment);
    } else if (phase === 'knockoff-show') {
      renderKnockoffShow(assignment, roomState.settings);
    } else if (phase === 'continue') {
      renderContinue(assignment);
    } else if (phase === 'coop-draw') {
      renderCoopDraw(assignment);
    } else if (phase === 'masterpiece-draw') {
      renderMasterpieceDraw(assignment);
    } else if (phase === 'missingpiece-draw') {
      renderMissingpieceDraw(assignment);
    } else if (phase === 'background-draw') {
      renderBackgroundDraw(assignment);
    } else {
      renderSpectator(roomState);
    }
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  roomCode = getRoomCodeFromPath();

  if (!roomCode) {
    // No code in path — go home
    window.location.href = '/';
    return;
  }

  // M-1 FIX: Initialize canvas exactly once.  Pointer listeners are attached
  // here and never again.  _initDrawScreen calls canvasInstance.reset() only.
  initCanvasOnce();

  myPlayerId = getStoredPlayerId();
  const name = getStoredName();
  const emoji = getStoredEmoji();

  if (!myPlayerId || !name) {
    // Not registered — redirect to lobby with room pre-filled
    window.location.href = `/?room=${roomCode}`;
    return;
  }

  const socket = getSocket();

  // Rejoin the room
  try {
    const resp = await emitAck('room:join', {
      code: roomCode,
      name,
      emoji,
      resumePlayerId: myPlayerId,
    });

    if (!resp || resp.ok === false) {
      window.location.href = `/?room=${roomCode}`;
      return;
    }

    // Server may return updated playerId on reconnect
    if (resp.playerId) {
      myPlayerId = resp.playerId;
      setStoredPlayerId(myPlayerId);
    }

    // Apply initial room state if bundled in join response
    if (resp.room) {
      lastRoomState = resp.room;
      applyState(lastRoomState, lastAssignment, hasSubmitted);
    } else {
      // Show waiting until server broadcasts room:state
      showScreen('waiting-screen');
    }
  } catch (err) {
    showErrorToast('Could not rejoin room. Redirecting...');
    setTimeout(() => {
      window.location.href = `/?room=${roomCode}`;
    }, 2000);
    return;
  }

  // ---------------------------------------------------------------------------
  // Socket event listeners
  // ---------------------------------------------------------------------------

  socket.on('room:state', (state) => {
    const prevState = lastRoomState && lastRoomState.state;
    lastRoomState = state;

    // Update waiting list always
    const ul = document.getElementById('waiting-players');
    if (ul && state.players) {
      ul.innerHTML = state.players
        .map((p) => `<li>${p.emoji || ''} ${p.name}</li>`)
        .join('');
    }

    // If state changed to lobby (e.g. game reset), reset local state
    if (state.state === 'lobby') {
      hasSubmitted = false;
      lastAssignment = null;
      stopCountdown();
      clearAutoSubmit();
      if (knockoffShowTimer) { clearTimeout(knockoffShowTimer); knockoffShowTimer = null; }
      // FEAT-PLAY: Remove vote panel and restore spectator message on lobby reset
      removeVotePanel();
    }

    // Sound hook: reveal fanfare fires once when transitioning into reveal state
    if (state.state === 'reveal' && prevState !== 'reveal') {
      tryPlaySound('playReveal');
      // FEAT-PLAY: Reset currentAlbumIdx to 0 on fresh reveal transition.
      // reveal:album / reveal:slide will update it as the host advances.
      currentAlbumIdx = 0;
      myCurrentVote = null;
      pendingTally = null;
    }

    // Check if I'm in the submitted list for current phase
    let submittedThisPhase = false;
    if (state.currentPhase && myPlayerId) {
      submittedThisPhase = (state.currentPhase.submitted || []).includes(myPlayerId);
    }

    if (submittedThisPhase && !hasSubmitted) {
      hasSubmitted = true;
    }

    applyState(lastRoomState, lastAssignment, hasSubmitted);
  });

  socket.on('phase:assignment', (assignment) => {
    // New assignment — reset submission flag
    hasSubmitted = false;
    lastAssignment = assignment;
    clearAutoSubmit();
    stopCountdown();
    if (knockoffShowTimer) { clearTimeout(knockoffShowTimer); knockoffShowTimer = null; }
    // Sound hook: new phase starting
    tryPlaySound('playPhaseStart');
    applyState(lastRoomState, lastAssignment, hasSubmitted);
  });

  socket.on('phase:tick', (data) => {
    // Update the deadline reference for countdown precision
    if (data && data.endsAt) {
      currentDeadline = data.endsAt;
    }
  });

  // -------------------------------------------------------------------------
  // FEAT-PLAY: Vote panel — album tracking during reveal
  // -------------------------------------------------------------------------

  // reveal:slide is emitted per-slide in stepper reveal layouts.
  // We use albumIdx to know which album is currently being shown.
  socket.on('reveal:slide', ({ albumIdx }) => {
    if (albumIdx === undefined || albumIdx === null) return;
    if (albumIdx !== currentAlbumIdx) {
      currentAlbumIdx = albumIdx;
      // Rebuild vote panel for the new album
      if (lastRoomState && (lastRoomState.state === 'reveal' || lastRoomState.state === 'ended')) {
        buildVotePanel(currentAlbumIdx, lastRoomState);
      }
    }
  });

  // reveal:album is emitted for non-stepper layouts (full album at once).
  socket.on('reveal:album', ({ albumIdx }) => {
    if (albumIdx === undefined || albumIdx === null) return;
    if (albumIdx !== currentAlbumIdx) {
      currentAlbumIdx = albumIdx;
      // Rebuild vote panel for the new album
      if (lastRoomState && (lastRoomState.state === 'reveal' || lastRoomState.state === 'ended')) {
        buildVotePanel(currentAlbumIdx, lastRoomState);
      }
    }
  });

  // vote:tally — broadcast after each vote is processed by the server.
  // CONTRACT §3: { tallies: [{ albumIdx, votes: [{ slideIdx, count }] }], myVote }
  socket.on('vote:tally', (tallyPayload) => {
    if (currentAlbumIdx === null) {
      // Panel not ready yet — cache and apply on next buildVotePanel call
      pendingTally = tallyPayload;
      return;
    }
    _applyTally(tallyPayload);
  });

  // Kicked banner (CONTRACT_v3 §3 — server emits this before disconnecting)
  socket.on('kicked', ({ reason }) => {
    // Inject a full-screen overlay banner; no play.html changes needed.
    const existing = document.getElementById('kicked-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'kicked-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(0,0,0,0.85)',
      'color:#fff', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'font-family:inherit', 'text-align:center', 'padding:2rem',
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = 'You have been removed';
    title.style.cssText = 'margin:0 0 1rem; font-size:1.6rem;';

    const msg = document.createElement('p');
    msg.textContent = reason || 'Host removed you from the room.';
    msg.style.cssText = 'margin:0 0 1.5rem; font-size:1.1rem; opacity:0.85;';

    const countEl = document.createElement('p');
    countEl.style.cssText = 'font-size:2rem; font-weight:bold;';
    countEl.textContent = '5';

    overlay.appendChild(title);
    overlay.appendChild(msg);
    overlay.appendChild(countEl);
    document.body.appendChild(overlay);

    // Sound hook: kicked (playKicked defined in sounds.js by FEAT-SND-CSS)
    tryPlaySound('playKicked');

    // 5-second countdown then redirect to home
    let seconds = 5;
    const ticker = setInterval(() => {
      seconds -= 1;
      countEl.textContent = String(seconds);
      if (seconds <= 0) {
        clearInterval(ticker);
        window.location.href = '/';
      }
    }, 1000);
  });

  socket.on('error', (err) => {
    const msg = (err && err.message) ? err.message : 'An error occurred.';
    showErrorToast(msg);
  });

  // MINOR-4: Mount sound toggle so players can opt into sounds
  import('./sounds.js').then(m => m.mountSoundToggle(document.body)).catch(() => {});
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
