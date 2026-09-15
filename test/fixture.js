// Synthetic Jigsaw Explorer puzzle: a smooth-colour subject image cut into a rows×cols grid of fake pieces
// with the same fields the real player exposes (spec.image.bounds, spec.core, spec.edges, neighbors, group…).
'use strict';

const MARGIN = 8, CORE = 40, SIZE = CORE + 2 * MARGIN;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Smoothly varying colours so neighbouring edges match and far-apart pieces differ.
function subjectImage(w, h, palette) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, c = palette(x / w, y / h);
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  const img = { width: w, height: h, data };
  img.getContext = () => ({ getImageData: () => img });
  return img;
}

function defaultPalette(u, v) {
  return [200 * u + 30, 200 * (1 - v) + 30, 128 + 100 * Math.sin(u * 9) * Math.cos(v * 7)];
}

function makePuzzle(opts = {}) {
  const rows = opts.rows || 4, cols = opts.cols || 4, rand = rng(opts.seed || 1);
  const subject = subjectImage(cols * CORE + 2 * MARGIN, rows * CORE + 2 * MARGIN, opts.palette || defaultPalette);
  const pieces = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const id = r * cols + c + 1;
    const edges = {
      top: { tab: false, border: r === 0 }, left: { tab: false, border: c === 0 },
      right: { tab: rand() < 0.5, border: c === cols - 1 }, bottom: { tab: rand() < 0.5, border: r === rows - 1 }
    };
    const piece = {
      id, isDisposed: false, isEdge: r === 0 || c === 0 || r === rows - 1 || c === cols - 1,
      width: SIZE, height: SIZE, angle: 0, opacity: 1, group: null, state: { name: 'resting' },
      position: { x: 0, y: 0 }, neighbors: [null, null, null, null],
      spec: { id, core: { x: MARGIN, y: MARGIN, width: CORE, height: CORE }, edges,
        image: { bounds: { x: c * CORE, y: r * CORE, width: SIZE, height: SIZE, margin: MARGIN }, data: subject } },
      raise() {},
      move(x, y) {
        const dx = x - this.position.x, dy = y - this.position.y;
        (this.group ? this.group.members : [this]).forEach((p) => { p.position.x += dx; p.position.y += dy; });
      }
    };
    piece.spec.piece = piece;
    pieces.push(piece);
  }
  const at = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols) ? null : pieces[r * cols + c];
  pieces.forEach((p, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    p.neighbors = [at(r - 1, c), at(r, c + 1), at(r + 1, c), at(r, c - 1)];
    if (p.neighbors[0]) p.spec.edges.top.tab = !p.neighbors[0].spec.edges.bottom.tab;
    if (p.neighbors[3]) p.spec.edges.left.tab = !p.neighbors[3].spec.edges.right.tab;
  });
  const pz = {
    pieces: { specList: pieces.map((p) => p.spec), numRows: rows, numCols: cols, length: pieces.length },
    rotatable: false, isReady: () => true, state: { name: 'playing' }
  };
  // Join pieces (by id) into one group laid out at their true relative positions from (x, y).
  const join = (ids, x = 0, y = 0) => {
    const members = ids.map((id) => pieces[id - 1]), group = { members };
    members.forEach((p) => {
      const r = Math.floor((p.id - 1) / cols), c = (p.id - 1) % cols;
      p.group = null; p.move(x + c * CORE, y + r * CORE); p.group = group;
    });
    return group;
  };
  const scatter = (w, h) => pieces.forEach((p) => { if (!p.group) p.move(rand() * w, rand() * h); });
  const player = { Puzzle: { curr: pz }, Piece: { selectedPiece: null, capturedList: [] } };
  const install = (w = 1600, h = 1200) => {
    globalThis.jigexGlobals = { modules: { player } };
    globalThis.document = { getElementById: () => ({ width: w, height: h }) };
    return { W: w, H: h };
  };
  return { pz, pieces, subject, join, scatter, install, player, at, CORE, SIZE, rows, cols };
}

module.exports = { makePuzzle, CORE, SIZE, MARGIN };
