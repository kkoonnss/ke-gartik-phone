// canvas.js — Drawing tool module for KE_GartiK_Phone
// FIX-B: Refactored so initCanvas registers pointer listeners exactly ONCE.
//         A new reset(opts) method clears canvas state + optionally loads a
//         startImage, without adding any new event listeners.

const COLORS = [
  '#111111', // black
  '#e63946', // red
  '#f1a208', // orange
  '#2a9d8f', // teal
  '#264653', // deep blue
  '#ffffff',  // white / eraser
];

const BRUSH_SIZES = [4, 10, 22];

const UNDO_STACK_LIMIT = 20;

/**
 * initCanvas(canvasEl, toolbarEl, opts) → instance
 *
 * Call ONCE per page load.  Registers pointer event listeners on canvasEl and
 * builds the initial toolbar DOM.
 *
 * Returned instance API:
 *   getDataUrl()                        — JPEG data URI, quality ladder, ≤240 KB
 *   clear()                             — wipe canvas pixels + undo stack
 *   loadImage(dataUri)                  — async; paint dataUri, reset undo baseline
 *   applyEraseRect({ x, y, w, h })      — synchronous white-fill rect + undo entry
 *   setStartImage(dataUri)              — clear + loadImage combined
 *   reset(opts?)                        — clear state, optionally load opts.startImage;
 *                                         also rebuilds toolbar DOM.  Returns Promise.
 *                                         Does NOT add new event listeners.
 *
 * @param {HTMLCanvasElement} canvasEl
 * @param {HTMLElement} toolbarEl
 * @param {object} [opts]
 */
export function initCanvas(canvasEl, toolbarEl, opts = {}) {
  // --- Internal resolution ---
  const W = 720;
  const H = 540;

  canvasEl.width = W;
  canvasEl.height = H;

  // Disable pinch/scroll on the canvas wrap (parent)
  const wrap = canvasEl.parentElement;
  if (wrap) {
    wrap.style.touchAction = 'none';
  }
  canvasEl.style.touchAction = 'none';
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
  canvasEl.style.objectFit = 'contain';
  canvasEl.style.cursor = 'crosshair';
  canvasEl.style.display = 'block';

  const ctx = canvasEl.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // --- State ---
  let currentColor = '#111111';
  let currentSize = 4;
  let isDrawing = false;
  let strokePoints = [];
  const undoStack = [];

  // --- Scaling helpers ---
  function getScale() {
    const rect = canvasEl.getBoundingClientRect();
    return {
      scaleX: W / rect.width,
      scaleY: H / rect.height,
      rect,
    };
  }

  function clientToCanvas(clientX, clientY) {
    const { scaleX, scaleY, rect } = getScale();
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  // --- Undo stack ---
  function saveSnapshot() {
    const imageData = ctx.getImageData(0, 0, W, H);
    if (undoStack.length >= UNDO_STACK_LIMIT) {
      undoStack.shift();
    }
    undoStack.push(imageData);
  }

  function undo() {
    if (undoStack.length === 0) return;
    const imageData = undoStack.pop();
    ctx.putImageData(imageData, 0, 0);
  }

  // --- Drawing ---
  function beginStroke(x, y) {
    saveSnapshot();
    strokePoints = [{ x, y }];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function continueStroke(x, y) {
    strokePoints.push({ x, y });
    const len = strokePoints.length;
    if (len < 2) return;

    // Draw quadraticCurveTo between midpoints for smooth strokes
    const prev = strokePoints[len - 2];
    const curr = strokePoints[len - 1];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;

    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function endStroke() {
    if (strokePoints.length > 0) {
      const last = strokePoints[strokePoints.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    strokePoints = [];
    isDrawing = false;
  }

  // --- Pointer events (registered ONCE for the lifetime of canvasEl) ---
  canvasEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvasEl.setPointerCapture(e.pointerId);
    isDrawing = true;
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    beginStroke(x, y);
  });

  canvasEl.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    continueStroke(x, y);
  });

  canvasEl.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    endStroke();
  });

  canvasEl.addEventListener('pointercancel', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    endStroke();
  });

  // --- Toolbar builder (called once by initCanvas and again by reset) ---
  function buildToolbar() {
    toolbarEl.innerHTML = '';

    // Color buttons
    const colorRow = document.createElement('div');
    colorRow.className = 'play__toolbar-row play__toolbar-colors';

    COLORS.forEach((color) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'play__color';
      btn.dataset.color = color;
      btn.style.backgroundColor = color;
      btn.title = color === '#ffffff' ? 'Eraser' : color;
      btn.setAttribute('aria-label', color === '#ffffff' ? 'Eraser' : `Color ${color}`);
      if (color === currentColor) btn.classList.add('active');
      btn.addEventListener('click', () => {
        currentColor = color;
        colorRow.querySelectorAll('.play__color').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
      colorRow.appendChild(btn);
    });
    toolbarEl.appendChild(colorRow);

    // Brush size buttons
    const brushRow = document.createElement('div');
    brushRow.className = 'play__toolbar-row play__toolbar-brushes';

    BRUSH_SIZES.forEach((size) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'play__brush';
      btn.dataset.size = size;
      btn.setAttribute('aria-label', `Brush size ${size}px`);
      // Visual dot to indicate size
      const dot = document.createElement('span');
      dot.style.cssText = `
        display:inline-block;
        width:${Math.min(size, 22)}px;
        height:${Math.min(size, 22)}px;
        border-radius:50%;
        background:#111;
        pointer-events:none;
      `;
      btn.appendChild(dot);
      if (size === currentSize) btn.classList.add('active');
      btn.addEventListener('click', () => {
        currentSize = size;
        brushRow.querySelectorAll('.play__brush').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
      brushRow.appendChild(btn);
    });
    toolbarEl.appendChild(brushRow);

    // Undo and Clear buttons
    const actionRow = document.createElement('div');
    actionRow.className = 'play__toolbar-row play__toolbar-actions';

    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'play__btn';
    undoBtn.textContent = 'UNDO';
    undoBtn.addEventListener('click', undo);
    actionRow.appendChild(undoBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'play__btn';
    clearBtn.textContent = 'CLEAR';
    clearBtn.addEventListener('click', () => {
      saveSnapshot();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    });
    actionRow.appendChild(clearBtn);

    toolbarEl.appendChild(actionRow);
  }

  // Build toolbar on first init
  buildToolbar();

  // --- Public API ---

  /**
   * getDataUrl() — returns JPEG data URI, quality 0.7, ≤240KB
   */
  function getDataUrl() {
    const MAX_BYTES = 240 * 1024; // 240KB
    let quality = 0.7;
    let dataUrl = canvasEl.toDataURL('image/jpeg', quality);

    // Approximate byte size from base64 length
    const base64Size = (dataUrl.length * 3) / 4;
    if (base64Size > MAX_BYTES) {
      quality = 0.5;
      dataUrl = canvasEl.toDataURL('image/jpeg', quality);
      const sz2 = (dataUrl.length * 3) / 4;
      if (sz2 > MAX_BYTES) {
        quality = 0.3;
        dataUrl = canvasEl.toDataURL('image/jpeg', quality);
        const sz3 = (dataUrl.length * 3) / 4;
        if (sz3 > MAX_BYTES) {
          // Last resort: scale down to 360×270
          const offscreen = document.createElement('canvas');
          offscreen.width = 360;
          offscreen.height = 270;
          const offCtx = offscreen.getContext('2d');
          offCtx.drawImage(canvasEl, 0, 0, 360, 270);
          dataUrl = offscreen.toDataURL('image/jpeg', 0.5);
        }
      }
    }
    return dataUrl;
  }

  /**
   * clear() — wipe canvas pixels and undo stack; abort any in-progress stroke.
   */
  function clear() {
    undoStack.length = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    strokePoints = [];
    isDrawing = false;
  }

  /**
   * loadImage(dataUri) — async; paints dataUri onto the internal 720x540 canvas,
   * then resets the undo stack and pushes the loaded state as the new baseline.
   * @param {string} dataUri
   * @returns {Promise<void>}
   */
  function loadImage(dataUri) {
    return new Promise((resolve, reject) => {
      if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
        reject(new Error('loadImage: invalid or non-data URI provided'));
        return;
      }

      // Abort any in-progress stroke so we don't composite over a partial draw
      if (isDrawing) {
        strokePoints = [];
        isDrawing = false;
      }

      const img = new Image();

      img.onload = () => {
        // Fill white first (handles transparent PNGs / SVGs cleanly)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        // Stretch to fill internal resolution — sources are expected to be 720x540
        ctx.drawImage(img, 0, 0, W, H);
        // Reset undo stack and push loaded state as the new baseline
        undoStack.length = 0;
        saveSnapshot();
        resolve();
      };

      img.onerror = () => {
        reject(new Error('loadImage: failed to decode the provided data URI'));
      };

      img.src = dataUri;
    });
  }

  /**
   * applyEraseRect({ x, y, w, h }) — synchronously fills the given rect with
   * white (#ffffff) in internal 720x540 canvas coordinates, then pushes the
   * result onto the undo stack so the player can undo it.
   * @param {{ x: number, y: number, w: number, h: number }} rect
   */
  function applyEraseRect({ x, y, w, h }) {
    // Guard: zero- or negative-area rects do nothing
    if (!w || !h || w <= 0 || h <= 0) return;
    saveSnapshot();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
  }

  /**
   * setStartImage(dataUri) — clears the canvas completely, loads the given
   * image, and establishes it as the new undo baseline (player cannot undo
   * past the loaded image).
   * @param {string} dataUri
   * @returns {Promise<void>}
   */
  function setStartImage(dataUri) {
    clear();
    return loadImage(dataUri);
  }

  /**
   * reset(opts?) — prepare canvas for a new draw phase WITHOUT adding new
   * event listeners.  Safe to call on every draw phase transition.
   *
   * Steps:
   *   1. Clears canvas pixels + undo stack (via clear())
   *   2. Resets drawing tool state to defaults (black, smallest brush)
   *   3. Rebuilds toolbar DOM (safe: direct children of toolbarEl, no leak)
   *   4. If opts.startImage is provided, loads it as the new undo baseline
   *
   * @param {{ startImage?: string }} [opts]
   * @returns {Promise<void>}
   */
  async function reset(opts = {}) {
    // 1 + 2: clear pixels, undo stack, and in-progress stroke
    clear();
    // Reset tool state so each new phase starts with the same defaults
    currentColor = '#111111';
    currentSize = 4;
    // 3: Rebuild toolbar (does not touch canvasEl, no listener leak)
    buildToolbar();
    // 4: Optionally pre-paint a background image
    if (opts.startImage) {
      await loadImage(opts.startImage);
    }
  }

  return { getDataUrl, clear, loadImage, applyEraseRect, setStartImage, reset };
}
