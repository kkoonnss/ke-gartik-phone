'use strict';

// -------------------------------------------------------------------
// Background mode
// -------------------------------------------------------------------
// All players draw on top of the same chosen background image.
// Single phase: background-draw.
// prevImage = the chosen background's dataUri.
// 1 album with N slides (one per player).
// revealLayout: gallery

const { getSeatOrder } = require('./_shared');
// H-2: top-level require — no try/catch needed since backgrounds.js is always present
const { BACKGROUNDS } = require('../backgrounds');

const BACKGROUND_FALLBACK = 'Draw something on this background!';

module.exports = {
  id: 'background',
  displayName: 'Background',
  description: 'Everyone draws on top of the same background. Add your creative spin!',
  revealLayout: 'gallery',
  supportsManualAdvance: false,

  validateStart(room) {
    return room.players.length >= 2 ? null : 'Need at least 2 players';
  },

  initialPhase(room) {
    return { name: 'background-draw', round: 1, seconds: room.settings.drawSeconds };
  },

  nextPhase(room, current) {
    // Single phase then reveal
    return null;
  },

  buildAlbums(room) {
    // M-3: use getSeatOrder for consistency with other modes
    const players = getSeatOrder(room);
    const N = players.length;
    const roundData = room._roundData || new Map();
    const drawRound = roundData.get(1) || new Map();

    const slides = [];
    for (let i = 0; i < N; i++) {
      const player = players[i];
      const d = drawRound.get(player.id);
      slides.push({
        type: 'drawing',
        authorId: player.id,
        content: d ? d.content : '',
        phase: 'background-draw',
        round: 1,
      });
    }
    return [slides];
  },

  assignmentForPlayer(room, playerIdx, phase) {
    const prompt = room.masterprompt || BACKGROUND_FALLBACK;
    const prevSlide = { type: 'text', content: prompt };

    // H-2: use module-level BACKGROUNDS (no try/catch needed)
    let prevImage = null;
    if (room.backgroundId) {
      const bg = BACKGROUNDS.find(b => b.id === room.backgroundId);
      if (bg) prevImage = bg.dataUri;
    }

    return { prevSlide, prevImage, eraseRect: null, meta: null };
  },
};
