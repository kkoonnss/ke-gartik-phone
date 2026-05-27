'use strict';

const { getSeatOrder } = require('./_shared');
const { MASTERPIECE_PROMPTS } = require('../prompts');

// -------------------------------------------------------------------
// Masterpiece mode
// -------------------------------------------------------------------
// Single drawing phase. All players draw the same masterprompt.
// No timer auto-advance (deadline: null). Host manually ends the phase.
// 15-minute safety cap enforced by game.js timer loop.
// 1 album with N slides (one per player).
// revealLayout: gallery

const MASTERPIECE_FALLBACK = 'Draw anything you want — make it a masterpiece!';

/**
 * Pick a fallback prompt: use room.customPrompts if non-empty,
 * else MASTERPIECE_PROMPTS built-in deck.
 */
function pickPromptFor(room) {
  const deck = (room.customPrompts && room.customPrompts.length > 0)
    ? room.customPrompts
    : MASTERPIECE_PROMPTS;
  return deck[Math.floor(Math.random() * deck.length)];
}

module.exports = {
  id: 'masterpiece',
  displayName: 'Masterpiece',
  description: 'All players draw the same subject with unlimited time. Host decides when done.',
  revealLayout: 'gallery',
  supportsManualAdvance: true,

  validateStart(room) {
    return room.players.length >= 2 ? null : 'Need at least 2 players';
  },

  initialPhase(room) {
    // deadline: null means no timer auto-advance
    // The 15-min hard cap is handled by game.js startRoomTimer
    return { name: 'masterpiece-draw', round: 1, seconds: null };
  },

  nextPhase(room, current) {
    // Only one phase, then reveal
    return null;
  },

  buildAlbums(room) {
    // M-3: use getSeatOrder for consistency with other modes
    const players = getSeatOrder(room);
    const N = players.length;
    // If no masterprompt set, try custom prompts deck, then MASTERPIECE_PROMPTS
    const prompt = room.masterprompt || pickPromptFor(room) || MASTERPIECE_FALLBACK;
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
        phase: 'masterpiece-draw',
        round: 1,
      });
    }
    return [slides];
  },

  assignmentForPlayer(room, playerIdx, phase) {
    // Use masterprompt if set by host, else fall back to custom/built-in deck
    const prompt = room.masterprompt || pickPromptFor(room) || MASTERPIECE_FALLBACK;
    const prevSlide = { type: 'text', content: prompt };
    return { prevSlide, prevImage: null, eraseRect: null, meta: null };
  },
};
