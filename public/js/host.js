// host.js — Agent B (v1) + Agent E (v1.1 extensions)
// Handles room state display, player list, settings, start/skip,
// and new-mode sub-panels (Secret reorder, Masterpiece/Background prompt,
// Background picker, Knock-Off show seconds, Speedrun preset, End Phase button).
// IMPORTANT: Do NOT touch #reveal-* or #album-* elements — those belong to Agent D.

import {
  getSocket,
  emitAck,
  getStoredName,
  getStoredEmoji,
  getStoredPlayerId,
  setStoredPlayerId,
  getRoomCodeFromPath,
} from './socket-client.js';

// --- DOM refs (B-owned only) ---
const roomCodeEl      = document.getElementById('room-code');
const qrImage         = document.getElementById('qr-image');
const joinUrlEl       = document.getElementById('join-url');
const playerList      = document.getElementById('player-list');
const settingsPanel   = document.getElementById('settings-panel');
const settingMode     = document.getElementById('setting-mode');
const settingWrite    = document.getElementById('setting-write');
const settingDraw     = document.getElementById('setting-draw');
const settingDescribe = document.getElementById('setting-describe');
const startGameBtn    = document.getElementById('start-game');
const phaseStatus     = document.getElementById('phase-status');
const phaseName       = document.getElementById('phase-name');
const phaseCountdown  = document.getElementById('phase-countdown');
const submittedCount  = document.getElementById('submitted-count');
const skipPhaseBtn    = document.getElementById('skip-phase');

// --- Agent E: new DOM refs ---
const mModeDescription   = document.getElementById('m-mode-description');
const mKnockoffShowWrap  = document.getElementById('m-knockoff-show-wrap');
const mKnockoffShow      = document.getElementById('m-knockoff-show');
const mMasterPromptWrap  = document.getElementById('m-master-prompt-wrap');
const mMasterPrompt      = document.getElementById('m-master-prompt');
const mBgPickerWrap      = document.getElementById('m-bg-picker-wrap');
const mBgPicker          = document.getElementById('m-bg-picker');
const mSecretOrderWrap   = document.getElementById('m-secret-order-wrap');
const mSecretOrder       = document.getElementById('m-secret-order');
const mSpeedrunBtn       = document.getElementById('m-speedrun-btn');
const mEndPhaseBtn       = document.getElementById('m-end-phase-btn');

// --- FEAT-HOST: new v2 DOM refs ---
const mAnimationFpsWrap   = document.getElementById('m-animation-fps-wrap');
const mAnimationFps       = document.getElementById('m-animation-fps');
const mCustomPromptsWrap  = document.getElementById('m-custom-prompts-wrap');
const mCustomPrompts      = document.getElementById('m-custom-prompts');
const mVoteTally          = document.getElementById('m-vote-tally');      // Reserved — vote tally rendered by album.js
const mVoteTallyBody      = document.getElementById('m-vote-tally-body'); // Reserved — vote tally rendered by album.js
const mWinnersGallery     = document.getElementById('m-winners-gallery');
const mWinnersGalleryBody = document.getElementById('m-winners-gallery-body');

// --- Agent E: mode descriptions ---
const MODE_DESCRIPTIONS = {
  classic:      'The original. Write a sentence, then draw and describe in rotation. See how mangled your prompt gets.',
  knockoff:     'Each round you see the previous drawing for a few seconds, then redraw it from memory. Degradation guaranteed.',
  solo:         'Everyone draws the same prompt at the same time. Single album, side-by-side reveal.',
  story:        'Text-only chain. You see only the previous sentence and write the next. The full story unfolds at reveal.',
  animation:    'Each player adds one frame to a tiny animation. Frames loop at the reveal — a flipbook made by committee.',
  coop:         'Pass an unfinished drawing — each player continues the previous instead of starting over.',
  masterpiece:  'No timer, one drawing per player to a shared prompt. Take your time. Reveal is a gallery.',
  missingpiece: 'Draw a sentence, then each round a chunk of the drawing gets erased and the next player fills it back in. Drift incoming.',
  background:   'Everyone draws on the same shared background image. Reveal shows them side by side.',
  secret:       'Like Classic, but the host sets the pass order instead of going around the room.',
};

// --- Agent E: background cache ---
let _bgLoaded = false;

// --- L-6 fix: guard flag so attachSecretDrag() only wires listeners once ---
let _secretDragAttached = false;

// --- Error toast (created once, inserted at top of #host-root) ---
let errorToast = null;
function getOrCreateErrorToast() {
  if (!errorToast) {
    errorToast = document.createElement('div');
    errorToast.className = 'host__error-toast';
    errorToast.style.cssText = [
      'display:none',
      'position:fixed',
      'top:1rem',
      'left:50%',
      'transform:translateX(-50%)',
      'background:#ff5a5f',
      'color:#fff',
      'padding:0.6rem 1.2rem',
      'border-radius:6px',
      'font-weight:700',
      'z-index:9999',
      'max-width:90vw',
      'text-align:center',
    ].join(';');
    const hostRoot = document.getElementById('host-root');
    hostRoot.prepend(errorToast);
  }
  return errorToast;
}

let errorToastTimer = null;
function showErrorToast(msg, durationMs = 4000) {
  const el = getOrCreateErrorToast();
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(() => { el.style.display = 'none'; }, durationMs);
}

// --- Render player list ---
function renderPlayers(players, hostId) {
  playerList.innerHTML = '';
  for (const p of players) {
    const li = document.createElement('li');
    li.className = 'host__player' + (p.id === hostId ? ' host__player--host' : '');
    if (!p.connected) li.classList.add('host__player--disconnected');

    // Color dot
    const dot = document.createElement('span');
    dot.className = 'host__player-dot';
    dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px;flex-shrink:0;`;

    // Emoji
    const emojiSpan = document.createElement('span');
    emojiSpan.className = 'host__player-emoji';
    emojiSpan.textContent = p.emoji;
    emojiSpan.style.marginRight = '4px';

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'host__player-name';
    nameSpan.textContent = p.name;
    if (!p.connected) nameSpan.style.opacity = '0.45';

    // Host marker / kick button
    if (p.id === hostId) {
      const star = document.createElement('span');
      star.className = 'host__player-star';
      star.textContent = ' ★'; // ★
      star.style.marginLeft = '4px';
      li.append(dot, emojiSpan, nameSpan, star);
    } else {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'host__player-kick';
      kickBtn.setAttribute('aria-label', 'Kick player');
      kickBtn.textContent = '×';
      kickBtn.addEventListener('click', () => {
        if (confirm('Kick ' + p.name + '?')) {
          const socket = getSocket();
          socket.emit('room:kick', { playerId: p.id });
        }
      });
      li.append(dot, emojiSpan, nameSpan, kickBtn);
    }

    playerList.appendChild(li);
  }
}

// --- Apply room:state ---
function applyState(state) {
  // Room code
  roomCodeEl.textContent = (state.code || '----').toUpperCase();

  // Keep player cache in sync (needed by secret reorder)
  _currentPlayers = state.players || [];

  // Player list
  renderPlayers(_currentPlayers, state.hostId);

  // Sync settings inputs when in lobby (so UI reflects server state)
  if (state.settings && state.state === 'lobby') {
    const s = state.settings;
    if (s.mode !== undefined)                settingMode.value       = s.mode;
    if (s.writeSeconds !== undefined)        settingWrite.value      = s.writeSeconds;
    if (s.drawSeconds !== undefined)         settingDraw.value       = s.drawSeconds;
    if (s.describeSeconds !== undefined)     settingDescribe.value   = s.describeSeconds;
    if (s.knockoffShowSeconds !== undefined) mKnockoffShow.value     = s.knockoffShowSeconds;
    // Trigger sub-panel visibility update for whatever mode is now selected
    applyModeSubPanels(settingMode.value);
  }

  // Sync new v2 fields
  if (state.masterprompt !== undefined && mMasterPrompt.value !== state.masterprompt) {
    mMasterPrompt.value = state.masterprompt || '';
  }
  // Sync customPrompts textarea (only when not focused and value differs from server)
  if (state.state === 'lobby' && mCustomPrompts && document.activeElement !== mCustomPrompts) {
    const serverVal = (state.customPrompts && state.customPrompts.length > 0)
      ? state.customPrompts.join('\n')
      : '';
    if (mCustomPrompts.value !== serverVal) {
      mCustomPrompts.value = serverVal;
    }
  }
  // Sync animationFps input (only in lobby and only when value differs)
  if (state.state === 'lobby' && mAnimationFps && state.settings && state.settings.animationFps !== undefined) {
    const serverFps = String(state.settings.animationFps);
    if (mAnimationFps.value !== serverFps) {
      mAnimationFps.value = serverFps;
    }
  }
  // Sync seat order when state says secret
  if (state.state === 'lobby' && state.settings && state.settings.mode === 'secret') {
    renderSecretOrder(state.players || [], state.seatOrder || null);
  }
  // Highlight background selection if present
  if (state.backgroundId) {
    document.querySelectorAll('.host__bg-thumb').forEach(b => {
      b.classList.toggle('host__bg-thumb--selected', b.dataset.bgId === state.backgroundId);
    });
  }

  // Panel visibility — NEVER touch #reveal-panel (Agent D owns it)
  if (state.state === 'lobby') {
    settingsPanel.hidden = false;
    phaseStatus.hidden   = true;
  } else if (state.state === 'playing') {
    settingsPanel.hidden = true;
    phaseStatus.hidden   = false;

    if (state.currentPhase) {
      const cp = state.currentPhase;
      phaseName.textContent = (cp.name || '').toUpperCase();
      const submitted = (cp.submitted || []).length;
      const total     = (state.players || []).length;
      submittedCount.textContent = `${submitted}/${total} submitted`;

      // Show End Phase button only during masterpiece-draw
      mEndPhaseBtn.hidden = (cp.name !== 'masterpiece-draw');
    }
  } else if (state.state === 'reveal' || state.state === 'ended') {
    settingsPanel.hidden = true;
    phaseStatus.hidden   = true;
    // reveal-panel visibility is Agent D's responsibility — do not touch
  }

  // Store join URL on first state arrival (may be needed before QR fetch resolves)
  if (state.joinUrl && !joinUrlEl.textContent) {
    joinUrlEl.textContent = state.joinUrl;
  }
}

// --- Build settings object from current inputs ---
function readSettings() {
  return {
    mode:                 settingMode.value,
    writeSeconds:         Number(settingWrite.value),
    drawSeconds:          Number(settingDraw.value),
    describeSeconds:      Number(settingDescribe.value),
    knockoffShowSeconds:  Number(mKnockoffShow.value),
  };
}

// --- Agent E: show/hide sub-panels based on current mode ---
function applyModeSubPanels(mode) {
  mModeDescription.textContent = MODE_DESCRIPTIONS[mode] || '';

  mKnockoffShowWrap.hidden  = (mode !== 'knockoff');
  mMasterPromptWrap.hidden  = (mode !== 'masterpiece' && mode !== 'background');
  mBgPickerWrap.hidden      = (mode !== 'background');
  mSecretOrderWrap.hidden   = (mode !== 'secret');
  if (mAnimationFpsWrap) mAnimationFpsWrap.hidden = (mode !== 'animation');

  if (mode === 'background' && !_bgLoaded) {
    loadBackgroundPicker();
  }
  if (mode === 'secret') {
    // Render current player list into reorder UI if it isn't already populated
    const currentPlayers = getCurrentPlayers();
    if (currentPlayers.length > 0 && mSecretOrder.children.length === 0) {
      renderSecretOrder(currentPlayers, null);
    }
  }
}

// --- Agent E: load backgrounds from /api/backgrounds ---
async function loadBackgroundPicker() {
  _bgLoaded = true; // set early to avoid double-fetch on rapid mode switches
  try {
    const resp = await fetch('/api/backgrounds');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const { backgrounds } = await resp.json();
    mBgPicker.innerHTML = '';
    backgrounds.forEach(bg => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'host__bg-thumb';
      btn.dataset.bgId = bg.id;
      btn.innerHTML = `<img src="${bg.dataUri}" alt="${bg.name}"><span>${bg.name}</span>`;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.host__bg-thumb').forEach(b => b.classList.remove('host__bg-thumb--selected'));
        btn.classList.add('host__bg-thumb--selected');
        const socket = getSocket();
        socket.emit('room:background', { backgroundId: bg.id });
      });
      mBgPicker.appendChild(btn);
    });
  } catch (_err) {
    mBgPicker.innerHTML = '<p class="host__bg-unavailable">Backgrounds unavailable</p>';
    _bgLoaded = false; // allow retry if fetch failed
  }
}

// --- Agent E: keep track of current player list for secret reorder ---
let _currentPlayers = [];
function getCurrentPlayers() { return _currentPlayers; }

// --- Agent E: render secret pass-order list ---
function renderSecretOrder(players, seatOrder) {
  // Build ordered array of players
  let ordered;
  if (seatOrder && seatOrder.length === players.length) {
    ordered = seatOrder.map(id => players.find(p => p.id === id)).filter(Boolean);
    // Append any players not covered by seatOrder (shouldn't happen, but safety)
    players.forEach(p => { if (!ordered.find(o => o.id === p.id)) ordered.push(p); });
  } else {
    ordered = [...players];
  }

  mSecretOrder.innerHTML = '';

  ordered.forEach((player, idx) => {
    const li = document.createElement('li');
    li.className = 'host__secret-item';
    li.dataset.playerId = player.id;

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'host__secret-arrow';
    upBtn.textContent = '▲';
    upBtn.disabled = (idx === 0);
    upBtn.setAttribute('aria-label', `Move ${player.name} up`);

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'host__secret-arrow';
    downBtn.textContent = '▼';
    downBtn.disabled = (idx === ordered.length - 1);
    downBtn.setAttribute('aria-label', `Move ${player.name} down`);

    const label = document.createElement('span');
    label.className = 'host__secret-label';
    label.textContent = `${player.emoji} ${player.name}`;

    upBtn.addEventListener('click', () => swapSecretOrder(idx, idx - 1));
    downBtn.addEventListener('click', () => swapSecretOrder(idx, idx + 1));

    li.append(upBtn, label, downBtn);
    mSecretOrder.appendChild(li);
  });

  // Drag-to-reorder with pointer events
  attachSecretDrag();
}

// Swap two items in the rendered list and emit updated order
function swapSecretOrder(fromIdx, toIdx) {
  const items = Array.from(mSecretOrder.children);
  if (toIdx < 0 || toIdx >= items.length) return;

  const ref = toIdx > fromIdx ? items[toIdx].nextSibling : items[toIdx];
  mSecretOrder.insertBefore(items[fromIdx], ref);

  emitSeatOrder();
  // Re-render to update disabled states on arrows
  const players = getSecretOrderedPlayers();
  renderSecretOrder(players, null);
}

// Read current order from DOM and return player objects
function getSecretOrderedPlayers() {
  return Array.from(mSecretOrder.children).map(li => {
    const id = li.dataset.playerId;
    return _currentPlayers.find(p => p.id === id);
  }).filter(Boolean);
}

// Emit room:seatorder with current DOM order
function emitSeatOrder() {
  const order = Array.from(mSecretOrder.children).map(li => li.dataset.playerId);
  const socket = getSocket();
  socket.emit('room:seatorder', { order });
}

// --- Agent E: pointer-based drag-to-reorder for secret list ---
// L-6 fix: listeners are attached to the stable #m-secret-order container once for
// the page lifetime. Re-rendering children (via renderSecretOrder) does NOT remove
// container-level pointer listeners, so there is no need to re-attach on each render.
function attachSecretDrag() {
  if (_secretDragAttached) return;
  _secretDragAttached = true;

  let dragEl = null;
  let startY = 0;
  let origIdx = -1;

  mSecretOrder.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li.host__secret-item');
    if (!li) return;
    // Don't start drag if user tapped an arrow button
    if (e.target.classList.contains('host__secret-arrow')) return;

    dragEl = li;
    origIdx = Array.from(mSecretOrder.children).indexOf(li);
    startY = e.clientY;
    li.classList.add('host__secret-item--dragging');
    li.setPointerCapture(e.pointerId);
  }, { passive: true });

  mSecretOrder.addEventListener('pointermove', (e) => {
    if (!dragEl) return;
    const deltaY = e.clientY - startY;
    const items = Array.from(mSecretOrder.children);
    const itemH = dragEl.getBoundingClientRect().height || 44;
    const steps = Math.round(deltaY / itemH);
    const newIdx = Math.min(items.length - 1, Math.max(0, origIdx + steps));

    if (newIdx !== origIdx) {
      const ref = newIdx > origIdx ? items[newIdx].nextSibling : items[newIdx];
      mSecretOrder.insertBefore(dragEl, ref);
    }
  }, { passive: true });

  const endDrag = () => {
    if (!dragEl) return;
    dragEl.classList.remove('host__secret-item--dragging');
    dragEl = null;
    emitSeatOrder();
    // Re-render to update arrow disabled states
    const players = getSecretOrderedPlayers();
    renderSecretOrder(players, null);
  };

  mSecretOrder.addEventListener('pointerup', endDrag, { passive: true });
  mSecretOrder.addEventListener('pointercancel', endDrag, { passive: true });
}

// --- Agent E: debounced masterprompt emit ---
let _masterPromptTimer = null;
function onMasterPromptInput() {
  clearTimeout(_masterPromptTimer);
  _masterPromptTimer = setTimeout(() => {
    const socket = getSocket();
    socket.emit('room:masterprompt', { prompt: mMasterPrompt.value.slice(0, 300) });
  }, 500);
}

// --- Settings change → emit room:settings ---
// (referenced inside init(); defined here so readSettings() is in scope)
function onSettingsChange() {
  const socket = getSocket();
  socket.emit('room:settings', readSettings());
}

// --- Entry point ---
async function init() {
  const code = getRoomCodeFromPath();
  if (!code) {
    // Fallback: no room code in URL — shouldn't happen in normal flow
    window.location.href = '/';
    return;
  }

  const storedId    = getStoredPlayerId();
  const storedName  = getStoredName();
  const storedEmoji = getStoredEmoji();

  // If no stored playerId, redirect to lobby to rejoin
  if (!storedId) {
    window.location.href = `/?room=${code}`;
    return;
  }

  const socket = getSocket();

  // Listen for server error events
  socket.on('error', (err) => {
    const msg = (err && err.message) ? err.message : JSON.stringify(err);
    showErrorToast(msg);
  });

  // Listen for room state
  socket.on('room:state', applyState);

  // Agent E: initialise mode sub-panels on page load
  applyModeSubPanels(settingMode.value);

  // Listen for phase tick → update countdown
  socket.on('phase:tick', ({ endsAt }) => {
    const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    phaseCountdown.textContent = `${secs}s`;
  });

  // Rejoin the room with stored identity
  try {
    const resp = await emitAck('room:join', {
      code,
      name:           storedName || 'Host',
      emoji:          storedEmoji || '🎨',
      resumePlayerId: storedId,
    });
    // Update stored playerId in case server issued a new one
    if (resp && resp.playerId) setStoredPlayerId(resp.playerId);
  } catch (err) {
    // Room may no longer exist — redirect to lobby
    window.location.href = '/';
    return;
  }

  // --- M-7 fix: wire ALL event listeners here, after socket join is confirmed ---
  // The socket is properly joined to the room at this point; listeners attached
  // earlier would emit events before room ctx exists on the server.
  //
  // ORDER:
  //   1. Master prompt (text input → debounced emit)
  //   2. Knockoff show-seconds (select change → settings emit)
  //   3. Speedrun preset button
  //   4. End-phase button (Masterpiece)
  //   5. Core settings inputs (mode, write, draw, describe)
  //   6. Start game button
  //   7. Skip phase button
  //
  // FEAT-HOST agent: add v2 listener wiring below item 7, before the closing
  // comment. Follow the same pattern — one comment per listener group.

  // 1. Master prompt
  mMasterPrompt.addEventListener('input', onMasterPromptInput);

  // 2. Knockoff show-seconds → fold into full settings emit
  mKnockoffShow.addEventListener('change', () => {
    const socket = getSocket();
    socket.emit('room:settings', readSettings());
  });

  // 3. Speedrun preset
  mSpeedrunBtn.addEventListener('click', () => {
    settingWrite.value    = 15;
    settingDraw.value     = 30;
    settingDescribe.value = 15;
    mKnockoffShow.value   = 4;
    const socket = getSocket();
    socket.emit('room:settings', {
      mode:                settingMode.value,
      writeSeconds:        15,
      drawSeconds:         30,
      describeSeconds:     15,
      knockoffShowSeconds: 4,
    });
  });

  // 4. End-phase button (Masterpiece forced advance)
  mEndPhaseBtn.addEventListener('click', () => {
    const socket = getSocket();
    socket.emit('phase:skip');
  });

  // 5. Core settings inputs
  settingMode.addEventListener('change', () => {
    applyModeSubPanels(settingMode.value);
    onSettingsChange();
  });
  settingWrite.addEventListener('change', onSettingsChange);
  settingDraw.addEventListener('change', onSettingsChange);
  settingDescribe.addEventListener('change', onSettingsChange);

  // 6. Start game
  startGameBtn.addEventListener('click', () => {
    const socket = getSocket();
    // Emit settings first to guarantee server has latest values, then start
    socket.emit('room:settings', readSettings());
    socket.emit('game:start');
  });

  // 7. Skip phase
  skipPhaseBtn.addEventListener('click', () => {
    const socket = getSocket();
    socket.emit('phase:skip');
  });

  // 8. Custom prompts textarea — debounced emit (500ms)
  let _customPromptsTimer = null;
  if (mCustomPrompts) {
    mCustomPrompts.addEventListener('input', () => {
      clearTimeout(_customPromptsTimer);
      _customPromptsTimer = setTimeout(() => {
        const raw = mCustomPrompts.value;
        const prompts = raw.split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .slice(0, 100)
          .map(s => s.slice(0, 300));
        const sock = getSocket();
        sock.emit('room:prompts', { prompts });
      }, 500);
    });
  }

  // 9. Animation FPS input — clamp 1-12 on change
  if (mAnimationFps) {
    mAnimationFps.addEventListener('change', () => {
      const raw = Number(mAnimationFps.value);
      const fps = Math.min(12, Math.max(1, raw || 3));
      mAnimationFps.value = fps;
      const sock = getSocket();
      sock.emit('room:animation-fps', { fps });
    });
  }

  // --- END listener wiring — FEAT-HOST: add v2 listeners above this line ---

  // Fetch QR code for the join URL
  const joinUrl = `${location.origin}/?room=${code}`;
  joinUrlEl.textContent = joinUrl;

  try {
    const qrResp = await fetch(`/api/qr?text=${encodeURIComponent(joinUrl)}`);
    if (qrResp.ok) {
      const data = await qrResp.json().catch(() => null);
      const src = data && (data.dataUrl || data.dataUri);
      if (src) {
        qrImage.src = src;
      } else if (data && data.svg) {
        qrImage.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data.svg);
      }
    }
  } catch (_) {
    // QR fetch failing is non-fatal — the text URL is still shown
  }
}

init();
