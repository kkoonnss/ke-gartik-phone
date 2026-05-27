// Shared Socket.io wrapper — pre-written by orchestrator. Do not modify.
// Exposes a single connection plus tiny helpers for player identity persistence.

const STORAGE = {
  playerId: 'gartik.playerId',
  name: 'gartik.name',
  emoji: 'gartik.emoji',
};

export function getStoredName() { return localStorage.getItem(STORAGE.name) || ''; }
export function getStoredEmoji() { return localStorage.getItem(STORAGE.emoji) || '🎨'; }
export function getStoredPlayerId() { return localStorage.getItem(STORAGE.playerId) || null; }

export function setStoredName(name) { localStorage.setItem(STORAGE.name, name); }
export function setStoredEmoji(e) { localStorage.setItem(STORAGE.emoji, e); }
export function setStoredPlayerId(pid) { localStorage.setItem(STORAGE.playerId, pid); }

// Singleton socket — io is provided globally by the CDN script tag.
let _socket = null;
export function getSocket() {
  if (!_socket) {
    _socket = window.io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return _socket;
}

// Promise-style emit-with-ack.
export function emitAck(event, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    let done = false;
    const t = setTimeout(() => {
      if (!done) { done = true; reject(new Error('Server timeout')); }
    }, timeoutMs);
    s.emit(event, payload, (resp) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (resp && resp.ok === false) reject(new Error(resp.error || 'Server error'));
      else resolve(resp);
    });
  });
}

// Get/set the room code from the URL path (/host/CODE or /play/CODE).
export function getRoomCodeFromPath() {
  const m = location.pathname.match(/^\/(host|play|album)\/([A-Z0-9]{4})$/i);
  return m ? m[2].toUpperCase() : null;
}

// For lobby auto-fill from ?room=CODE.
export function getRoomCodeFromQuery() {
  const u = new URLSearchParams(location.search);
  const c = u.get('room');
  return c ? c.toUpperCase() : null;
}
