'use strict';

// -------------------------------------------------------------------
// Shared helpers for mode modules
// -------------------------------------------------------------------

/**
 * Returns players in seat order. If room.seatOrder is set and valid,
 * returns players in that order; otherwise returns room.players order.
 */
function getSeatOrder(room) {
  if (room.seatOrder && room.seatOrder.length === room.players.length) {
    const ordered = room.seatOrder
      .map(id => room.players.find(p => p.id === id))
      .filter(Boolean);
    if (ordered.length === room.players.length) return ordered;
  }
  return room.players;
}

// -------------------------------------------------------------------
// Seeded RNG (xmur3 seed hash + sfc32 PRNG)
// -------------------------------------------------------------------

function hashString(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h;
}

/**
 * Returns a zero-arg function that produces floats in [0, 1).
 * seed should be a 32-bit integer (from hashString).
 */
function seededRandom(seed) {
  let a = seed >>> 0;
  let b = (seed ^ 0xdeadbeef) >>> 0;
  let c = (seed ^ 0xc0ffee) >>> 0;
  let d = (seed ^ 0xbabe) >>> 0;

  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Deterministically picks an erase rect for Missing Piece mode.
 * seed = room.code + ':' + round + ':' + albumIdx
 */
function pickEraseRect(roomCode, round, albumIdx, W = 720, H = 540) {
  const seed = hashString(`${roomCode}:${round}:${albumIdx}`);
  const rng = seededRandom(seed);
  const rectW = Math.floor(W * 0.25);
  const rectH = Math.floor(H * 0.25);
  const x = Math.floor(rng() * (W - rectW));
  const y = Math.floor(rng() * (H - rectH));
  return { x, y, w: rectW, h: rectH };
}

/** Placeholder empty text slide content */
function emptyText() { return '...'; }

/** Placeholder empty drawing slide content */
function emptyDrawing() { return ''; }

/**
 * Get a previous slide from roundData.
 * Returns slide object or null.
 */
function getPrevSlide(room, round, authorId) {
  const roundData = room._roundData || new Map();
  const roundMap = roundData.get(round) || new Map();
  return roundMap.get(authorId) || null;
}

module.exports = {
  getSeatOrder,
  hashString,
  seededRandom,
  pickEraseRect,
  emptyText,
  emptyDrawing,
  getPrevSlide,
};
