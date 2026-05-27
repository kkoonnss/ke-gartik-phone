'use strict';

const { getSeatOrder, getPrevSlide } = require('./_shared');

// -------------------------------------------------------------------
// Animation mode
// -------------------------------------------------------------------
// Players write an animation description (round 0), then draw successive
// frames (rounds 1..N-1). The reveal cycles frames as an animation.
// Phases for N players:
//   round 0: write (describe your animation)
//   rounds 1..N-1: draw (each frame)
// N albums, each with N slides: slide 0 = text prompt, slides 1..N-1 = frames.
// revealLayout: frame-cycle (client plays frames at 3fps)

module.exports = {
  id: 'animation',
  displayName: 'Animation',
  description: 'Write what to animate, then each player draws the next frame. Watch it come alive!',
  revealLayout: 'frame-cycle',
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
      if (round >= N - 1) return null; // reveal
      return { name: 'draw', round: round + 1 };
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
          phase: i === 0 ? 'write' : 'draw',
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

    // draw: get the previous frame for this album chain
    const albumJ = ((playerIdx - round) % N + N) % N;
    const prevRound = round - 1;
    const prevAuthorIdx = (albumJ + prevRound) % N;
    const prevAuthorId = players[prevAuthorIdx].id;
    const prevSlideData = getPrevSlide(room, prevRound, prevAuthorId);
    const prevSlide = prevSlideData
      ? { type: prevSlideData.type, content: prevSlideData.content }
      : null;

    // Include the animation prompt (round 0 text for this album)
    // Album j's round-0 author is player j
    const promptAuthorId = players[albumJ].id;
    const roundData = room._roundData || new Map();
    const round0Map = roundData.get(0) || new Map();
    const promptSlide = round0Map.get(promptAuthorId);
    const animationPrompt = promptSlide ? promptSlide.content : '';

    const meta = {
      frameNumber: round,
      totalFrames: N - 1,
      animationPrompt,
    };

    return { prevSlide, prevImage: null, eraseRect: null, meta };
  },
};
