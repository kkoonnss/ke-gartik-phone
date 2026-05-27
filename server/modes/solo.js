'use strict';

const { PROMPTS } = require('../prompts');
const { getSeatOrder } = require('./_shared');

// -------------------------------------------------------------------
// Solo mode
// -------------------------------------------------------------------
// BUG FIX: v1 had a wasted write phase for solo mode. Fixed here.
// Phases:
//   round 1: draw (all players draw the same prompt simultaneously)
//   then reveal
// 1 album: slide 0 = system prompt text, slides 1..N = each player's drawing.

/**
 * Pick a prompt for this room: use room.customPrompts deck if non-empty,
 * otherwise fall back to the built-in PROMPTS deck.
 */
function pickPromptFor(room) {
  const deck = (room.customPrompts && room.customPrompts.length > 0)
    ? room.customPrompts
    : PROMPTS;
  return deck[Math.floor(Math.random() * deck.length)];
}

module.exports = {
  id: 'solo',
  displayName: 'Solo',
  description: "Everyone draws the same prompt simultaneously. No chains — just see everyone's take!",
  revealLayout: 'gallery',
  supportsManualAdvance: false,

  validateStart(room) {
    return room.players.length >= 2 ? null : 'Need at least 2 players';
  },

  initialPhase(room) {
    // Pick a random prompt and store it if not already set.
    // Prefers room.customPrompts deck if set (item 12).
    if (!room._soloPrompt) {
      room._soloPrompt = pickPromptFor(room);
    }
    return { name: 'draw', round: 1, seconds: room.settings.drawSeconds };
  },

  nextPhase(room, current) {
    // Only one phase, then reveal
    return null;
  },

  buildAlbums(room) {
    // M-3: use getSeatOrder for consistency with other modes
    const players = getSeatOrder(room);
    const N = players.length;
    const prompt = room._soloPrompt || '';
    const slides = [
      { type: 'text', authorId: 'system', content: prompt, phase: 'write', round: 0 },
    ];
    const roundData = room._roundData || new Map();
    const drawRound = roundData.get(1) || new Map();
    for (let i = 0; i < N; i++) {
      const player = players[i];
      const d = drawRound.get(player.id);
      slides.push({
        type: 'drawing',
        authorId: player.id,
        content: d ? d.content : '',
        phase: 'draw',
        round: 1,
      });
    }
    return [slides];
  },

  assignmentForPlayer(room, playerIdx, phase) {
    if (phase.name === 'draw') {
      const prevSlide = { type: 'text', content: room._soloPrompt || '' };
      return { prevSlide, prevImage: null, eraseRect: null, meta: null };
    }
    return { prevSlide: null, prevImage: null, eraseRect: null, meta: null };
  },
};
