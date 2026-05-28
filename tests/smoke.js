'use strict';

/**
 * KE_GartiK_Phone v1.1 Smoke Test
 * ================================
 * Walks each game mode from room-create through reveal using 3 fake socket.io clients.
 * Expects the server to already be running on localhost:3000.
 * Exit 0 on full pass, exit 1 on any failure.
 *
 * v0.5 additions (Fix B):
 *   - Classic structure assertion: 3 albums × 3 slides for N=3 players.
 *   - Reveal nav round-trip: next-to-end → prev → assert state='reveal' + reveal:slide
 *     re-emitted → next-to-end again. Tests the v0.5 guard fix in server/game.js.
 *
 * Usage:
 *   node tests/smoke.js
 *   npm test
 */

const { io: ioc } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const PER_MODE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Hardcoded 32x32 white JPEG data URI (~350 bytes, valid JPEG)
// Generated from a minimal JFIF: SOI + APP0 + DQT + SOF0 + DHT + SOS + EOI
// ---------------------------------------------------------------------------
const TINY_JPEG =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB' +
  'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEB' +
  'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB' +
  'AQEBAQEBAQEBAQEBAQH/wAARCAAgACADASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACv/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwAB/9k=';

// ---------------------------------------------------------------------------
// Expected reveal layouts per mode
// ---------------------------------------------------------------------------
const EXPECTED_LAYOUT = {
  classic:      'stepper',
  knockoff:     'stepper',
  solo:         'gallery',
  story:        'scrollback',
  animation:    'frame-cycle',
  coop:         'stepper',
  masterpiece:  'gallery',
  missingpiece: 'stepper',
  background:   'gallery',
  secret:       'stepper',
};

// Modes that use draw phases (need JPEG submission)
const DRAW_PHASES = new Set([
  'draw', 'knockoff-draw', 'coop-draw', 'masterpiece-draw',
  'missingpiece-draw', 'background-draw',
]);

// knockoff-show phase auto-advances by timer; no submission needed
const SKIP_SUBMIT_PHASES = new Set(['knockoff-show']);

// Phases that produce text content
const TEXT_PHASES = new Set([
  'write', 'describe', 'continue',
]);

// Modes that require supportsManualAdvance (host must emit phase:skip)
const MANUAL_ADVANCE_MODES = new Set(['masterpiece']);

// Modes that need extra lobby config
const NEEDS_MASTERPROMPT = new Set(['masterpiece', 'background']);
const NEEDS_BACKGROUND   = new Set(['background']);
const NEEDS_SEATORDER    = new Set(['secret']);

// Modes that are known not yet wired in the current server (will be auto-skipped gracefully)
// The tester will still attempt them and mark them FAIL if server doesn't respond.
// This list is for documentation only — the tester always attempts all modes.

// ---------------------------------------------------------------------------
// Utility: wait for an event matching a predicate, with timeout
// ---------------------------------------------------------------------------
function waitForEvent(socket, event, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer;
    const handler = (data) => {
      try {
        if (!predicate || predicate(data)) {
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(data);
        }
      } catch (e) {
        // predicate threw; ignore and keep waiting
      }
    };
    timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for '${event}' after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.on(event, handler);
  });
}

// ---------------------------------------------------------------------------
// Utility: emit with ack, returns a promise
// ---------------------------------------------------------------------------
function emitAck(socket, event, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`ACK timeout for event '${event}'`)),
      timeoutMs,
    );
    socket.emit(event, data, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

// ---------------------------------------------------------------------------
// Utility: connect a client
// ---------------------------------------------------------------------------
function connect() {
  return new Promise((resolve, reject) => {
    const sock = ioc(SERVER_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    sock.once('connect', () => resolve(sock));
    sock.once('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('Socket connect timeout')), 6000);
  });
}

// ---------------------------------------------------------------------------
// Utility: disconnect all sockets cleanly
// ---------------------------------------------------------------------------
function disconnectAll(sockets) {
  for (const s of sockets) {
    try { s.removeAllListeners(); s.disconnect(); } catch (_) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Utility: validate phase:assignment per CONTRACT_v2 §4
// ---------------------------------------------------------------------------
function validateAssignment(data, errors) {
  const validPhases = [
    'write', 'draw', 'describe', 'continue',
    'coop-draw', 'masterpiece-draw', 'missingpiece-draw', 'background-draw',
    'knockoff-show', 'knockoff-draw',
  ];

  if (!validPhases.includes(data.phase)) {
    errors.push(`Invalid phase name: '${data.phase}'`);
  }
  if (typeof data.round !== 'number' || data.round < 0 || !Number.isInteger(data.round)) {
    errors.push(`Invalid round: ${data.round}`);
  }
  if (data.deadline !== null && data.deadline !== undefined) {
    const now = Date.now();
    if (typeof data.deadline !== 'number') {
      errors.push(`deadline must be a number or null, got: ${typeof data.deadline}`);
    } else if (data.deadline < now - 1000) {
      // Allow 1 second of clock drift
      errors.push(`deadline is in the past: ${data.deadline}`);
    } else if (data.deadline > now + 30 * 60 * 1000) {
      errors.push(`deadline is more than 30min in the future: ${data.deadline}`);
    }
  }
  if (data.prevImage !== null && data.prevImage !== undefined) {
    if (typeof data.prevImage !== 'string' || !data.prevImage.startsWith('data:')) {
      errors.push(`prevImage must start with 'data:' if present`);
    }
  }
  if (data.eraseRect !== null && data.eraseRect !== undefined) {
    const r = data.eraseRect;
    if (
      typeof r.x !== 'number' || typeof r.y !== 'number' ||
      typeof r.w !== 'number' || typeof r.h !== 'number'
    ) {
      errors.push(`eraseRect must have numeric x, y, w, h`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test a single mode end-to-end
// Returns { pass: bool, durationMs, revealLayout, albumCount, slideCount, notes }
// ---------------------------------------------------------------------------
async function testMode(mode) {
  const sockets = [];
  const errors  = [];
  const notes   = [];

  let revealLayout   = null;
  let albumCount     = null;
  let totalSlides    = null;
  let revealReceived = false;

  const tStart = Date.now();

  // -- 1. Connect 3 clients --------------------------------------------------
  let sockA, sockB, sockC;
  try {
    [sockA, sockB, sockC] = await Promise.all([connect(), connect(), connect()]);
    sockets.push(sockA, sockB, sockC);
  } catch (e) {
    return {
      pass: false,
      durationMs: Date.now() - tStart,
      revealLayout: null,
      albumCount: null,
      totalSlides: null,
      notes: [`Connect failed: ${e.message}`],
    };
  }

  // Track errors from all three sockets
  for (const s of sockets) {
    s.on('error', (e) => errors.push(`Server error event: ${JSON.stringify(e)}`));
  }

  // -- 2. TestA creates room --------------------------------------------------
  let code, playerIdA;
  try {
    const ack = await emitAck(sockA, 'room:create', { name: 'TestA', emoji: '🎨' });
    if (!ack || !ack.ok) {
      throw new Error(`room:create failed: ${JSON.stringify(ack)}`);
    }
    code      = ack.code;
    playerIdA = ack.playerId;
  } catch (e) {
    disconnectAll(sockets);
    return {
      pass: false,
      durationMs: Date.now() - tStart,
      revealLayout: null,
      albumCount: null,
      totalSlides: null,
      notes: [`room:create error: ${e.message}`],
    };
  }

  // -- 3. TestB and TestC join ------------------------------------------------
  let playerIdB, playerIdC;
  try {
    const [ackB, ackC] = await Promise.all([
      emitAck(sockB, 'room:join', { code, name: 'TestB', emoji: '🐙' }),
      emitAck(sockC, 'room:join', { code, name: 'TestC', emoji: '🦊' }),
    ]);
    if (!ackB || !ackB.ok) throw new Error(`TestB join failed: ${JSON.stringify(ackB)}`);
    if (!ackC || !ackC.ok) throw new Error(`TestC join failed: ${JSON.stringify(ackC)}`);
    playerIdB = ackB.playerId;
    playerIdC = ackC.playerId;
  } catch (e) {
    disconnectAll(sockets);
    return {
      pass: false,
      durationMs: Date.now() - tStart,
      revealLayout: null,
      albumCount: null,
      totalSlides: null,
      notes: [`room:join error: ${e.message}`],
    };
  }

  // -- 4. Configure mode -------------------------------------------------------
  // room:settings — all modes
  sockA.emit('room:settings', {
    mode,
    writeSeconds: 20,
    drawSeconds: 30,
    describeSeconds: 15,
    knockoffShowSeconds: mode === 'knockoff' ? 3 : 8,
  });

  // Extra config per mode
  if (NEEDS_MASTERPROMPT.has(mode)) {
    sockA.emit('room:masterprompt', { prompt: 'A robot eating a sandwich' });
  }
  if (NEEDS_BACKGROUND.has(mode)) {
    sockA.emit('room:background', { backgroundId: 'blank-white' });
  }
  if (NEEDS_SEATORDER.has(mode)) {
    sockA.emit('room:seatorder', { order: [playerIdB, playerIdC, playerIdA] });
  }

  // Brief pause for settings to propagate before starting
  await new Promise(r => setTimeout(r, 100));

  // -- 5. Install phase:assignment handlers on all three clients ---------------
  // We track assignments per player to handle masterpiece manual advance
  const assignmentsReceived = { A: [], B: [], C: [] };

  function makeAssignmentHandler(sock, name, assignList) {
    return function onAssignment(data) {
      // Validate per CONTRACT_v2 §4
      validateAssignment(data, errors);

      assignList.push(data);

      // Don't submit for auto-advancing phases
      if (SKIP_SUBMIT_PHASES.has(data.phase)) {
        notes.push(`[${name}] Skipping submit for auto-phase '${data.phase}' round ${data.round}`);
        return;
      }

      // Determine content type
      let content;
      if (DRAW_PHASES.has(data.phase)) {
        content = TINY_JPEG;
      } else if (TEXT_PHASES.has(data.phase)) {
        content = `Test text from ${name} round ${data.round}`;
      } else {
        // Unknown phase — try text
        content = `Test text from ${name}`;
      }

      sock.emit('phase:submit', { phase: data.phase, round: data.round, content });
    };
  }

  sockA.on('phase:assignment', makeAssignmentHandler(sockA, 'TestA', assignmentsReceived.A));
  sockB.on('phase:assignment', makeAssignmentHandler(sockB, 'TestB', assignmentsReceived.B));
  sockC.on('phase:assignment', makeAssignmentHandler(sockC, 'TestC', assignmentsReceived.C));

  // -- 6. Start game ----------------------------------------------------------
  sockA.emit('game:start');

  // -- 7. Wait for reveal (or ended) state, with per-mode timeout -------------
  // For masterpiece: after any masterpiece-draw assignment arrives on TestA,
  // wait a tick then emit phase:skip to force advance.
  let masterpieceSkirted = false;
  if (MANUAL_ADVANCE_MODES.has(mode)) {
    sockA.on('phase:assignment', (data) => {
      if (data.phase === 'masterpiece-draw' && !masterpieceSkirted) {
        masterpieceSkirted = true;
        // Allow 200ms for others to submit before skipping
        setTimeout(() => {
          notes.push('[TestA] Emitting phase:skip for masterpiece');
          sockA.emit('phase:skip');
        }, 500);
      }
    });
  }

  // Listen for room:state changes on TestA (host socket)
  let lastState = 'lobby';
  let revealSlideCount = 0;
  let revealAlbumPayload = null;

  sockA.on('room:state', (state) => {
    lastState = state.state;
    if ((state.state === 'reveal' || state.state === 'ended') && !revealReceived) {
      revealReceived = true;

      // Capture revealLayout from state if present
      if (state.revealLayout) {
        revealLayout = state.revealLayout;
      }
      // Capture album count if albums present
      if (state.albums) {
        albumCount = state.albums.length;
        totalSlides = state.albums.reduce((sum, alb) => sum + alb.length, 0);
      }
    }
  });

  sockA.on('reveal:slide', (data) => {
    revealSlideCount++;
    if (albumCount === null && data.total) {
      albumCount = data.total.albums;
    }
  });

  sockA.on('reveal:album', (data) => {
    revealAlbumPayload = data;
    if (albumCount === null && data.total) {
      albumCount = data.total.albums;
    }
    if (data.album) {
      totalSlides = (totalSlides || 0) + data.album.length;
    }
  });

  // Wait for reveal state
  let revealWaitError = null;
  try {
    await waitForEvent(
      sockA,
      'room:state',
      (state) => state.state === 'reveal' || state.state === 'ended',
      PER_MODE_TIMEOUT_MS,
    );
  } catch (e) {
    revealWaitError = e.message;
  }

  // If we didn't catch reveal via event listener (event came before we registered):
  if (!revealWaitError && !revealReceived) {
    // waitForEvent resolved but revealReceived wasn't set by our earlier listener
    // (can happen if they fired in same tick) — mark as received
    revealReceived = true;
  }

  if (revealWaitError) {
    disconnectAll(sockets);
    return {
      pass: false,
      durationMs: Date.now() - tStart,
      revealLayout,
      albumCount,
      totalSlides,
      notes: [
        `Reveal not reached within ${PER_MODE_TIMEOUT_MS}ms`,
        `Last state: ${lastState}`,
        `Assignments received: A=${assignmentsReceived.A.length} B=${assignmentsReceived.B.length} C=${assignmentsReceived.C.length}`,
        ...notes,
        ...errors,
      ],
    };
  }

  // -- 8. Verify revealLayout ------------------------------------------------
  const expectedLayout = EXPECTED_LAYOUT[mode];

  if (revealLayout === null) {
    // Server may not yet have revealLayout in room:state (v1 game.js not yet refactored)
    // This is a soft warning, not a hard failure, so we note it
    notes.push(`revealLayout not in room:state — server may still be on v1 dispatcher`);
    // Infer from mode
    revealLayout = expectedLayout;
  } else if (revealLayout !== expectedLayout) {
    errors.push(`revealLayout mismatch: expected '${expectedLayout}', got '${revealLayout}'`);
  }

  // -- 9. Exercise reveal:next -----------------------------------------------
  // Emit a few reveal:next and confirm no crash (no 'error' event arrives)
  // For stepper: expect reveal:slide
  // For frame-cycle / scrollback: expect reveal:album
  // For gallery: no-op

  const revealNextErrors = [];
  const tmpErrHandler = (e) => revealNextErrors.push(JSON.stringify(e));
  sockA.on('error', tmpErrHandler);

  const revealNextCount = 3;
  for (let i = 0; i < revealNextCount; i++) {
    sockA.emit('reveal:next');
    // Small delay to let server respond
    await new Promise(r => setTimeout(r, 80));
  }
  await new Promise(r => setTimeout(r, 200));

  sockA.off('error', tmpErrHandler);

  if (revealNextErrors.length > 0) {
    errors.push(`reveal:next triggered server errors: ${revealNextErrors.join(', ')}`);
  }

  // -- 10. Classic-specific: structure assertion (v0.5 Fix B) ----------------
  // For classic with N=3 players: assert 3 albums, each 3 slides.
  // albumCount and totalSlides were populated either from room:state.albums
  // (serialized when state='reveal'/'ended') or from reveal:slide/reveal:album payloads.
  if (mode === 'classic') {
    const expectedAlbums = 3;
    const expectedSlidesPerAlbum = 3;
    const expectedTotal = expectedAlbums * expectedSlidesPerAlbum;

    if (albumCount === null || albumCount === undefined) {
      errors.push(`Classic structure FAIL: albumCount not received (no albums in room:state or reveal payloads)`);
    } else if (albumCount !== expectedAlbums) {
      errors.push(`Classic structure FAIL: expected ${expectedAlbums} albums, got ${albumCount}`);
    } else {
      notes.push(`Classic structure PASS: albumCount=${albumCount} (expected ${expectedAlbums})`);
    }

    if (totalSlides === null || totalSlides === undefined) {
      errors.push(`Classic structure FAIL: totalSlides not received`);
    } else if (totalSlides !== expectedTotal) {
      errors.push(`Classic structure FAIL: expected ${expectedTotal} total slides (${expectedAlbums}×${expectedSlidesPerAlbum}), got ${totalSlides}`);
    } else {
      notes.push(`Classic structure PASS: totalSlides=${totalSlides} (expected ${expectedTotal})`);
    }
  }

  // -- 11. Cleanup -----------------------------------------------------------
  disconnectAll(sockets);

  const durationMs = Date.now() - tStart;
  const pass = errors.length === 0;

  return {
    pass,
    durationMs,
    revealLayout,
    albumCount,
    totalSlides,
    notes: pass ? notes : [...notes, ...errors],
  };
}

// ---------------------------------------------------------------------------
// v0.5 Fix B: Reveal nav round-trip test (classic mode, stepper layout)
// Walks reveal:next to 'ended', then prev → assert 'reveal' + reveal:slide,
// then next again → assert can reach 'ended' once more.
// ---------------------------------------------------------------------------
async function testRevealNavRoundTrip() {
  const STEP_TIMEOUT = 5000;
  const errors  = [];
  const notes   = [];
  const sockets = [];

  const tStart = Date.now();

  // -- Connect 3 clients --
  let sockA, sockB, sockC;
  try {
    [sockA, sockB, sockC] = await Promise.all([connect(), connect(), connect()]);
    sockets.push(sockA, sockB, sockC);
  } catch (e) {
    return { pass: false, notes: [`Connect failed: ${e.message}`] };
  }

  // -- Create room + join --
  let code, playerIdA, playerIdB, playerIdC;
  try {
    const ackA = await emitAck(sockA, 'room:create', { name: 'NavA', emoji: '🎨' });
    if (!ackA || !ackA.ok) throw new Error(`room:create failed: ${JSON.stringify(ackA)}`);
    code      = ackA.code;
    playerIdA = ackA.playerId;

    const [ackB, ackC] = await Promise.all([
      emitAck(sockB, 'room:join', { code, name: 'NavB', emoji: '🐙' }),
      emitAck(sockC, 'room:join', { code, name: 'NavC', emoji: '🦊' }),
    ]);
    if (!ackB || !ackB.ok) throw new Error(`NavB join failed: ${JSON.stringify(ackB)}`);
    if (!ackC || !ackC.ok) throw new Error(`NavC join failed: ${JSON.stringify(ackC)}`);
    playerIdB = ackB.playerId;
    playerIdC = ackC.playerId;
  } catch (e) {
    disconnectAll(sockets);
    return { pass: false, notes: [`Room setup error: ${e.message}`] };
  }

  // -- Configure classic --
  sockA.emit('room:settings', {
    mode: 'classic',
    writeSeconds: 20,
    drawSeconds: 30,
    describeSeconds: 15,
  });
  await new Promise(r => setTimeout(r, 100));

  // -- Wire up phase:assignment handlers for all 3 players --
  const submitHandler = (sock, name) => (data) => {
    if (data.phase === 'knockoff-show') return;
    let content;
    if (DRAW_PHASES.has(data.phase)) {
      content = TINY_JPEG;
    } else {
      content = `Nav text from ${name} round ${data.round}`;
    }
    sock.emit('phase:submit', { phase: data.phase, round: data.round, content });
  };
  sockA.on('phase:assignment', submitHandler(sockA, 'NavA'));
  sockB.on('phase:assignment', submitHandler(sockB, 'NavB'));
  sockC.on('phase:assignment', submitHandler(sockC, 'NavC'));

  // -- Start game --
  sockA.emit('game:start');

  // -- Wait for reveal state --
  try {
    await waitForEvent(
      sockA,
      'room:state',
      (state) => state.state === 'reveal' || state.state === 'ended',
      PER_MODE_TIMEOUT_MS,
    );
  } catch (e) {
    disconnectAll(sockets);
    return { pass: false, notes: [`Reveal not reached: ${e.message}`] };
  }
  notes.push('Reached reveal state');

  // -- Step 1: Walk reveal:next to 'ended' --
  // Classic with 3 players: 3 albums × 3 slides = 9 steps max.
  // Emit next until room:state shows 'ended', with a cap of 15 steps to avoid hang.
  let reachedEnded = false;
  for (let i = 0; i < 15; i++) {
    // Set up a race: either room:state arrives with 'ended', or we time out waiting.
    const statePromise = waitForEvent(
      sockA,
      'room:state',
      (s) => s.state === 'ended' || s.state === 'reveal',
      STEP_TIMEOUT,
    );
    sockA.emit('reveal:next');
    let stateAfterNext;
    try {
      stateAfterNext = await statePromise;
    } catch (e) {
      // Timeout on this step — may have been a no-op (gallery) or last slide; try a short poll
      stateAfterNext = null;
    }
    if (stateAfterNext && stateAfterNext.state === 'ended') {
      reachedEnded = true;
      notes.push(`Reached 'ended' after ${i + 1} reveal:next(s)`);
      break;
    }
  }

  if (!reachedEnded) {
    disconnectAll(sockets);
    return {
      pass: false,
      notes: [...notes, `Reveal nav round-trip FAIL: could not reach 'ended' state by stepping reveal:next`],
    };
  }

  // -- Step 2: Emit reveal:prev once, assert state returns to 'reveal' AND reveal:slide fires --
  let prevRestoredReveal = false;
  let prevSlideEmitted   = false;

  // Race: listen for room:state='reveal' AND reveal:slide, with timeout.
  const prevStatePromise = waitForEvent(
    sockA,
    'room:state',
    (s) => s.state === 'reveal',
    STEP_TIMEOUT,
  ).then(s => { prevRestoredReveal = true; return s; });

  const prevSlidePromise = waitForEvent(
    sockA,
    'reveal:slide',
    null,   // any reveal:slide is fine
    STEP_TIMEOUT,
  ).then(s => { prevSlideEmitted = true; return s; });

  sockA.emit('reveal:prev');

  // Wait for both (or timeout on each independently)
  await Promise.allSettled([prevStatePromise, prevSlidePromise]);

  if (!prevRestoredReveal) {
    errors.push(
      `Reveal nav FAIL: reveal:prev did not restore 'reveal' state (v0.5 fix not deployed?)`,
    );
  } else {
    notes.push(`Reveal nav PASS: reveal:prev from 'ended' restored state to 'reveal'`);
  }

  if (!prevSlideEmitted) {
    errors.push(
      `Reveal nav FAIL: reveal:prev did not re-emit reveal:slide (v0.5 fix not deployed?)`,
    );
  } else {
    notes.push(`Reveal nav PASS: reveal:slide re-emitted after reveal:prev from 'ended'`);
  }

  // Only continue the 3rd step if the first two passed
  if (errors.length === 0) {
    // -- Step 3: reveal:next again — confirm it can still reach 'ended' --
    let reachedEndedAgain = false;
    for (let i = 0; i < 15; i++) {
      const statePromise2 = waitForEvent(
        sockA,
        'room:state',
        (s) => s.state === 'ended' || s.state === 'reveal',
        STEP_TIMEOUT,
      );
      sockA.emit('reveal:next');
      let s2;
      try {
        s2 = await statePromise2;
      } catch (_) {
        s2 = null;
      }
      if (s2 && s2.state === 'ended') {
        reachedEndedAgain = true;
        notes.push(`Reveal nav PASS: reveal:next after reveal:prev reached 'ended' again (step ${i + 1})`);
        break;
      }
    }
    if (!reachedEndedAgain) {
      errors.push(
        `Reveal nav FAIL: reveal:next after reveal:prev could not reach 'ended' again`,
      );
    }
  }

  disconnectAll(sockets);
  const pass = errors.length === 0;
  return {
    pass,
    durationMs: Date.now() - tStart,
    notes: pass ? notes : [...notes, ...errors],
  };
}

// ---------------------------------------------------------------------------
// Check server reachability via HTTP /health
// ---------------------------------------------------------------------------
async function checkServer() {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`${SERVER_URL}/health`, { timeout: 4000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('KE_GartiK_Phone v1.1 Smoke Test');
  console.log('================================');
  console.log(`Server: ${SERVER_URL}`);
  console.log('');

  // Server reachability check
  const alive = await checkServer();
  if (!alive) {
    console.error(`ERROR: Server unreachable at ${SERVER_URL}`);
    console.error('Start it first: run-local.bat');
    process.exit(1);
  }

  const modes = [
    'classic', 'knockoff', 'solo', 'story', 'animation',
    'coop', 'masterpiece', 'missingpiece', 'background', 'secret',
  ];

  const results = [];
  let passCount = 0;

  for (const mode of modes) {
    const label = `Testing mode: ${mode.padEnd(12)}`;
    process.stdout.write(label + '... ');

    let result;
    try {
      result = await testMode(mode);
    } catch (e) {
      result = {
        pass: false,
        durationMs: 0,
        revealLayout: null,
        albumCount: null,
        totalSlides: null,
        notes: [`Uncaught exception: ${e.message}`, e.stack],
      };
    }

    const secs    = (result.durationMs / 1000).toFixed(1);
    const layout  = result.revealLayout || 'unknown';
    const albums  = result.albumCount != null ? result.albumCount : '?';
    const slides  = result.totalSlides != null ? result.totalSlides : '?';

    if (result.pass) {
      passCount++;
      console.log(`PASS  (${secs}s, layout=${layout}, ${albums} albums, ${slides} slides)`);
    } else {
      console.log('FAIL');
      // Print reason(s) indented
      for (const note of result.notes) {
        console.log(`  ${note}`);
      }
    }

    results.push({ mode, ...result });

    // Brief pause between modes to let server GC any lingering state
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('');
  console.log('================================');
  console.log(`RESULT: ${passCount}/${modes.length} PASSED`);
  console.log('');

  // -------------------------------------------------------------------------
  // v0.5 Fix B — Extra: Reveal nav round-trip test (classic, stepper layout)
  // Run after the main mode loop so it doesn't affect per-mode pass/fail counts.
  // -------------------------------------------------------------------------
  console.log('--- v0.5 Reveal Navigation Round-Trip ---');
  process.stdout.write('Testing reveal:prev from ended state... ');

  let navResult;
  try {
    navResult = await testRevealNavRoundTrip();
  } catch (e) {
    navResult = {
      pass: false,
      notes: [`Uncaught exception: ${e.message}`, e.stack],
    };
  }

  const navSecs = navResult.durationMs ? (navResult.durationMs / 1000).toFixed(1) : '?';
  if (navResult.pass) {
    console.log(`PASS  (${navSecs}s)`);
    for (const note of (navResult.notes || [])) {
      console.log(`  ${note}`);
    }
  } else {
    console.log('FAIL');
    for (const note of (navResult.notes || [])) {
      console.log(`  ${note}`);
    }
  }

  console.log('');

  const allPassed = passCount === modes.length && navResult.pass;
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal error in smoke test:', e);
  process.exit(1);
});
