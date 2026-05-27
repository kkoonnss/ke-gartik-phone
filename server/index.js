'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server: SocketIo } = require('socket.io');
const QRCode = require('qrcode');

const { attachGame } = require('./game');
const { roomCount, getRoom, serializeRoom } = require('./rooms');
const modes = require('./modes');
const { BACKGROUNDS } = require('./backgrounds');

const PORT = process.env.PORT || 3000;
const START_TIME = Date.now();

// -------------------------------------------------------------------
// Express app
// -------------------------------------------------------------------
const app = express();

// Static assets
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/host/:code', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'host.html'));
});

app.get('/play/:code', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'play.html'));
});

app.get('/album/:code', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'album.html'));
});

// Health check — used by deploy smoke check (Agent F)
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    rooms: roomCount(),
    uptimeSec: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

// Backgrounds catalogue
// GET /api/backgrounds
// Returns: { backgrounds: [...] }
// H-2: top-level require — no try/catch needed since backgrounds.js is always present
app.get('/api/backgrounds', (req, res) => {
  res.json({ backgrounds: BACKGROUNDS });
});

// Room state — read-only; no socket join required (M-5 / spectator REST endpoint)
// GET /api/room/:code
// Returns: { ok: true, room: <serializeRoom output> } or { ok: false, error: 'ROOM_NOT_FOUND' }
app.get('/api/room/:code', (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND' });
  res.json({ ok: true, room: serializeRoom(room) });
});

// Mode registry
// GET /api/modes
// Returns: { modes: [{ id, displayName, description, revealLayout }] }
app.get('/api/modes', (req, res) => {
  const modeList = Object.values(modes).map(m => ({
    id: m.id,
    displayName: m.displayName,
    description: m.description,
    revealLayout: m.revealLayout,
  }));
  res.json({ modes: modeList });
});

// QR code endpoint
// GET /api/qr?text=https://example.com/?room=ABCD
// Returns: { dataUrl: "data:image/png;base64,..." }
app.get('/api/qr', async (req, res) => {
  const text = req.query.text;
  if (!text) {
    return res.status(400).json({ error: 'text query param required' });
  }
  try {
    const dataUrl = await QRCode.toDataURL(String(text), {
      margin: 2,
      width: 256,
      color: { dark: '#000000', light: '#ffffff' },
    });
    res.json({ dataUrl });
  } catch (e) {
    console.error('QR generation error', e);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// -------------------------------------------------------------------
// HTTP server + Socket.io
// -------------------------------------------------------------------
const server = http.createServer(app);

const io = new SocketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  // Allow both websocket and polling for resilience
  transports: ['websocket', 'polling'],
});

// Wire game state machine
attachGame(io);

// -------------------------------------------------------------------
// Start listening
// -------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`[KE_GartiK_Phone] Server running on port ${PORT}`);
  console.log(`[KE_GartiK_Phone] Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[KE_GartiK_Phone] SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
