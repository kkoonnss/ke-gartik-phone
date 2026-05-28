/**
 * album-store.js — IndexedDB-backed album archive for KE_GartiK_Phone v0.6
 *
 * DB:    gartik-archive
 * Store: games  (keyPath: 'id', autoIncrement)
 * Index: playedAt  (for newest-first ordering)
 *
 * All functions degrade silently when IndexedDB is unavailable.
 */

const DB_NAME    = 'gartik-archive';
const DB_VERSION = 1;
const STORE_NAME = 'games';

/** Cached connection promise — opened once, reused forever. */
let _dbPromise = null;

/**
 * Open (or return the cached) IndexedDB connection.
 * Returns null if IndexedDB is unavailable so callers can short-circuit.
 */
function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      resolve(null);
      return;
    }

    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      resolve(null);
      return;
    }

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('playedAt', 'playedAt', { unique: false });
      }
    };

    req.onsuccess = (event) => {
      resolve(event.target.result);
    };

    req.onerror = () => {
      // e.g. blocked in private mode
      resolve(null);
    };

    req.onblocked = () => {
      resolve(null);
    };
  });

  return _dbPromise;
}

/** Wrap an IDBRequest in a Promise. */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save a completed game.
 * @param {{ code, mode, playedAt, players, albums }} game
 * @returns {Promise<number|null>} the new record id, or null if unavailable
 */
export async function saveGame({ code, mode, playedAt, players, albums }) {
  try {
    const db = await openDB();
    if (!db) return null;

    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = { code, mode, playedAt, players, albums };
    const id = await promisifyRequest(store.add(record));
    return id;
  } catch (e) {
    // Never throw — silent no-op on any unexpected error
    return null;
  }
}

/**
 * List saved games as metadata (no album payloads), newest first.
 * @returns {Promise<Array<{ id, code, mode, playedAt, playerCount, albumCount }>>}
 */
export async function listGames() {
  try {
    const db = await openDB();
    if (!db) return [];

    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('playedAt');

    // Open cursor in reverse (DESC) order to get newest first
    const results = [];
    await new Promise((resolve, reject) => {
      const req = index.openCursor(null, 'prev');
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          resolve();
          return;
        }
        const { id, code, mode, playedAt, players, albums } = cursor.value;
        results.push({
          id,
          code,
          mode,
          playedAt,
          playerCount: Array.isArray(players) ? players.length : 0,
          albumCount:  Array.isArray(albums)  ? albums.length  : 0,
        });
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });

    return results;
  } catch (e) {
    return [];
  }
}

/**
 * Retrieve the full record for replay.
 * @param {number} id
 * @returns {Promise<{ id, code, mode, playedAt, players, albums }|null>}
 */
export async function getGame(id) {
  try {
    const db = await openDB();
    if (!db) return null;

    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const record = await promisifyRequest(store.get(id));
    return record ?? null;
  } catch (e) {
    return null;
  }
}

/**
 * Delete one game by id.
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteGame(id) {
  try {
    const db = await openDB();
    if (!db) return;

    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.delete(id));
  } catch (e) {
    // Silent no-op
  }
}

/**
 * Wipe the entire archive.
 * @returns {Promise<void>}
 */
export async function clearAll() {
  try {
    const db = await openDB();
    if (!db) return;

    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await promisifyRequest(store.clear());
  } catch (e) {
    // Silent no-op
  }
}

/**
 * Return basic storage stats.
 * @returns {Promise<{ count: number }>}
 */
export async function stats() {
  try {
    const db = await openDB();
    if (!db) return { count: 0 };

    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const count = await promisifyRequest(store.count());
    return { count };
  } catch (e) {
    return { count: 0 };
  }
}
