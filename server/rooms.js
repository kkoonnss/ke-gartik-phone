'use strict';

const { customAlphabet } = require('nanoid');

// CODE_ALPHABET: no ambiguous chars (0/O/1/I removed per CONTRACT)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = customAlphabet(CODE_ALPHABET, 4);

const PLAYER_COLORS = [
  '#ff5a5f', '#ffb400', '#ffe066', '#00d68f', '#00b8d9', '#5e72e4', '#b06ab3', '#ff7a59',
  '#7ed957', '#ff5ec4', '#36d1c4', '#ffa600', '#a78bfa', '#f87171', '#34d399', '#60a5fa',
];

const MAX_PLAYERS = 16;
const IDLE_REAP_MS = 30 * 60 * 1000; // 30 minutes

// In-memory store
const rooms = new Map();

// -------------------------------------------------------------------
// createRoom
// hostPlayer: { id, name, emoji, socketId }
// -------------------------------------------------------------------
function createRoom(hostPlayer) {
  let code;
  let tries = 0;
  do {
    code = genCode();
    tries++;
    if (tries > 1000) throw new Error('Could not generate unique room code');
  } while (rooms.has(code));

  const player = {
    id: hostPlayer.id,
    name: hostPlayer.name,
    emoji: hostPlayer.emoji,
    color: PLAYER_COLORS[0],
    isHost: true,
    connected: true,
    socketId: hostPlayer.socketId,
    joinedAt: Date.now(),
  };

  const room = {
    code,
    hostId: hostPlayer.id,
    state: 'lobby',
    settings: {
      mode: 'classic',
      writeSeconds: 60,
      drawSeconds: 90,
      describeSeconds: 45,
      knockoffShowSeconds: 8,
      animationFps: 3,  // v3: animation reveal framerate (1-12, default 3)
    },
    players: [player],
    albums: [],
    currentPhase: null,
    revealCursor: null,
    // v2 fields
    seatOrder: null,
    masterprompt: null,
    backgroundId: null,
    revealLayout: null,
    // v3 fields
    customPrompts: null,   // set by room:prompts event
    votes: null,           // populated during reveal/ended
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    // internal state — not serialized
    _timer: null,
    _advancing: false,
  };

  rooms.set(code, room);
  return { code, room };
}

// -------------------------------------------------------------------
// getRoom
// -------------------------------------------------------------------
function getRoom(code) {
  return rooms.get(code) || null;
}

// -------------------------------------------------------------------
// joinRoom
// player: { id, name, emoji, socketId }
// -------------------------------------------------------------------
function joinRoom(code, player) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

  // Reconnect: player already in room
  const existing = room.players.find((p) => p.id === player.id);
  if (existing) {
    existing.connected = true;
    existing.socketId = player.socketId;
    room.lastActivityAt = Date.now();
    return { ok: true, isHost: existing.isHost, room };
  }

  // H-3: Block new players from joining a game that is already in progress.
  // Reconnect path (resumePlayerId matching an existing player) is handled above
  // and is unaffected by this check.
  if (room.state !== 'lobby') {
    return { ok: false, error: 'GAME_IN_PROGRESS' };
  }

  // New join
  if (room.players.length >= MAX_PLAYERS) {
    return { ok: false, error: 'ROOM_FULL' };
  }

  const colorIdx = room.players.length % PLAYER_COLORS.length;
  const newPlayer = {
    id: player.id,
    name: player.name,
    emoji: player.emoji,
    color: PLAYER_COLORS[colorIdx],
    isHost: false,
    connected: true,
    socketId: player.socketId,
    joinedAt: Date.now(),
  };

  room.players.push(newPlayer);
  room.lastActivityAt = Date.now();
  return { ok: true, isHost: false, room };
}

// -------------------------------------------------------------------
// removePlayer
// -------------------------------------------------------------------
function removePlayer(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length === 0) {
    rooms.delete(roomCode);
  }
}

// -------------------------------------------------------------------
// promoteNextHost — promotes first connected player to host
// -------------------------------------------------------------------
function promoteNextHost(room) {
  const next = room.players.find((p) => p.connected && !p.isHost);
  if (next) {
    next.isHost = true;
    room.hostId = next.id;
  }
}

// -------------------------------------------------------------------
// serializeRoom — returns CONTRACT-compliant room:state snapshot
// submitted is always an Array (JSON-safe)
// albums included when state is 'reveal' or 'ended'
// -------------------------------------------------------------------
function serializeRoom(room) {
  const snapshot = {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    settings: { ...room.settings },
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      color: p.color,
      isHost: p.isHost,
      connected: p.connected,
    })),
    currentPhase: room.currentPhase
      ? {
          name: room.currentPhase.name,
          round: room.currentPhase.round,
          endsAt: room.currentPhase.endsAt,
          // submitted is a Set internally; always serialize as Array
          submitted: Array.from(room.currentPhase.submitted),
        }
      : null,
    revealCursor: room.revealCursor ? { ...room.revealCursor } : null,
    joinUrl: room._joinUrl || null,
    // v2 additions
    seatOrder: room.seatOrder || null,
    masterprompt: room.masterprompt || null,
    backgroundId: room.backgroundId || null,
    revealLayout: room.revealLayout || null,
    // v3 additions
    customPrompts: room.customPrompts || null,
    // votes: expose perAlbum tallies publicly; perPlayer is omitted from global broadcast
    // (each recipient gets their own myVote via the per-socket vote:tally event instead)
    votes: room.votes
      ? { perAlbum: room.votes.perAlbum.map(e => ({
            albumIdx: e.albumIdx,
            totals: e.totals.map(t => ({ slideIdx: t.slideIdx, count: t.count })),
          })) }
      : null,
  };

  if (room.state === 'reveal' || room.state === 'ended') {
    snapshot.albums = room.albums;
  }

  return snapshot;
}

// -------------------------------------------------------------------
// Idle reaper — runs every 5 minutes, drops stale rooms
// -------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hasConnected = room.players.some((p) => p.connected);
    if (!hasConnected && now - room.lastActivityAt > IDLE_REAP_MS) {
      if (room._timer) clearInterval(room._timer);
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

// -------------------------------------------------------------------
// roomCount — for /health endpoint
// -------------------------------------------------------------------
function roomCount() {
  return rooms.size;
}

module.exports = {
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  promoteNextHost,
  serializeRoom,
  roomCount,
};
