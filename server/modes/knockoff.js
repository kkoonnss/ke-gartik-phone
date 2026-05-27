'use strict';

const { getSeatOrder, getPrevSlide } = require('./_shared');

// -------------------------------------------------------------------
// Knock-Off mode
// -------------------------------------------------------------------
// Phases for N players:
//   round 0: write
//   round 1: draw
//   round 2: knockoff-show (auto-advance, player memorizes prev draw)
//   round 2: knockoff-draw (player draws from memory, no prevSlide shown)
//   round 3: knockoff-show
//   round 3: knockoff-draw
//   ... until N-1 draws total
// N albums, each with N slides (write + N-1 draws).

module.exports = {
  id: 'knockoff',
  displayName: 'Knock-Off',
  description: 'Draw the image you just memorized — no peeking! Like Telephone but for memory.',
  revealLayout: 'stepper',
  supportsManualAdvance: false,

  validateStart(room) {
    return room.players.length >= 2 ? null : 'Need at least 2 players';
  },

  initialPhase(room) {
    return { name: 'write', round: 0, seconds: room.settings.writeSeconds };
  },

  nextPhase(room, current) {
    const N = room.players.length;
    const { name, round } = current;

    if (name === 'write') return { name: 'draw', round: 1 };

    if (name === 'draw') {
      if (round >= N - 1) return null; // go to reveal
      return { name: 'knockoff-show', round: round + 1 };
    }
    if (name === 'knockoff-show') {
      return { name: 'knockoff-draw', round };
    }
    if (name === 'knockoff-draw') {
      if (round >= N - 1) return null; // go to reveal
      return { name: 'knockoff-show', round: round + 1 };
    }
    return null;
  },

  buildAlbums(room) {
    const players = getSeatOrder(room);
    const N = players.length;
    const roundData = room._roundData || new Map();
    const totalRounds = room._totalRounds || N;

    // Knockoff: album slide i is a drawing (all draws, no describe)
    // round 0 = write, rounds 1..N-1 = draw (stored under knockoff-draw or draw phase)
    const albums = [];
    for (let j = 0; j < N; j++) {
      const album = [];
      for (let i = 0; i < totalRounds; i++) {
        const authorIdx = (j + i) % N;
        const authorId = players[authorIdx].id;
        const roundMap = roundData.get(i) || new Map();
        const slide = roundMap.get(authorId) || {
          type: i === 0 ? 'text' : 'drawing',
          authorId,
          content: i === 0 ? '...' : '',
          phase: i === 0 ? 'write' : 'knockoff-draw',
          round: i,
        };
        album.push(slide);
      }
      albums.push(album);
    }
    return albums;
  },

  assignmentForPlayer(room, playerIdx, phase) {
    const players = getSeatOrder(room);
    const N = players.length;
    const { name: phaseName, round } = phase;

    if (phaseName === 'write') {
      return { prevSlide: null, prevImage: null, eraseRect: null, meta: null };
    }

    if (phaseName === 'draw') {
      // First draw: prevSlide = the write text from same album
      const albumJ = ((playerIdx - round) % N + N) % N;
      const prevRound = round - 1;
      const prevAuthorIdx = (albumJ + prevRound) % N;
      const prevAuthorId = players[prevAuthorIdx].id;
      const prevSlideData = getPrevSlide(room, prevRound, prevAuthorId);
      const prevSlide = prevSlideData
        ? { type: prevSlideData.type, content: prevSlideData.content }
        : null;
      return { prevSlide, prevImage: null, eraseRect: null, meta: null };
    }

    if (phaseName === 'knockoff-show') {
      // Show the previous drawing to memorize
      const albumJ = ((playerIdx - round) % N + N) % N;
      const prevRound = round - 1;
      const prevAuthorIdx = (albumJ + prevRound) % N;
      const prevAuthorId = players[prevAuthorIdx].id;
      const prevSlideData = getPrevSlide(room, prevRound, prevAuthorId);
      const prevSlide = prevSlideData
        ? { type: prevSlideData.type, content: prevSlideData.content }
        : null;
      return { prevSlide, prevImage: null, eraseRect: null, meta: null };
    }

    if (phaseName === 'knockoff-draw') {
      // Draw from memory: no prevSlide shown
      return { prevSlide: null, prevImage: null, eraseRect: null, meta: null };
    }

    return { prevSlide: null, prevImage: null, eraseRect: null, meta: null };
  },
};
