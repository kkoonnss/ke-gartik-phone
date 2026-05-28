/**
 * past.js — Browse + Replay page for saved game-night albums.
 * Agent B, CONTRACT_v6 §2.
 * Imports from album-store.js (Agent A).
 */

import { listGames, getGame, deleteGame } from './album-store.js';

// ─── DOM references ──────────────────────────────────────────────────────────
const listEl   = document.getElementById('archive-list');
const emptyEl  = document.getElementById('archive-empty');
const replayEl = document.getElementById('archive-replay');

// ─── Utility: safe text setter (escapes HTML injection) ──────────────────────
function escText(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

function setText(el, str) {
  el.textContent = String(str ?? '');
}

// ─── Format a timestamp to a friendly local date/time ────────────────────────
function formatDate(playedAt) {
  try {
    return new Date(playedAt).toLocaleString();
  } catch {
    return String(playedAt);
  }
}

// ─── Render the archive list ──────────────────────────────────────────────────
async function renderList() {
  listEl.innerHTML = '';
  replayEl.hidden = true;
  replayEl.innerHTML = '';

  let games = [];
  try {
    games = await listGames();
  } catch (err) {
    console.warn('[past.js] listGames failed:', err);
    games = [];
  }

  if (!Array.isArray(games) || games.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;

  for (const g of games) {
    const card = buildCard(g);
    listEl.appendChild(card);
  }
}

// ─── Build a single game card ─────────────────────────────────────────────────
function buildCard(g) {
  const card = document.createElement('div');
  card.className = 'archive__card';
  card.dataset.id = g.id;

  const meta = document.createElement('div');
  meta.className = 'archive__card-meta';

  const modeLine = document.createElement('span');
  modeLine.className = 'archive__card-meta-mode';
  setText(modeLine, g.mode ?? 'classic');

  const dateLine = document.createElement('span');
  dateLine.className = 'archive__card-meta-date';
  setText(dateLine, formatDate(g.playedAt));

  const countsLine = document.createElement('span');
  countsLine.className = 'archive__card-meta-counts';
  setText(countsLine, `${g.playerCount ?? '?'} players · ${g.albumCount ?? '?'} albums`);

  meta.append(modeLine, dateLine, countsLine);

  const actions = document.createElement('div');
  actions.className = 'archive__card-actions';

  const replayBtn = document.createElement('button');
  replayBtn.className = 'archive__replay-btn';
  replayBtn.type = 'button';
  setText(replayBtn, 'Replay');
  replayBtn.addEventListener('click', () => startReplay(g.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'archive__delete';
  deleteBtn.type = 'button';
  deleteBtn.setAttribute('aria-label', 'Delete this game');
  setText(deleteBtn, '×');
  deleteBtn.addEventListener('click', () => handleDelete(g.id));

  actions.append(replayBtn, deleteBtn);
  card.append(meta, actions);
  return card;
}

// ─── Delete handler ───────────────────────────────────────────────────────────
async function handleDelete(id) {
  if (!confirm('Delete this saved game? This cannot be undone.')) return;
  try {
    await deleteGame(id);
  } catch (err) {
    console.warn('[past.js] deleteGame failed:', err);
  }
  await renderList();
}

// ─── Replay: load game and build the replay viewer ───────────────────────────
async function startReplay(id) {
  replayEl.hidden = false;
  replayEl.innerHTML = '';

  // Scroll replay into view
  replayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let game = null;
  try {
    game = await getGame(id);
  } catch (err) {
    console.warn('[past.js] getGame failed:', err);
  }

  if (!game || !Array.isArray(game.albums) || game.albums.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'archive__empty';
    setText(msg, 'No album data found for this game.');
    replayEl.appendChild(msg);
    return;
  }

  // Build player lookup map: id -> { name, emoji }
  const playerMap = {};
  if (Array.isArray(game.players)) {
    for (const p of game.players) {
      if (p && p.id != null) {
        playerMap[p.id] = { name: p.name ?? 'Anonymous', emoji: p.emoji ?? '' };
      }
    }
  }

  // ── State ──
  const albums   = game.albums;
  let albumIdx   = 0;
  let slideIdx   = 0;

  // ── Container elements ──
  const closeBtn = document.createElement('button');
  closeBtn.className = 'archive__back';
  closeBtn.type = 'button';
  setText(closeBtn, '← Back to list');
  closeBtn.addEventListener('click', () => {
    replayEl.hidden = true;
    replayEl.innerHTML = '';
    listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  replayEl.appendChild(closeBtn);

  const albumNav = document.createElement('div');
  albumNav.className = 'archive__nav archive__nav--album';
  replayEl.appendChild(albumNav);

  const slideArea = document.createElement('div');
  slideArea.className = 'archive__slide';
  replayEl.appendChild(slideArea);

  const slideNav = document.createElement('div');
  slideNav.className = 'archive__nav archive__nav--slide';
  replayEl.appendChild(slideNav);

  // ── Render functions ──
  function renderAlbumNav() {
    albumNav.innerHTML = '';

    const prevAlbum = document.createElement('button');
    prevAlbum.className = 'archive__nav-btn';
    prevAlbum.type = 'button';
    setText(prevAlbum, '‹ Album');
    prevAlbum.disabled = albumIdx === 0;
    prevAlbum.addEventListener('click', () => {
      albumIdx--;
      slideIdx = 0;
      render();
    });

    const label = document.createElement('span');
    label.className = 'archive__nav-label';
    setText(label, `Album ${albumIdx + 1} / ${albums.length}`);

    const nextAlbum = document.createElement('button');
    nextAlbum.className = 'archive__nav-btn';
    nextAlbum.type = 'button';
    setText(nextAlbum, 'Album ›');
    nextAlbum.disabled = albumIdx === albums.length - 1;
    nextAlbum.addEventListener('click', () => {
      albumIdx++;
      slideIdx = 0;
      render();
    });

    albumNav.append(prevAlbum, label, nextAlbum);
  }

  function renderSlide() {
    slideArea.innerHTML = '';

    const album = albums[albumIdx];

    // Guard: album might be null/undefined or empty
    if (!Array.isArray(album) || album.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'archive__empty';
      setText(msg, 'This album has no slides.');
      slideArea.appendChild(msg);
      return;
    }

    const slide = album[slideIdx];
    if (!slide) {
      const msg = document.createElement('p');
      msg.className = 'archive__empty';
      setText(msg, 'Slide not found.');
      slideArea.appendChild(msg);
      return;
    }

    if (slide.type === 'drawing') {
      const img = document.createElement('img');
      img.className = 'archive__slide-img';
      img.alt = 'Drawing slide';
      img.src = slide.content ?? '';
      slideArea.appendChild(img);
    } else {
      // text slide
      const textEl = document.createElement('p');
      textEl.className = 'archive__slide-text';
      // Use textContent — never innerHTML — to avoid injection
      textEl.textContent = slide.content ?? '';
      slideArea.appendChild(textEl);
    }

    // Author line
    const authorEl = document.createElement('div');
    authorEl.className = 'archive__slide-author';
    const info = playerMap[slide.authorId];
    const name  = info ? `${info.emoji ? info.emoji + ' ' : ''}${info.name}` : 'Anonymous';
    authorEl.textContent = name;
    slideArea.appendChild(authorEl);
  }

  function renderSlideNav() {
    slideNav.innerHTML = '';

    const album = albums[albumIdx];
    const total = Array.isArray(album) ? album.length : 0;

    const prevSlide = document.createElement('button');
    prevSlide.className = 'archive__nav-btn';
    prevSlide.type = 'button';
    setText(prevSlide, '‹ Prev');
    prevSlide.disabled = slideIdx === 0;
    prevSlide.addEventListener('click', () => {
      slideIdx--;
      render();
    });

    const label = document.createElement('span');
    label.className = 'archive__nav-label';
    setText(label, total > 0 ? `Slide ${slideIdx + 1} / ${total}` : 'No slides');

    const nextSlide = document.createElement('button');
    nextSlide.className = 'archive__nav-btn';
    nextSlide.type = 'button';
    setText(nextSlide, 'Next ›');
    nextSlide.disabled = slideIdx >= total - 1;
    nextSlide.addEventListener('click', () => {
      slideIdx++;
      render();
    });

    slideNav.append(prevSlide, label, nextSlide);
  }

  function render() {
    renderAlbumNav();
    renderSlide();
    renderSlideNav();
  }

  render();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
renderList();
