'use strict';

const { getSeatOrder, getPrevSlide, pickEraseRect } = require('./_shared');

// -------------------------------------------------------------------
// Missing Piece mode
// -------------------------------------------------------------------
// Like Classic but draw phases use the previous drawing with a random
// rectangle erased. Client fills the erased area, player draws it back.
// Phases for N players:
//   round 0: write
//   rounds 1..N-1: missingpiece-draw
// N albums, N slides each.
// revealLayout: stepper

module.exports = {
  id: 'missingpiece',
  displayName: 'Missing Piece',
  description: 'Restore the erased part of the previous drawing. What was there?',
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
    if (name === 'write') return { name: 'missingpiece-draw', round: 1 };
    if (name === 'missingpiece-draw') {
      if (round >= N - 1) return null; // reveal
      return { name: 'missingpiece-draw', round: round + 1 };
    }
    return null;
  },

  buildAlbums(room) {
    const players = getSeatOrder(room);
    const N = players.length;
    const roundData = room._roundData || new Map();
    const totalRounds = room._totalRounds || N;

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
          phase: i === 0 ? 'write' : 'missingpiece-draw',
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

    // missingpiece-draw
    // Album j for this player: (j + round) mod N = playerIdx => j = (playerIdx - round + N) mod N
    const albumJ = ((playerIdx - round) % N + N) % N;
    const prevRound = round - 1;
    const prevAuthorIdx = (albumJ + prevRound) % N;
    const prevAuthorId = players[prevAuthorIdx].id;
    const prevSlideData = getPrevSlide(room, prevRound, prevAuthorId);
    const prevSlide = prevSlideData
      ? { type: prevSlideData.type, content: prevSlideData.content }
      : null;

    if (round === 1) {
      // First draw: prevSlide = the write text, no prevImage, no erase
      return { prevSlide, prevImage: null, eraseRect: null, meta: null };
    }

    // Rounds 2+: prevImage = previous drawing, eraseRect = seeded random
    const prevImage = (prevSlideData && prevSlideData.type === 'drawing')
      ? prevSlideData.content
      : null;
    const eraseRect = pickEraseRect(room.code, round, albumJ);

    return { prevSlide, prevImage, eraseRect, meta: null };
  },
};
