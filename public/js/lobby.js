// lobby.js — Agent B: Lobby page (index.html)
// Handles create-room and join-room flows.

import {
  getSocket,
  emitAck,
  getStoredName,
  getStoredEmoji,
  getStoredPlayerId,
  setStoredName,
  setStoredEmoji,
  setStoredPlayerId,
  getRoomCodeFromQuery,
} from './socket-client.js';

// --- DOM refs ---
const errorBanner   = document.getElementById('error-banner');
const createForm    = document.getElementById('create-form');
const createName    = document.getElementById('create-name');
const createEmoji   = document.getElementById('create-emoji');
const createSubmit  = document.getElementById('create-submit');
const joinForm      = document.getElementById('join-form');
const joinCode      = document.getElementById('join-code');
const joinName      = document.getElementById('join-name');
const joinEmoji     = document.getElementById('join-emoji');
const joinSubmit    = document.getElementById('join-submit');

// --- helpers ---
function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.textContent = '';
  errorBanner.hidden = true;
}

function setInFlight(btn, busy) {
  btn.disabled = busy;
}

// --- pre-fill on load ---
(function init() {
  // Ensure socket singleton is alive early
  getSocket();

  const storedName  = getStoredName();
  const storedEmoji = getStoredEmoji();

  if (storedName)  { createName.value = storedName;  joinName.value  = storedName; }
  if (storedEmoji) { createEmoji.value = storedEmoji; joinEmoji.value = storedEmoji; }

  // Auto-fill join code from ?room= query param
  const qCode = getRoomCodeFromQuery();
  if (qCode) {
    joinCode.value = qCode;
    // Scroll / focus join form so user sees it immediately
    joinForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    joinName.focus();
  }
})();

// --- Create room ---
createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const name  = createName.value.trim();
  const emoji = createEmoji.value.trim() || '🎨';

  if (!name || name.length > 16) {
    showError('Name must be 1–16 characters.');
    return;
  }

  setInFlight(createSubmit, true);
  try {
    const resp = await emitAck('room:create', { name, emoji });
    // resp: { ok: true, code, playerId, joinUrl }
    setStoredName(name);
    setStoredEmoji(emoji);
    setStoredPlayerId(resp.playerId);
    window.location.href = `/host/${resp.code}`;
  } catch (err) {
    showError(err.message || 'Failed to create room.');
    setInFlight(createSubmit, false);
  }
});

// --- Join room ---
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const code  = joinCode.value.trim().toUpperCase();
  const name  = joinName.value.trim();
  const emoji = joinEmoji.value.trim() || '🎨';

  if (code.length !== 4) {
    showError('Room code must be 4 characters.');
    return;
  }
  if (!name || name.length > 16) {
    showError('Name must be 1–16 characters.');
    return;
  }

  const payload = { code, name, emoji };
  const resumePlayerId = getStoredPlayerId();
  if (resumePlayerId) payload.resumePlayerId = resumePlayerId;

  setInFlight(joinSubmit, true);
  try {
    const resp = await emitAck('room:join', payload);
    // resp: { ok, playerId, isHost, room? }
    setStoredName(name);
    setStoredEmoji(emoji);
    setStoredPlayerId(resp.playerId);

    if (resp.isHost) {
      window.location.href = `/host/${code}`;
    } else {
      window.location.href = `/play/${code}`;
    }
  } catch (err) {
    showError(err.message || 'Failed to join room.');
    setInFlight(joinSubmit, false);
  }
});

// MINOR-4: Mount sound toggle so lobby visitors can opt into sounds
import('./sounds.js').then(m => m.mountSoundToggle(document.body)).catch(() => {});
