'use strict';

const { getSeatOrder, getPrevSlide } = require('./_shared');

// -------------------------------------------------------------------
// Co-Op mode
// -------------------------------------------------------------------
// Same phases as Classic (write -> draw -> describe -> draw -> describe -> ...)
// but draw phases pass prevImage = the most recent drawing's content
// so the player can build directly on top of the previous drawing.
// Phases for N players:
//   round 0: write
//   round 1: coop-draw (prevImage = null for first draw)
//   round 2: describe
//   round 3: coop-draw (prevImage = drawing from round 1)
//   round 4: describe
//   ... up to round N-1
// N albums, same structure as Classic.
// revealLayout: stepper

module.exports = {
  id: 'coop',
  displayName: 'Co-Op',
  description: 'Draw on top of the previous drawing. Collaborative layers!',
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
    if (name === 'write') return { name: 'coop-draw', round: 1 };
    if (round >= N - 1) return null; // reveal
    if (name === 'coop-draw') return { name: 'describe', round: round + 1 };
    if (name === 'describe') return { name: 'coop-draw', round: round + 1 };
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
        const isDrawRound = i > 0 && i % 2 === 1;
        const slide = roundMap.get(authorId) || {
          type: i === 0 ? 'text' : (isDrawRound ? 'drawing' : 'text'),
          authorId,
          content: i === 0 ? '...' : '',
          phase: i === 0 ? 'write' : (isDrawRound ? 'coop-draw' : 'describe'),
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

    const albumJ = ((playerIdx - round) % N + N) % N;
    const prevRound = round - 1;
    const prevAuthorIdx = (albumJ + prevRound) % N;
    const prevAuthorId = players[prevAuthorIdx].id;
    const prevSlideData = getPrevSlide(room, prevRound, prevAuthorId);
    const prevSlide = prevSlideData
      ? { type: prevSlideData.type, content: prevSlideData.content }
      : null;

    if (phaseName === 'coop-draw') {
      // For the first coop-draw (round 1): prevSlide is text, no prevImage
      // For subsequent coop-draws: we need to find the most recent drawing
      // Walk back through rounds to find the last drawing in this album chain
      let prevImage = null;
      const roundData = room._roundData || new Map();
      for (let r = round - 1; r >= 1; r--) {
        const authorIdx = (albumJ + r) % N;
        const authorId = players[authorIdx].id;
        const rMap = roundData.get(r) || new Map();
        const s = rMap.get(authorId);
        if (s && s.type === 'drawing' && s.content) {
          prevImage = s.content;
          break;
        }
      }
      return { prevSlide, prevImage, eraseRect: null, meta: null };
    }

    if (phaseName === 'describe') {
      return { prevSlide, prevImage: null, eraseRect: null, meta: null };
    }

    return { prevSlide, prevImage: null, eraseRect: null, meta: null };
  },
};
