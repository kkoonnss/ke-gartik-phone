'use strict';

const { getSeatOrder, getPrevSlide } = require('./_shared');

// -------------------------------------------------------------------
// Classic mode
// -------------------------------------------------------------------
// Phases for N players:
//   round 0: write
//   round 1: draw
//   round 2: describe
//   round 3: draw
//   ... up to round N-1
// N albums, each with N slides.

module.exports = {
  id: 'classic',
  displayName: 'Classic',
  description: 'The original game. Write a prompt, draw it, describe the drawing, draw again...',
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
    if (round >= N - 1) return null; // go to reveal
    if (name === 'draw') return { name: 'describe', round: round + 1 };
    if (name === 'describe') return { name: 'draw', round: round + 1 };
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
          type: i === 0 ? 'text' : (i % 2 === 1 ? 'drawing' : 'text'),
          authorId,
          content: i === 0 ? '...' : '',
          phase: i === 0 ? 'write' : (i % 2 === 1 ? 'draw' : 'describe'),
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

    // Player playerIdx works on album j where (j + round) mod N = playerIdx
    // => j = (playerIdx - round + N) mod N
    const albumJ = ((playerIdx - round) % N + N) % N;
    const prevRound = round - 1;
    const prevAuthorIdx = (albumJ + prevRound) % N;
    const prevAuthorId = players[prevAuthorIdx].id;
    const prevSlideData = getPrevSlide(room, prevRound, prevAuthorId);
    const prevSlide = prevSlideData
      ? { type: prevSlideData.type, content: prevSlideData.content }
      : null;

    return { prevSlide, prevImage: null, eraseRect: null, meta: null };
  },
};
