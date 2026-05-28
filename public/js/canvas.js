// canvas.js — Drawing tool module for KE_GartiK_Phone
// v0.5: Added tool mode (brush / fill / rectangle / ellipse / line)
//       with live shape preview, flood fill, and full undo integration.
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

// Tool definitions: id, label, SVG icon path (24x24 viewBox)
const TOOLS = [
  {
    id: 'brush',
    label: 'Brush',
    // Paintbrush icon
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-.999 2-2 3s1 1 1 1z"/><path d="M9 3H6"/><path d="M3 13c2-.5 4-2 4-4"/></svg>`,
  },
  {
    id: 'fill',
    label: 'Fill',
    // Bucket fill icon
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11L7.5 2.5a2 2 0 0 0-2.83 0L2.5 4.67a2 2 0 0 0 0 2.83L11 15"/><path d="M19 11l2.5 2.5a2 2 0 0 1 0 2.83l-1.67 1.67a2 2 0 0 1-2.83 0L14.5 15"/><line x1="11" y1="15" x2="14.5" y2="15"/><path d="M21 21a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1z"/></svg>`,
  },
  {
    id: 'rect',
    label: 'Rect',
    // Rectangle icon
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    // Circle/ellipse icon
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>`,
  },
  {
    id: 'line',
    label: 'Line',
    // Diagonal line icon
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="21" x2="21" y2="3"/></svg>`,
  },
];

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
  let currentTool = 'brush';   // 'brush' | 'fill' | 'rect' | 'ellipse' | 'line'
  let isDrawing = false;
  let strokePoints = [];
  const undoStack = [];

  // Shape tool preview state
  let shapeStartX = 0;
  let shapeStartY = 0;
  let shapeSnapshot = null; // ImageData captured at pointerdown for live preview

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

  // --- Drawing helpers ---
  function applyStrokeStyle() {
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // --- Brush stroke ---
  function beginStroke(x, y) {
    saveSnapshot();
    strokePoints = [{ x, y }];
    ctx.beginPath();
    ctx.moveTo(x, y);
    applyStrokeStyle();
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
    applyStrokeStyle();
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

  // --- Shape drawing (used both for preview and commit) ---
  function drawShape(tool, x0, y0, x1, y1) {
    ctx.beginPath();
    applyStrokeStyle();
    if (tool === 'rect') {
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    } else if (tool === 'ellipse') {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = Math.abs(x1 - x0) / 2;
      const ry = Math.abs(y1 - y0) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === 'line') {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  // --- Bucket fill (queue-based BFS flood fill, no recursion) ---
  function floodFill(startX, startY, fillColorHex) {
    // Parse fill color from hex to RGBA
    const fr = parseInt(fillColorHex.slice(1, 3), 16);
    const fg = parseInt(fillColorHex.slice(3, 5), 16);
    const fb = parseInt(fillColorHex.slice(5, 7), 16);
    const fa = 255;

    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;

    const sx = Math.floor(startX);
    const sy = Math.floor(startY);

    // Guard: out of bounds
    if (sx < 0 || sx >= W || sy < 0 || sy >= H) return;

    const startIdx = (sy * W + sx) * 4;
    const targetR = data[startIdx];
    const targetG = data[startIdx + 1];
    const targetB = data[startIdx + 2];
    const targetA = data[startIdx + 3];

    // No-op if target color already matches fill color (within tolerance)
    const TOLERANCE = 32;
    function colorMatch(idx) {
      return (
        Math.abs(data[idx]     - targetR) <= TOLERANCE &&
        Math.abs(data[idx + 1] - targetG) <= TOLERANCE &&
        Math.abs(data[idx + 2] - targetB) <= TOLERANCE &&
        Math.abs(data[idx + 3] - targetA) <= TOLERANCE
      );
    }

    // Check if fill color is same as target (no-op guard)
    if (
      Math.abs(fr - targetR) <= TOLERANCE &&
      Math.abs(fg - targetG) <= TOLERANCE &&
      Math.abs(fb - targetB) <= TOLERANCE
    ) {
      return; // already that color — don't infinite-loop
    }

    // Visited bitset — avoid re-queuing
    const visited = new Uint8Array(W * H);

    // Queue of pixel indices (using typed array for performance)
    const queue = new Int32Array(W * H);
    let qHead = 0;
    let qTail = 0;

    // Seed
    const startLinear = sy * W + sx;
    queue[qTail++] = startLinear;
    visited[startLinear] = 1;

    while (qHead < qTail) {
      const linear = queue[qHead++];
      const px = linear % W;
      const py = (linear - px) / W;
      const idx = linear * 4;

      // Paint this pixel
      data[idx]     = fr;
      data[idx + 1] = fg;
      data[idx + 2] = fb;
      data[idx + 3] = fa;

      // Expand to 4-connected neighbors
      const neighbors = [
        px > 0     ? linear - 1 : -1,  // left
        px < W - 1 ? linear + 1 : -1,  // right
        py > 0     ? linear - W : -1,  // up
        py < H - 1 ? linear + W : -1,  // down
      ];

      for (let i = 0; i < 4; i++) {
        const n = neighbors[i];
        if (n < 0 || visited[n]) continue;
        visited[n] = 1;
        if (colorMatch(n * 4)) {
          queue[qTail++] = n;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // --- Abort any in-progress interaction cleanly ---
  function abortCurrentInteraction() {
    if (!isDrawing) return;
    // For shape tools: restore the snapshot (discard preview)
    if (shapeSnapshot && (currentTool === 'rect' || currentTool === 'ellipse' || currentTool === 'line')) {
      // shapeSnapshot was already saved to undoStack — pop it back off
      // since we're aborting without committing
      const last = undoStack[undoStack.length - 1];
      if (last === shapeSnapshot) {
        undoStack.pop();
      }
      ctx.putImageData(shapeSnapshot, 0, 0);
    }
    shapeSnapshot = null;
    strokePoints = [];
    isDrawing = false;
  }

  // --- Pointer events (registered ONCE for the lifetime of canvasEl) ---
  canvasEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvasEl.setPointerCapture(e.pointerId);
    isDrawing = true;
    const { x, y } = clientToCanvas(e.clientX, e.clientY);

    if (currentTool === 'brush') {
      beginStroke(x, y);
    } else if (currentTool === 'fill') {
      // Fill is a single-click action
      saveSnapshot();
      floodFill(x, y, currentColor);
      isDrawing = false; // no drag needed
    } else {
      // rect / ellipse / line — capture snapshot for live preview + undo baseline
      saveSnapshot();
      shapeSnapshot = undoStack[undoStack.length - 1]; // reference to what we just pushed
      shapeStartX = x;
      shapeStartY = y;
    }
  });

  canvasEl.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = clientToCanvas(e.clientX, e.clientY);

    if (currentTool === 'brush') {
      continueStroke(x, y);
    } else if (currentTool === 'rect' || currentTool === 'ellipse' || currentTool === 'line') {
      // Restore snapshot and redraw preview shape
      if (shapeSnapshot) {
        ctx.putImageData(shapeSnapshot, 0, 0);
      }
      drawShape(currentTool, shapeStartX, shapeStartY, x, y);
    }
    // fill: no drag needed
  });

  canvasEl.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { x, y } = clientToCanvas(e.clientX, e.clientY);

    if (currentTool === 'brush') {
      endStroke();
    } else if (currentTool === 'rect' || currentTool === 'ellipse' || currentTool === 'line') {
      // Restore snapshot first (clean slate), then commit the final shape
      // The snapshot is already on the undo stack from pointerdown
      if (shapeSnapshot) {
        ctx.putImageData(shapeSnapshot, 0, 0);
      }
      // Only draw if drag was more than a minimal threshold (avoid phantom shapes)
      const dx = x - shapeStartX;
      const dy = y - shapeStartY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        drawShape(currentTool, shapeStartX, shapeStartY, x, y);
      } else {
        // Zero-drag click — pop the snapshot so undo stack isn't polluted
        const last = undoStack[undoStack.length - 1];
        if (last === shapeSnapshot) undoStack.pop();
      }
      shapeSnapshot = null;
      isDrawing = false;
    }
    // fill: isDrawing already set false in pointerdown
  });

  canvasEl.addEventListener('pointercancel', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    if (currentTool === 'brush') {
      endStroke();
    } else if (currentTool === 'rect' || currentTool === 'ellipse' || currentTool === 'line') {
      // Abort: restore to pre-shape state and remove the undo entry
      if (shapeSnapshot) {
        const last = undoStack[undoStack.length - 1];
        if (last === shapeSnapshot) undoStack.pop();
        ctx.putImageData(shapeSnapshot, 0, 0);
        shapeSnapshot = null;
      }
      isDrawing = false;
    } else {
      isDrawing = false;
    }
  });

  // --- Toolbar builder (called once by initCanvas and again by reset) ---
  function buildToolbar() {
    toolbarEl.innerHTML = '';

    // --- Row 1: Tool selector ---
    const toolRow = document.createElement('div');
    toolRow.className = 'play__toolbar-row play__toolbar-tools';

    TOOLS.forEach((tool) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'play__tool';
      btn.dataset.tool = tool.id;
      btn.title = tool.label;
      btn.setAttribute('aria-label', tool.label);
      btn.innerHTML = tool.svg;
      if (tool.id === currentTool) btn.classList.add('active');
      btn.addEventListener('click', () => {
        // Abort any in-progress interaction before switching tools
        abortCurrentInteraction();
        currentTool = tool.id;
        toolRow.querySelectorAll('.play__tool').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
      toolRow.appendChild(btn);
    });
    toolbarEl.appendChild(toolRow);

    // --- Row 2: Color buttons ---
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

    // --- Row 3: Brush size buttons ---
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

    // --- Row 4: Undo and Clear buttons ---
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
    shapeSnapshot = null;
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
        shapeSnapshot = null;
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
   *   2. Resets drawing tool state to defaults (black, smallest brush, brush tool)
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
    currentTool = 'brush';
    // 3: Rebuild toolbar (does not touch canvasEl, no listener leak)
    buildToolbar();
    // 4: Optionally pre-paint a background image
    if (opts.startImage) {
      await loadImage(opts.startImage);
    }
  }

  return { getDataUrl, clear, loadImage, applyEraseRect, setStartImage, reset };
}
