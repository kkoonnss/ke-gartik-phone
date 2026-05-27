'use strict';

const { getSeatOrder, getPrevSlide } = require('./_shared');

// -------------------------------------------------------------------
// Story mode
// -------------------------------------------------------------------
// Text-only chain. Players write sentences building on the last.
// Phases for N players:
//   round 0: write (opening sentence)
//   rounds 1..N-1: continue (add the next sentence)
// N albums, all text slides.

module.exports = {
  id: 'story',
  displayName: 'Story',
  description: 'Text-only chain. Write the next sentence based only on the previous.',
  revealLayout: 'scrollback',
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
    if (name === 'write') return { name: 'continue', round: 1 };
    if (name === 'continue') {
      if (round >= N - 1) return null; // reveal
      return { name: 'continue', round: round + 1 };
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
          type: 'text',
          authorId,
          content: '...',
          phase: i === 0 ? 'write' : 'continue',
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

    // continue: show previous sentence in this album chain
    // Player playerIdx is working on album j: (j + round) mod N = playerIdx => j = (playerIdx - round + N) mod N
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
