'use strict';

// Solo-mode starter prompts — motion design / Monday Meeting flavored, PG-13.
const PROMPTS = [
  'A motion designer\'s nightmare',
  'What 3am After Effects looks like',
  'The new Cinema 4D mascot',
  'When the render finally finishes',
  'A keyframe in love',
  'Greenscreen on a Monday',
  'If Houdini had a band',
  'Render farm uprising',
  'The moment your computer crashes mid-export',
  'A plugin arguing with the main software',
  'The shape layer that escaped the composition',
  'Bezier handles as a profession',
  'What lives inside a motion blur',
  'Null object seeking purpose',
  'An easing curve as a roller coaster',
  'The After Effects timeline at midnight',
  'A motion designer on vacation (can\'t stop seeing keyframes)',
  'Two gradients falling out of love',
  'The expression that broke everything',
  'Monday meeting energy at 9am',
  'A render queue with feelings',
  'The precomp that grew too large',
  'Stacking blend modes until something works',
  'A camera rig with existential dread',
  'The frame rate negotiation',
  'Type on a path gone wrong',
  'When you forget to turn off motion blur before RAM preview',
  'A logo animation getting notes for the 12th time',
  'The client who wants it \'more dynamic\'',
  'GPU vs. CPU: the final battle',
];

// ── Masterpiece mode prompts ─────────────────────────────────────────────────
// ~20 motion-design-flavored prompts used when the host doesn't set a custom one.
const MASTERPIECE_PROMPTS = [
  'Your dream studio setup',
  'A motion designer\'s coffee mug',
  'Cinema 4D\'s new mascot',
  'The Render Goblin',
  'After Effects fan-art',
  'A logo for Monday Meeting',
  'Render at 99% forever',
  'Spline gone wrong',
  'Houdini in the wild',
  'Bezier handles having a fight',
  'Selfie of an animator at 3am',
  'Tablet pen vs mouse showdown',
  'Keyframe in a frame',
  'Studio cat',
  'Easter egg in the credits',
  'Mograph cloner romance',
  'Premiere\'s spinning ball',
  'Final Cut returns',
  'The export bar of doom',
  'A new design law',
];

// ── Animation mode prompts ────────────────────────────────────────────────────
// ~15 simple actions easy to draw in a few frames.
const ANIMATION_PROMPTS = [
  'A bouncing ball',
  'A blinking eye',
  'A waving hand',
  'Sun rising',
  'A flower blooming',
  'A logo morphing',
  'A character walking',
  'Hair blowing in wind',
  'A clock ticking',
  'Coffee being poured',
  'A spaceship launching',
  'Page turning',
  'Frog jumping',
  'Heart beating',
  'Wave crashing',
];

// ── Background mode prompts ───────────────────────────────────────────────────
// ~10 simple prompts paired with the chosen background image.
const BACKGROUND_PROMPTS = [
  'Make this room feel cozy',
  'Add monsters',
  'Plants take over',
  'Add yourself',
  'Add a celebrity',
  'Make it Halloween',
  'Make it underwater',
  'Add the year 3000',
  'Now it\'s a music video',
  'Disco',
];

// ── Helper ────────────────────────────────────────────────────────────────────
/**
 * pickRandom(deckName)
 * deckName: 'PROMPTS' | 'MASTERPIECE_PROMPTS' | 'ANIMATION_PROMPTS' | 'BACKGROUND_PROMPTS'
 * Falls back to PROMPTS if the deck is not found.
 */
function pickRandom(deckName) {
  const decks = {
    PROMPTS,
    MASTERPIECE_PROMPTS,
    ANIMATION_PROMPTS,
    BACKGROUND_PROMPTS,
  };
  const arr = decks[deckName] || PROMPTS;
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  PROMPTS,
  MASTERPIECE_PROMPTS,
  ANIMATION_PROMPTS,
  BACKGROUND_PROMPTS,
  pickRandom,
};
