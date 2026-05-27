// sounds.js — KE_GartiK_Phone v0.3
// FEAT-SND-CSS: Sound effects module using Tone.js (opt-in, CDN lazy-loaded).
// All exported play functions are no-ops when disabled or when Tone fails to load.

const TONE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js';
const STORAGE_KEY = 'gartik.sound';

// -------------------------------------------------------------------------
// Module state
// -------------------------------------------------------------------------

let _enabled = (typeof localStorage !== 'undefined')
  ? localStorage.getItem(STORAGE_KEY) === 'on'
  : false;

/** Cached Tone namespace after first successful load. */
let _Tone = null;

/** Loading promise — prevents duplicate CDN fetches. */
let _loadPromise = null;

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

/**
 * Lazily load Tone.js from CDN.
 * Returns the Tone global, or null if loading fails.
 */
async function _loadTone() {
  if (_Tone) return _Tone;
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise((resolve) => {
    // Tone.js sets window.Tone when loaded via script tag
    const script = document.createElement('script');
    script.src = TONE_CDN;
    script.onload = () => {
      _Tone = window.Tone || null;
      resolve(_Tone);
    };
    script.onerror = () => {
      console.warn('[sounds.js] Failed to load Tone.js from CDN. Sound disabled.');
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return _loadPromise;
}

/**
 * Returns a loaded Tone object, or null if disabled / load failed.
 * Triggers CDN load on first call.
 */
async function _getTone() {
  if (!_enabled) return null;
  return _loadTone();
}

/**
 * Schedule and release a short synth note.
 * @param {object} Tone
 * @param {string} note    e.g. 'C5'
 * @param {number} durMs   note duration in ms
 * @param {number} delayMs offset from now in ms
 */
function _scheduleNote(Tone, note, durMs, delayMs = 0) {
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.08, sustain: 0.4, release: 0.2 },
    volume: -14,
  }).toDestination();

  const now = Tone.now();
  const start = now + delayMs / 1000;
  const dur   = `${durMs}n`; // Tone duration string — fallback to seconds if needed

  // Use seconds for exact control
  synth.triggerAttackRelease(note, durMs / 1000, start);

  // Dispose after note ends + buffer
  setTimeout(() => { try { synth.dispose(); } catch (_) {} }, delayMs + durMs + 400);
}

/**
 * Pluck-style note: shorter attack, fast decay.
 */
function _schedulePluck(Tone, note, durMs, delayMs = 0) {
  const synth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.1 },
    volume: -12,
  }).toDestination();

  const now = Tone.now();
  synth.triggerAttackRelease(note, durMs / 1000, now + delayMs / 1000);
  setTimeout(() => { try { synth.dispose(); } catch (_) {} }, delayMs + durMs + 400);
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Must be called from inside a user gesture (e.g. first button click).
 * Starts the Tone.js AudioContext, which browsers require before any audio.
 */
export async function init() {
  const Tone = await _loadTone();
  if (!Tone) return;
  try {
    await Tone.start();
  } catch (err) {
    console.warn('[sounds.js] Tone.start() failed:', err);
  }
}

/**
 * Enable or disable all sound effects.
 * Persists preference to localStorage.
 * @param {boolean} bool
 */
export function setEnabled(bool) {
  _enabled = !!bool;
  try {
    localStorage.setItem(STORAGE_KEY, _enabled ? 'on' : 'off');
  } catch (_) {}
}

/**
 * Returns true if sound effects are currently enabled.
 * @returns {boolean}
 */
export function isEnabled() {
  return _enabled;
}

/**
 * Injects a sound toggle checkbox + label into parentEl.
 * Class: .sound-toggle
 * @param {HTMLElement} parentEl
 */
export function mountSoundToggle(parentEl) {
  if (!parentEl) return;

  // Remove existing toggle if re-mounted
  const existing = parentEl.querySelector('.sound-toggle');
  if (existing) existing.remove();

  const wrapper = document.createElement('label');
  wrapper.className = 'sound-toggle';
  wrapper.title = 'Toggle sound effects';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = _enabled;
  checkbox.setAttribute('aria-label', 'Sound effects');

  const label = document.createElement('span');
  label.textContent = 'Sound';

  checkbox.addEventListener('change', async () => {
    setEnabled(checkbox.checked);
    if (checkbox.checked) {
      // Attempt Tone.start() while inside the user gesture
      await init();
    }
  });

  wrapper.appendChild(checkbox);
  wrapper.appendChild(label);
  parentEl.appendChild(wrapper);
}

// -------------------------------------------------------------------------
// Sound effects
// -------------------------------------------------------------------------

/**
 * 2-note ascending C5→E5 chime, ~150ms total.
 * Fired when a new phase assignment arrives.
 */
export async function playPhaseStart() {
  const Tone = await _getTone();
  if (!Tone) return;
  _scheduleNote(Tone, 'C5', 80,  0);
  _scheduleNote(Tone, 'E5', 80, 90);
}

/**
 * 2-note descending E5→C5, ~200ms total.
 * Fired when the current phase ends.
 */
export async function playPhaseEnd() {
  const Tone = await _getTone();
  if (!Tone) return;
  _scheduleNote(Tone, 'E5', 100,   0);
  _scheduleNote(Tone, 'C5', 100, 110);
}

/**
 * Single C6 confirm tone, ~80ms.
 * Fired on successful submit.
 */
export async function playSubmit() {
  const Tone = await _getTone();
  if (!Tone) return;
  _scheduleNote(Tone, 'C6', 80, 0);
}

/**
 * 3-note ascending C5→E5→G5 fanfare, ~500ms total.
 * Fired when the room enters reveal state.
 */
export async function playReveal() {
  const Tone = await _getTone();
  if (!Tone) return;
  _scheduleNote(Tone, 'C5', 150,   0);
  _scheduleNote(Tone, 'E5', 150, 170);
  _scheduleNote(Tone, 'G5', 200, 340);
}

/**
 * A4 soft pluck, ~100ms.
 * Fired when the player casts a vote.
 */
export async function playVote() {
  const Tone = await _getTone();
  if (!Tone) return;
  _schedulePluck(Tone, 'A4', 100, 0);
}

/**
 * A4→F4 descending sad tones, ~600ms total.
 * Fired when the player is kicked from the room.
 */
export async function playKicked() {
  const Tone = await _getTone();
  if (!Tone) return;
  _scheduleNote(Tone, 'A4', 250,   0);
  _scheduleNote(Tone, 'F4', 300, 270);
}
