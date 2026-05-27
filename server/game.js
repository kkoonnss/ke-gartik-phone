'use strict';

const { nanoid } = require('nanoid');
const {
  createRoom,
  getRoom,
  joinRoom,
  removePlayer,
  promoteNextHost,
  serializeRoom,
} = require('./rooms');
const modes = require('./modes');
const { getSeatOrder } = require('./modes/_shared');
const { BACKGROUNDS } = require('./backgrounds');

// Masterpiece hard cap: 15 minutes
const MASTERPIECE_HARD_CAP_MS = 15 * 60 * 1000;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function broadcastState(io, room) {
  io.to(room.code).emit('room:state', serializeRoom(room));
}

function emitError(socket, code, message) {
  socket.emit('error', { code, message });
}

function getPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId) || null;
}

function connectedPlayers(room) {
  return room.players.filter((p) => p.connected);
}

function getMode(room) {
  return modes[room.settings.mode] || modes.classic;
}

// -------------------------------------------------------------------
// Timer management
// -------------------------------------------------------------------

function clearRoomTimer(room) {
  if (room._timer) {
    clearInterval(room._timer);
    room._timer = null;
  }
}

function startRoomTimer(io, room) {
  clearRoomTimer(room);
  room._timer = setInterval(() => {
    if (!room.currentPhase) { clearRoomTimer(room); return; }

    const mode = getMode(room);

    // tick broadcast
    io.to(room.code).emit('phase:tick', { endsAt: room.currentPhase.endsAt });

    const now = Date.now();

    // Masterpiece manual-advance: don't auto-advance on timer
    // But enforce a 15-minute hard cap as safety net
    if (mode.supportsManualAdvance) {
      if (room._phaseStartedAt && (now - room._phaseStartedAt) >= MASTERPIECE_HARD_CAP_MS) {
        advancePhase(io, room);
      }
      return;
    }

    // Normal modes: auto-advance when endsAt passes
    if (room.currentPhase.endsAt !== null && now >= room.currentPhase.endsAt) {
      advancePhase(io, room);
    }
  }, 1000);
}

// -------------------------------------------------------------------
// Phase duration lookup
// -------------------------------------------------------------------

function phaseSeconds(room, phaseName) {
  const s = room.settings;
  switch (phaseName) {
    case 'write':           return s.writeSeconds;
    case 'draw':            return s.drawSeconds;
    case 'describe':        return s.describeSeconds;
    case 'knockoff-show':   return s.knockoffShowSeconds;
    case 'knockoff-draw':   return s.drawSeconds;
    case 'continue':        return s.writeSeconds;
    case 'coop-draw':       return s.drawSeconds;
    case 'masterpiece-draw': return null; // no auto-advance
    case 'missingpiece-draw': return s.drawSeconds;
    case 'background-draw': return s.drawSeconds;
    default: return 60;
  }
}

// -------------------------------------------------------------------
// Draw-phase predicate — phases where content must be a JPEG drawing
// -------------------------------------------------------------------

const DRAW_PHASES = new Set([
  'draw', 'knockoff-draw', 'coop-draw',
  'masterpiece-draw', 'missingpiece-draw', 'background-draw',
]);

function isDrawPhase(phaseName) {
  return DRAW_PHASES.has(phaseName);
}

// -------------------------------------------------------------------
// Emit per-player phase assignments
// -------------------------------------------------------------------

function emitAssignments(io, room) {
  const mode = getMode(room);
  const { name: phaseName, round, endsAt } = room.currentPhase;
  const seatOrder = getSeatOrder(room);

  for (let pIdx = 0; pIdx < seatOrder.length; pIdx++) {
    const player = seatOrder[pIdx];
    const sock = io.sockets.sockets.get(player.socketId);
    if (!sock) continue;

    const assignment = mode.assignmentForPlayer(room, pIdx, room.currentPhase);

    sock.emit('phase:assignment', {
      phase: phaseName,
      round,
      prevSlide: assignment.prevSlide || null,
      prevImage: assignment.prevImage || null,
      eraseRect: assignment.eraseRect || null,
      deadline: endsAt,
      meta: assignment.meta || null,
    });
  }
}

// -------------------------------------------------------------------
// Build reveal album event payload
// -------------------------------------------------------------------

function buildRevealAlbumPayload(room, albumIdx) {
  const album = room.albums[albumIdx];
  if (!album) return null;

  const authors = album.map(slide => {
    if (slide.authorId === 'system') {
      return { id: 'system', name: 'System', emoji: '🎮', color: '#888888' };
    }
    const p = room.players.find(pl => pl.id === slide.authorId);
    return p
      ? { id: p.id, name: p.name, emoji: p.emoji, color: p.color }
      : { id: slide.authorId, name: '?', emoji: '❓', color: '#888888' };
  });

  const payload = {
    albumIdx,
    album,
    authors,
    total: { albums: room.albums.length },
  };

  // Animation mode extras
  if (room.settings.mode === 'animation') {
    // Round-0 write text for this album (slide 0)
    const promptSlide = album[0];
    payload.animationPrompt = promptSlide ? promptSlide.content : '';
    // Use host-configured fps if set, fall back to default 3
    payload.fps = room.settings.animationFps || 3;
  }

  return payload;
}

// -------------------------------------------------------------------
// Reveal emit helpers
// -------------------------------------------------------------------

function emitRevealSlide(io, room) {
  const { albumIdx, slideIdx } = room.revealCursor;
  const album = room.albums[albumIdx];
  if (!album) return;
  const slide = album[slideIdx];
  if (!slide) return;

  const author = slide.authorId === 'system'
    ? { id: 'system', name: 'System', emoji: '🎮', color: '#888888' }
    : room.players.find((p) => p.id === slide.authorId) || {
        id: slide.authorId, name: '?', emoji: '❓', color: '#888888',
      };

  io.to(room.code).emit('reveal:slide', {
    albumIdx,
    slideIdx,
    slide,
    author: { id: author.id, name: author.name, emoji: author.emoji, color: author.color },
    total: { albums: room.albums.length, slidesInAlbum: album.length },
  });
}

function emitRevealAlbum(io, room, albumIdx) {
  const payload = buildRevealAlbumPayload(room, albumIdx);
  if (!payload) return;
  io.to(room.code).emit('reveal:album', payload);
}

function emitRevealForLayout(io, room) {
  const layout = room.revealLayout;
  const { albumIdx } = room.revealCursor;

  if (layout === 'stepper') {
    emitRevealSlide(io, room);
  } else {
    // frame-cycle, gallery, scrollback: emit full album
    emitRevealAlbum(io, room, albumIdx);
  }
}

// -------------------------------------------------------------------
// advancePhase — core state machine step
// -------------------------------------------------------------------

function advancePhase(io, room) {
  // H-1 mutex: prevent double-advance if timer fires at same tick as a submit
  if (room._advancing) return;
  room._advancing = true;

  clearRoomTimer(room);
  const mode = getMode(room);
  const N = room.players.length;

  // Null out currentPhase BEFORE the auto-fill loop so that any re-entrant
  // checkAllSubmitted call (shouldn't happen, but guarded by _advancing anyway)
  // sees no active phase.
  const savedPhase = room.currentPhase;
  room.currentPhase = null;

  // Auto-fill missing submissions
  if (savedPhase) {
    const { name: phaseName, round } = savedPhase;
    const roundData = room._roundData || new Map();
    if (!roundData.has(round)) roundData.set(round, new Map());
    const roundMap = roundData.get(round);

    for (const player of room.players) {
      if (!roundMap.has(player.id)) {
        const drawPhase = isDrawPhase(phaseName);
        roundMap.set(player.id, {
          type: drawPhase ? 'drawing' : 'text',
          authorId: player.id,
          content: drawPhase ? '' : '...',
          phase: phaseName,
          round,
        });
      }
    }
    room._roundData = roundData;
  }

  const current = savedPhase;
  const next = current ? mode.nextPhase(room, current) : null;

  if (!next) {
    // Go to reveal
    room._totalRounds = current ? current.round + 1 : N;
    room.albums = mode.buildAlbums(room);
    room.state = 'reveal';
    room.currentPhase = null;
    room.revealCursor = { albumIdx: 0, slideIdx: 0 };
    room.revealLayout = mode.revealLayout;

    room._advancing = false;
    broadcastState(io, room);
    emitRevealForLayout(io, room);
    return;
  }

  const secs = (next.seconds !== undefined && next.seconds !== null)
    ? next.seconds
    : phaseSeconds(room, next.name);

  const endsAt = (secs === null) ? null : Date.now() + secs * 1000;

  room.currentPhase = {
    name: next.name,
    round: next.round,
    endsAt,
    submitted: new Set(),
  };
  room._phaseStartedAt = Date.now();
  room.state = 'playing';

  room._advancing = false;
  broadcastState(io, room);
  emitAssignments(io, room);
  startRoomTimer(io, room);
}

// -------------------------------------------------------------------
// checkAllSubmitted — auto-advance if everyone has submitted
// -------------------------------------------------------------------

function checkAllSubmitted(io, room) {
  // H-1 mutex: don't enter if advancePhase is already running
  if (room._advancing) return;
  if (!room.currentPhase) return;

  // Auto-advance is blocked for knockoff-show (time-based only) and masterpiece (host-only)
  const phaseName = room.currentPhase.name;
  if (phaseName === 'knockoff-show') return;

  const mode = getMode(room);
  if (mode.supportsManualAdvance) return;

  // M-4: Disconnect behavior is intentional:
  //   - connectedPlayers() only returns currently-connected players.
  //   - If a player disconnects AFTER submitting, their submission still counts
  //     (they're not in 'connected', so they don't block advance).
  //   - If a player disconnects BEFORE submitting, they are removed from 'connected',
  //     so the "all submitted" check no longer waits for them. advancePhase will
  //     auto-fill a blank placeholder for them. This causes an early advance — which
  //     is intentional: a disconnected player should not hold up the whole game.
  //   - A future dev changing this behavior must also update the auto-fill logic
  //     in advancePhase to handle the new disconnect policy.
  const connected = connectedPlayers(room);
  const submitted = room.currentPhase.submitted;
  const allIn = connected.every((p) => submitted.has(p.id));

  if (allIn && connected.length > 0) {
    advancePhase(io, room);
  }
}

// -------------------------------------------------------------------
// attachGame — main entry point, wires all socket events
// -------------------------------------------------------------------

function attachGame(io) {
  const disconnectTimers = new Map();
  const socketMap = new Map();

  io.on('connection', (socket) => {

    // -----------------------------------------------------------------
    // room:create
    // -----------------------------------------------------------------
    socket.on('room:create', (data, ack) => {
      try {
        const name = (data.name || '').trim().slice(0, 16);
        const emoji = data.emoji || '🎨';
        if (!name) return ack({ ok: false, error: 'Name required' });

        const playerId = `p_${nanoid(10)}`;
        const { code, room } = createRoom({ id: playerId, name, emoji, socketId: socket.id });

        const host = socket.handshake.headers.host || 'localhost:3000';
        const proto = socket.handshake.secure ? 'https' : 'http';
        room._joinUrl = `${proto}://${host}/?room=${code}`;

        socketMap.set(socket.id, { playerId, roomCode: code });
        socket.join(code);

        ack({ ok: true, code, playerId, joinUrl: room._joinUrl });
        broadcastState(io, room);
      } catch (e) {
        console.error('room:create error', e);
        ack({ ok: false, error: 'Server error' });
      }
    });

    // -----------------------------------------------------------------
    // room:join
    // -----------------------------------------------------------------
    socket.on('room:join', (data, ack) => {
      try {
        const code = (data.code || '').toUpperCase().slice(0, 4);
        const name = (data.name || '').trim().slice(0, 16);
        const emoji = data.emoji || '🎨';
        const resumePlayerId = data.resumePlayerId || null;

        if (!name) return ack({ ok: false, error: 'Name required' });

        const room = getRoom(code);
        if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });

        const playerId = resumePlayerId || `p_${nanoid(10)}`;
        const result = joinRoom(code, { id: playerId, name, emoji, socketId: socket.id });
        if (!result.ok) return ack({ ok: false, error: result.error });

        if (disconnectTimers.has(playerId)) {
          clearTimeout(disconnectTimers.get(playerId));
          disconnectTimers.delete(playerId);
        }

        socketMap.set(socket.id, { playerId, roomCode: code });
        socket.join(code);

        ack({ ok: true, playerId, isHost: result.isHost, room: serializeRoom(result.room) });
        broadcastState(io, result.room);
      } catch (e) {
        console.error('room:join error', e);
        ack({ ok: false, error: 'Server error' });
      }
    });

    // -----------------------------------------------------------------
    // room:settings (host only)
    // -----------------------------------------------------------------
    socket.on('room:settings', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can change settings');
      }
      if (room.state !== 'lobby') return;

      const validModes = Object.keys(modes);
      if (data.mode && validModes.includes(data.mode)) room.settings.mode = data.mode;
      if (data.writeSeconds !== undefined) {
        room.settings.writeSeconds = Math.min(180, Math.max(20, Number(data.writeSeconds) || 60));
      }
      if (data.drawSeconds !== undefined) {
        room.settings.drawSeconds = Math.min(240, Math.max(30, Number(data.drawSeconds) || 90));
      }
      if (data.describeSeconds !== undefined) {
        room.settings.describeSeconds = Math.min(120, Math.max(15, Number(data.describeSeconds) || 45));
      }
      if (data.knockoffShowSeconds !== undefined) {
        room.settings.knockoffShowSeconds = Math.min(20, Math.max(3, Number(data.knockoffShowSeconds) || 8));
      }

      broadcastState(io, room);
    });

    // -----------------------------------------------------------------
    // room:seatorder (host only, lobby only)
    // -----------------------------------------------------------------
    socket.on('room:seatorder', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can set seat order');
      }
      if (room.state !== 'lobby') return;

      const order = data.order;
      if (!Array.isArray(order)) return;
      if (order.length !== room.players.length) {
        return emitError(socket, 'VALIDATION', 'Seat order must include all players');
      }
      const playerIds = new Set(room.players.map(p => p.id));
      for (const id of order) {
        if (!playerIds.has(id)) {
          return emitError(socket, 'VALIDATION', `Unknown player id: ${id}`);
        }
      }

      room.seatOrder = order;
      broadcastState(io, room);
    });

    // -----------------------------------------------------------------
    // room:masterprompt (host only, lobby only)
    // -----------------------------------------------------------------
    socket.on('room:masterprompt', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can set the master prompt');
      }
      if (room.state !== 'lobby') return;

      const prompt = (data.prompt || '').slice(0, 300);
      room.masterprompt = prompt;
      broadcastState(io, room);
    });

    // -----------------------------------------------------------------
    // room:background (host only, lobby only)
    // -----------------------------------------------------------------
    socket.on('room:background', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can set the background');
      }
      if (room.state !== 'lobby') return;

      const backgroundId = data.backgroundId || null;
      if (backgroundId) {
        // Validate background exists (H-2: top-level require, no try/catch needed)
        const validBg = BACKGROUNDS.some(b => b.id === backgroundId);
        if (!validBg) {
          return emitError(socket, 'VALIDATION', `Unknown background id: ${backgroundId}`);
        }
      }

      room.backgroundId = backgroundId;
      broadcastState(io, room);
    });

    // -----------------------------------------------------------------
    // game:start (host only)
    // -----------------------------------------------------------------
    socket.on('game:start', () => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can start the game');
      }
      if (room.state !== 'lobby') return;

      const connected = connectedPlayers(room);
      if (connected.length < 2) {
        return emitError(socket, 'VALIDATION', 'Need at least 2 players to start');
      }

      const mode = getMode(room);

      // Mode-specific validation
      const validationError = mode.validateStart(room);
      if (validationError) {
        return emitError(socket, 'VALIDATION', validationError);
      }

      // Init data stores
      room._roundData = new Map();
      room.albums = [];
      room.revealCursor = null;
      room.revealLayout = null;
      room._advancing = false;
      room.votes = null;  // reset votes from any previous game in this room

      const firstPhase = mode.initialPhase(room);
      const secs = (firstPhase.seconds !== undefined && firstPhase.seconds !== null)
        ? firstPhase.seconds
        : phaseSeconds(room, firstPhase.name);
      const endsAt = (secs === null) ? null : Date.now() + secs * 1000;

      room.state = 'playing';
      room.currentPhase = {
        name: firstPhase.name,
        round: firstPhase.round,
        endsAt,
        submitted: new Set(),
      };
      room._phaseStartedAt = Date.now();

      broadcastState(io, room);
      emitAssignments(io, room);
      startRoomTimer(io, room);
    });

    // -----------------------------------------------------------------
    // phase:submit
    // -----------------------------------------------------------------
    socket.on('phase:submit', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room || !room.currentPhase) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player) return;

      const { phase, round, content } = data;

      if (phase !== room.currentPhase.name || round !== room.currentPhase.round) {
        return emitError(socket, 'BAD_PHASE', 'Phase mismatch');
      }

      // M-6: Explicitly reject submissions during knockoff-show to prevent round-number
      // collision with knockoff-draw (they share the same round number).
      if (phase === 'knockoff-show') {
        return emitError(socket, 'VALIDATION', 'No submission allowed for knockoff-show phase');
      }

      const drawPhase = isDrawPhase(phase);
      if (drawPhase) {
        if (typeof content !== 'string' || !content.startsWith('data:image/jpeg;base64,')) {
          return emitError(socket, 'VALIDATION', 'Drawing must be a JPEG data URI');
        }
        const b64 = content.replace(/^data:image\/jpeg;base64,/, '');
        const byteLen = Math.ceil((b64.length * 3) / 4);
        if (byteLen > 250 * 1024) {
          return emitError(socket, 'PAYLOAD_TOO_LARGE', 'Drawing exceeds 250KB limit');
        }
      } else {
        if (typeof content !== 'string') {
          return emitError(socket, 'VALIDATION', 'Text content required');
        }
        const trimmed = content.trim();
        if (trimmed.length > 300) {
          return emitError(socket, 'PAYLOAD_TOO_LARGE', 'Text exceeds 300 character limit');
        }
      }

      if (room.currentPhase.submitted.has(player.id)) return;

      const roundData = room._roundData || new Map();
      if (!roundData.has(round)) roundData.set(round, new Map());
      const roundMap = roundData.get(round);

      const trimmedContent = drawPhase ? content : content.trim();
      const slideObj = {
        type: drawPhase ? 'drawing' : 'text',
        authorId: player.id,
        content: trimmedContent,
        phase,
        round,
      };
      roundMap.set(player.id, slideObj);
      room._roundData = roundData;
      room.currentPhase.submitted.add(player.id);
      room.lastActivityAt = Date.now();

      // Optional mode postSubmit hook
      const mode = getMode(room);
      if (typeof mode.postSubmit === 'function') {
        mode.postSubmit(room, player, slideObj);
      }

      broadcastState(io, room);
      checkAllSubmitted(io, room);
    });

    // -----------------------------------------------------------------
    // phase:skip (host only)
    // -----------------------------------------------------------------
    socket.on('phase:skip', () => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can skip');
      }
      if (!room.currentPhase) return;

      advancePhase(io, room);
    });

    // -----------------------------------------------------------------
    // reveal:next (host only)
    // -----------------------------------------------------------------
    socket.on('reveal:next', () => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room || room.state !== 'reveal') return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can advance reveal');
      }

      const layout = room.revealLayout || 'stepper';
      const { albumIdx, slideIdx } = room.revealCursor;

      if (layout === 'stepper') {
        // Step slide-by-slide
        const album = room.albums[albumIdx];
        if (!album) return;
        if (slideIdx + 1 < album.length) {
          room.revealCursor.slideIdx = slideIdx + 1;
        } else if (albumIdx + 1 < room.albums.length) {
          room.revealCursor.albumIdx = albumIdx + 1;
          room.revealCursor.slideIdx = 0;
        } else {
          // End of all albums
          room.state = 'ended';
          broadcastState(io, room);
          return;
        }
        broadcastState(io, room);
        emitRevealSlide(io, room);

      } else if (layout === 'gallery') {
        // Single album, no-op next/prev
        broadcastState(io, room);

      } else {
        // frame-cycle, scrollback: step album-by-album
        if (albumIdx + 1 < room.albums.length) {
          room.revealCursor.albumIdx = albumIdx + 1;
          room.revealCursor.slideIdx = 0;
          broadcastState(io, room);
          emitRevealAlbum(io, room, room.revealCursor.albumIdx);
        } else {
          // End of all albums
          room.state = 'ended';
          broadcastState(io, room);
        }
      }
    });

    // -----------------------------------------------------------------
    // reveal:prev (host only)
    // -----------------------------------------------------------------
    socket.on('reveal:prev', () => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room || room.state !== 'reveal') return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can navigate reveal');
      }

      const layout = room.revealLayout || 'stepper';
      const { albumIdx, slideIdx } = room.revealCursor;

      if (layout === 'stepper') {
        if (slideIdx > 0) {
          room.revealCursor.slideIdx = slideIdx - 1;
        } else if (albumIdx > 0) {
          const prevAlbum = room.albums[albumIdx - 1];
          room.revealCursor.albumIdx = albumIdx - 1;
          room.revealCursor.slideIdx = prevAlbum.length - 1;
        }
        broadcastState(io, room);
        emitRevealSlide(io, room);

      } else if (layout === 'gallery') {
        // no-op
        broadcastState(io, room);

      } else {
        // frame-cycle, scrollback: step album-by-album
        if (albumIdx > 0) {
          room.revealCursor.albumIdx = albumIdx - 1;
          room.revealCursor.slideIdx = 0;
          broadcastState(io, room);
          emitRevealAlbum(io, room, room.revealCursor.albumIdx);
        }
        // If at start, do nothing
      }
    });

    // -----------------------------------------------------------------
    // reveal:vote (any player, during reveal or ended state)
    // -----------------------------------------------------------------
    socket.on('reveal:vote', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      if (room.state !== 'reveal' && room.state !== 'ended') return;

      const { albumIdx, slideIdx } = data;
      const albums = room.albums || [];
      if (albumIdx < 0 || albumIdx >= albums.length) {
        return emitError(socket, 'VALIDATION', 'Invalid albumIdx');
      }
      if (slideIdx < 0 || slideIdx >= albums[albumIdx].length) {
        return emitError(socket, 'VALIDATION', 'Invalid slideIdx');
      }

      // Initialize votes if needed
      if (!room.votes) {
        room.votes = { perAlbum: [], perPlayer: {} };
      }
      // Ensure perAlbum entry exists for this album
      let albumEntry = room.votes.perAlbum.find(e => e.albumIdx === albumIdx);
      if (!albumEntry) {
        const totals = albums[albumIdx].map((_, sIdx) => ({ slideIdx: sIdx, count: 0 }));
        albumEntry = { albumIdx, totals };
        room.votes.perAlbum.push(albumEntry);
        room.votes.perAlbum.sort((a, b) => a.albumIdx - b.albumIdx);
      }

      const playerId = ctx.playerId;
      const prevVote = room.votes.perPlayer[playerId];

      // Remove previous vote for the same album (player can change vote)
      if (prevVote && prevVote.albumIdx === albumIdx) {
        const prevEntry = room.votes.perAlbum.find(e => e.albumIdx === albumIdx);
        if (prevEntry) {
          const prevSlideEntry = prevEntry.totals.find(t => t.slideIdx === prevVote.slideIdx);
          if (prevSlideEntry && prevSlideEntry.count > 0) prevSlideEntry.count--;
        }
      }

      // Record new vote
      room.votes.perPlayer[playerId] = { albumIdx, slideIdx };
      const slideEntry = albumEntry.totals.find(t => t.slideIdx === slideIdx);
      if (slideEntry) slideEntry.count++;

      room.lastActivityAt = Date.now();

      // Emit vote:tally to each connected socket individually (per-recipient myVote)
      for (const player of room.players) {
        if (!player.connected || !player.socketId) continue;
        const pSock = io.sockets.sockets.get(player.socketId);
        if (!pSock) continue;
        const myVote = room.votes.perPlayer[player.id] || null;
        pSock.emit('vote:tally', {
          tallies: room.votes.perAlbum.map(e => ({
            albumIdx: e.albumIdx,
            votes: e.totals.map(t => ({ slideIdx: t.slideIdx, count: t.count })),
          })),
          myVote,
        });
      }
    });

    // -----------------------------------------------------------------
    // room:prompts (host only, lobby only)
    // -----------------------------------------------------------------
    socket.on('room:prompts', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can set custom prompts');
      }
      if (room.state !== 'lobby') return;

      const prompts = data.prompts;
      if (!Array.isArray(prompts)) {
        return emitError(socket, 'VALIDATION', 'prompts must be an array');
      }
      if (prompts.length > 100) {
        return emitError(socket, 'VALIDATION', 'Maximum 100 custom prompts');
      }
      for (const p of prompts) {
        if (typeof p !== 'string' || p.length > 300) {
          return emitError(socket, 'VALIDATION', 'Each prompt must be a string ≤ 300 chars');
        }
      }

      // Empty array clears custom prompts (reverts to built-in deck)
      room.customPrompts = prompts.length > 0 ? prompts : null;
      broadcastState(io, room);
    });

    // -----------------------------------------------------------------
    // room:kick (host only)
    // -----------------------------------------------------------------
    socket.on('room:kick', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can kick players');
      }

      const targetId = data.playerId;
      if (!targetId || targetId === ctx.playerId) {
        return emitError(socket, 'VALIDATION', 'Cannot kick yourself');
      }

      const target = getPlayer(room, targetId);
      if (!target) {
        return emitError(socket, 'VALIDATION', 'Player not found');
      }

      // Notify the target before disconnecting
      const targetSock = target.socketId ? io.sockets.sockets.get(target.socketId) : null;
      if (targetSock) {
        targetSock.emit('kicked', { reason: 'Host removed you from the room' });
        // Disconnect after a brief delay to allow client to receive the event
        setTimeout(() => targetSock.disconnect(true), 200);
      }

      // Remove player from room and broadcast
      removePlayer(ctx.roomCode, targetId);
      const updatedRoom = getRoom(ctx.roomCode);
      if (updatedRoom) broadcastState(io, updatedRoom);
    });

    // -----------------------------------------------------------------
    // room:animation-fps (host only, lobby only)
    // -----------------------------------------------------------------
    socket.on('room:animation-fps', (data) => {
      const ctx = socketMap.get(socket.id);
      if (!ctx) return;
      const room = getRoom(ctx.roomCode);
      if (!room) return;
      const player = getPlayer(room, ctx.playerId);
      if (!player || !player.isHost) {
        return emitError(socket, 'NOT_HOST', 'Only the host can set animation fps');
      }
      if (room.state !== 'lobby') return;

      const fps = Math.min(12, Math.max(1, Math.round(Number(data.fps) || 3)));
      room.settings.animationFps = fps;
      broadcastState(io, room);
    });

    // -----------------------------------------------------------------
    // disconnect
    // -----------------------------------------------------------------
    socket.on('disconnect', () => {
      const ctx = socketMap.get(socket.id);
      socketMap.delete(socket.id);
      if (!ctx) return;

      const { playerId, roomCode } = ctx;
      const room = getRoom(roomCode);
      if (!room) return;

      const player = getPlayer(room, playerId);
      if (!player) return;

      player.connected = false;
      room.lastActivityAt = Date.now();
      broadcastState(io, room);

      const timer = setTimeout(() => {
        disconnectTimers.delete(playerId);
        const r = getRoom(roomCode);
        if (!r) return;
        const p = getPlayer(r, playerId);
        if (p && !p.connected) {
          if (p.isHost) {
            p.isHost = false;
            promoteNextHost(r);
          }
          removePlayer(roomCode, playerId);
          const r2 = getRoom(roomCode);
          if (r2) broadcastState(io, r2);
        }
      }, 30 * 1000);

      disconnectTimers.set(playerId, timer);
    });

  }); // end io.on('connection')
}

module.exports = { attachGame };
