'use strict';

// Stock background catalogue — 720x540 SVG data URIs for Background mode.
// Each URI is produced via: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
// All under 50KB.

function svgUri(svg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ── 1. Blank White ───────────────────────────────────────────────────────────
const blankWhite = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
  '<rect width="720" height="540" fill="#ffffff"/>' +
  '</svg>'
);

// ── 2. Blank Black ───────────────────────────────────────────────────────────
const blankBlack = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
  '<rect width="720" height="540" fill="#0b0b0f"/>' +
  '</svg>'
);

// ── 3. Grid Light ────────────────────────────────────────────────────────────
// White bg + #e0e0e0 1px lines every 40px (vertical + horizontal)
// L-1: dead IIFE removed (was a no-op left over from incremental editing)
const gridLightLines = (function () {
  const lines = [];
  // Vertical lines at x = 40, 80, 120 … 720
  for (let x = 40; x < 720; x += 40) {
    lines.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="540" stroke="#e0e0e0" stroke-width="1"/>');
  }
  // Horizontal lines at y = 40, 80 … 540
  for (let y = 40; y < 540; y += 40) {
    lines.push('<line x1="0" y1="' + y + '" x2="720" y2="' + y + '" stroke="#e0e0e0" stroke-width="1"/>');
  }
  return lines.join('');
})();

const gridLight = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
  '<rect width="720" height="540" fill="#ffffff"/>' +
  gridLightLines +
  '</svg>'
);

// ── 4. Dot Grid ──────────────────────────────────────────────────────────────
// White bg + #cccccc 3px-radius circles every 40px
const gridDotsCircles = (function () {
  const dots = [];
  for (let x = 40; x <= 720; x += 40) {
    for (let y = 40; y <= 540; y += 40) {
      dots.push('<circle cx="' + x + '" cy="' + y + '" r="3" fill="#cccccc"/>');
    }
  }
  return dots.join('');
})();

const gridDots = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
  '<rect width="720" height="540" fill="#ffffff"/>' +
  gridDotsCircles +
  '</svg>'
);

// ── 5. Zoom Grid ─────────────────────────────────────────────────────────────
// 3×3 grid of dark #1c1e25 rects with #0b0b0f gutters.
// Canvas 720×540. Gutter = 8px on all sides & between cells.
// Cell size = (720 - 4*8) / 3 = (720-32)/3 = 229.33 → floor 229  (total used = 229*3+32 = 719)
// Height: (540 - 4*8) / 3 = (540-32)/3 = 169.33 → floor 169 (total used = 169*3+32 = 539)
// Camera icon: white circle r=10 in upper-right of each cell, inset 14px
const zoomGridRects = (function () {
  const gutter = 8;
  const cellW = Math.floor((720 - 4 * gutter) / 3);
  const cellH = Math.floor((540 - 4 * gutter) / 3);
  const rects = [];
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const x = gutter + col * (cellW + gutter);
      const y = gutter + row * (cellH + gutter);
      // dark rect
      rects.push('<rect x="' + x + '" y="' + y + '" width="' + cellW + '" height="' + cellH + '" rx="4" fill="#1c1e25"/>');
      // tiny camera icon: white circle + lens circle in upper-right
      const cx = x + cellW - 18;
      const cy = y + 18;
      // camera body (rounded rect)
      rects.push('<rect x="' + (cx - 12) + '" y="' + (cy - 8) + '" width="24" height="16" rx="3" fill="rgba(255,255,255,0.25)"/>');
      // lens
      rects.push('<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="rgba(255,255,255,0.35)"/>');
      rects.push('<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="rgba(255,255,255,0.55)"/>');
    }
  }
  return rects.join('');
})();

const zoomGrid = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
  '<rect width="720" height="540" fill="#0b0b0f"/>' +
  zoomGridRects +
  '</svg>'
);

// ── 6. TV Color Bars ─────────────────────────────────────────────────────────
// Classic SMPTE 8-bar layout: 8 equal-width vertical bars across 720px.
// Colors (left→right): white, yellow, cyan, green, magenta, red, blue, black
// Each bar width = 720/8 = 90px
const colorBarsRects = (function () {
  const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
  const barW = 720 / colors.length;
  return colors.map((c, i) =>
    '<rect x="' + (i * barW) + '" y="0" width="' + barW + '" height="540" fill="' + c + '"/>'
  ).join('');
})();

const colorBars = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
  colorBarsRects +
  '</svg>'
);

// ── 7. Spotlight ─────────────────────────────────────────────────────────────
// Black BG with radial gradient from #ffe066 center to #0b0b0f edges.
// Gradient stops: 0%=#ffe066, 50%=#ffe066 (soft) → 100%=#0b0b0f
const spotlight = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
  '<defs>' +
  '<radialGradient id="sg" cx="50%" cy="50%" r="55%" fx="50%" fy="50%">' +
  '<stop offset="0%" stop-color="#ffe066"/>' +
  '<stop offset="40%" stop-color="#ffe066" stop-opacity="0.6"/>' +
  '<stop offset="100%" stop-color="#0b0b0f" stop-opacity="1"/>' +
  '</radialGradient>' +
  '</defs>' +
  '<rect width="720" height="540" fill="#0b0b0f"/>' +
  '<rect width="720" height="540" fill="url(#sg)"/>' +
  '</svg>'
);

// ── 8. Film Frame ─────────────────────────────────────────────────────────────
// White center with thick black border + 8 evenly-spaced sprocket holes L & R.
// Border thickness = 52px on left/right (to fit sprockets), 36px top/bottom.
// Sprocket holes: 8 per side, white rects with rounded corners on black border.
const filmFrame = (function () {
  const borderLR = 52;  // left/right border thickness
  const borderTB = 36;  // top/bottom border thickness
  const holeW = 20;
  const holeH = 28;
  const holeCount = 8;
  const usableH = 540 - 2 * borderTB;
  const holeSpacing = usableH / holeCount;

  const holes = [];
  for (let i = 0; i < holeCount; i++) {
    const holeY = borderTB + i * holeSpacing + (holeSpacing - holeH) / 2;
    // Left side holes
    const leftX = (borderLR - holeW) / 2;
    holes.push(
      '<rect x="' + leftX + '" y="' + holeY + '" width="' + holeW + '" height="' + holeH + '" rx="3" fill="#ffffff"/>'
    );
    // Right side holes
    const rightX = 720 - borderLR + (borderLR - holeW) / 2;
    holes.push(
      '<rect x="' + rightX + '" y="' + holeY + '" width="' + holeW + '" height="' + holeH + '" rx="3" fill="#ffffff"/>'
    );
  }

  return svgUri(
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="540">' +
    // Black full background (border)
    '<rect width="720" height="540" fill="#111111"/>' +
    // White center
    '<rect x="' + borderLR + '" y="' + borderTB + '" width="' + (720 - 2 * borderLR) + '" height="' + (540 - 2 * borderTB) + '" fill="#ffffff"/>' +
    // Sprocket holes
    holes.join('') +
    '</svg>'
  );
})();

// ── Export ────────────────────────────────────────────────────────────────────

const BACKGROUNDS = [
  { id: 'blank-white', name: 'Blank White',      dataUri: blankWhite  },
  { id: 'blank-black', name: 'Blank Black',      dataUri: blankBlack  },
  { id: 'grid-light',  name: 'Grid (Light)',     dataUri: gridLight   },
  { id: 'grid-dots',   name: 'Dot Grid',         dataUri: gridDots    },
  { id: 'zoom-grid',   name: 'Zoom Grid Mockup', dataUri: zoomGrid    },
  { id: 'color-bars',  name: 'TV Color Bars',    dataUri: colorBars   },
  { id: 'spotlight',   name: 'Spotlight',        dataUri: spotlight   },
  { id: 'film-frame',  name: 'Film Frame',       dataUri: filmFrame   },
];

module.exports = {
  BACKGROUNDS,
  getById: function (id) {
    return BACKGROUNDS.find(function (b) { return b.id === id; });
  },
};
