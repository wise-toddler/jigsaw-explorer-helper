'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makePuzzle, rng, SIZE } = require('./fixture');
const sort = require('../src/core');
const U = sort.util;

const rect = (p) => ({ l: p.position.x - p.width / 2, r: p.position.x + p.width / 2, t: p.position.y - p.height / 2, b: p.position.y + p.height / 2 });
const overlaps = (a, b, slack = 0) => { const A = rect(a), B = rect(b); return A.l + slack < B.r && A.r - slack > B.l && A.t + slack < B.b && A.b - slack > B.t; };
const pairsOverlapping = (pieces, slack) => {
  let n = 0;
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) if (overlaps(pieces[i], pieces[j], slack)) n++;
  return n;
};

test('rgbToLab maps white/black to L=100/0 with no chroma', () => {
  const w = U.rgbToLab([255, 255, 255]), k = U.rgbToLab([0, 0, 0]);
  assert.ok(Math.abs(w[0] - 100) < 0.5 && Math.abs(w[1]) < 0.5 && Math.abs(w[2]) < 0.5);
  assert.ok(Math.abs(k[0]) < 0.5);
  assert.ok(U.rgbToLab([0, 0, 255])[2] < -50, 'blue has strongly negative b*');
});

test('orderByColor yields a smoother chain than the input order', () => {
  const rand = rng(7);
  const units = Array.from({ length: 40 }, () => ({ lab: U.rgbToLab([rand() * 255, rand() * 255, rand() * 255]) }));
  const cost = (arr) => arr.slice(1).reduce((s, u, i) => s + Math.sqrt(U.dist(arr[i], u)), 0);
  const ordered = U.orderByColor(units.slice());
  assert.equal(ordered.length, 40);
  assert.equal(new Set(ordered).size, 40, 'every unit exactly once');
  assert.ok(cost(ordered) < cost(units) * 0.5, 'chain cost at least halved');
  assert.deepEqual(U.orderByColor([]), [], 'empty input stays empty (deal on an already-assembled deck relies on it)');
});

test('kmeans separates three clearly distinct colours into pure piles', () => {
  const mk = (rgb, n) => Array.from({ length: n }, (_, i) => ({ lab: U.rgbToLab(rgb.map((v) => v + (i % 3))), tag: rgb.join() }));
  const units = mk([250, 250, 250], 10).concat(mk([20, 30, 200], 12), mk([30, 180, 40], 8));
  const piles = U.kmeans(units, 3);
  assert.equal(piles.length, 3);
  piles.forEach((p) => assert.equal(new Set(p.map((u) => u.tag)).size, 1, 'pile is pure'));
});

test('occupied marks cells per piece, so the notch of an L-shaped assembly stays free', () => {
  const { join, pieces } = makePuzzle({ rows: 3, cols: 3 });
  join([1, 4, 7, 8, 9], 100, 100); // left column + bottom row = L
  const o = U.occupied(pieces.filter((p) => p.group), 400, 400, SIZE, SIZE);
  const cellAt = (x, y) => o.grid[Math.floor(y / SIZE)][Math.floor(x / SIZE)];
  assert.ok(cellAt(100, 100) && cellAt(180, 180), 'assembly cells busy');
  assert.ok(!cellAt(180, 100), 'the notch inside the L (where piece 3 belongs) is free');
  const free = o.grid.flat().filter((v) => !v).length;
  assert.ok(free > o.rows * o.cols / 2, 'most of the table stays free');
});

test('subject reads the shared image once and caches it on the canvas', () => {
  const P = makePuzzle({ rows: 2, cols: 2 });
  let reads = 0;
  const canvas = P.subject, img = canvas.getContext().getImageData();
  canvas.getContext = () => ({ getImageData: () => { reads++; return img; } });
  assert.equal(U.subject(P.pieces[0]), U.subject(P.pieces[3]));
  assert.equal(reads, 1);
});

test('span: singles take one cell, groups span by their real size', () => {
  assert.deepEqual(U.span({ single: true, w: 500, h: 500 }, 50, 50, 20, 20), { cw: 1, ch: 1 });
  assert.deepEqual(U.span({ single: false, w: 96, h: 56 }, 56, 56, 20, 20), { cw: 2, ch: 1 });
  assert.deepEqual(U.span({ single: false, w: 96, h: 56 }, 34, 34, 20, 20), { cw: 3, ch: 2 });
});

test('collectUnits: largest group is the assembly, smaller groups become one unit each', () => {
  const P = makePuzzle({ rows: 4, cols: 4 });
  P.join([1, 2, 3, 5, 6, 7], 100, 100);
  const small = P.join([11, 12], 500, 500);
  const { units, mainGroup } = U.collectUnits(P.pz);
  assert.equal(mainGroup.members.length, 6);
  assert.equal(units.length, 1 + (16 - 6 - 2), 'one unit for the pair plus one per single');
  const pair = units.find((u) => !u.single);
  assert.deepEqual(pair.members, small.members);
  assert.ok(pair.w > pair.h, 'two side-by-side pieces span wider than tall');
});

test('gradient: loose pieces land on distinct free cells, assembly untouched', () => {
  const P = makePuzzle({ rows: 5, cols: 5, seed: 3 }), { W, H } = P.install(1200, 900);
  P.join([1, 2, 3, 6, 7, 8], 300, 300);
  P.scatter(W, H);
  const before = P.pieces.filter((p) => p.group).map((p) => ({ ...p.position }));
  const n = sort({ mode: 'gradient' });
  assert.equal(n, 19);
  P.pieces.filter((p) => p.group).forEach((p, i) => assert.deepEqual(p.position, before[i]));
  const loose = P.pieces.filter((p) => !p.group);
  assert.equal(pairsOverlapping(loose, 6), 0, 'no loose piece overlaps another');
  loose.forEach((p) => P.pieces.filter((q) => q.group).forEach((q) => assert.ok(!overlaps(p, q, 6), 'loose piece over assembly')));
});

test('piles: pieces sorted into colour bands', () => {
  const P = makePuzzle({ rows: 6, cols: 6, seed: 5 }), { W, H } = P.install(1600, 1200);
  P.scatter(W, H);
  assert.equal(sort({ mode: 'piles', k: 3 }), 36);
  const ys = [...new Set(P.pieces.map((p) => Math.round(p.position.y)))].sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > SIZE * 1.5);
  assert.ok(gaps.length >= 2, 'at least two gap rows separate the bands');
});

test('magnet: loose pieces gather beside the colour-matching side of the assembly', () => {
  const P = makePuzzle({ rows: 6, cols: 6, seed: 9 }), { W, H } = P.install(1600, 1200);
  P.join([1, 2, 3, 7, 8, 9, 13, 14, 15, 19, 20, 21, 25, 26, 27, 31, 32, 33], 400, 300); // left half assembled
  P.scatter(W, H);
  assert.equal(sort({ mode: 'magnet' }), 18);
  const loose = P.pieces.filter((p) => !p.group);
  const topY = loose.filter((p) => p.id <= 12).reduce((s, p) => s + p.position.y, 0) / 6;
  const botY = loose.filter((p) => p.id > 24).reduce((s, p) => s + p.position.y, 0) / 6;
  assert.ok(topY < botY, 'pieces from the top rows sit higher than those from the bottom rows');
  assert.equal(pairsOverlapping(loose, 6), 0);
});

test('stack then deal: decks are compact, dealing spreads only the picked deck', () => {
  const P = makePuzzle({ rows: 6, cols: 6, seed: 11 }), { W, H } = P.install(1600, 1200);
  P.scatter(W, H);
  assert.equal(sort({ mode: 'stack', k: 3 }), 36);
  const piles = new Set(P.pieces.map((p) => p._csPile));
  assert.equal(piles.size, 3);
  P.pieces.forEach((p) => {
    const mates = P.pieces.filter((q) => q._csPile === p._csPile);
    mates.forEach((q) => assert.ok(Math.abs(q.position.x - p.position.x) < 25 && Math.abs(q.position.y - p.position.y) < 25, 'deck is compact'));
  });
  const picked = P.pieces.find((p) => p._csPile === 1), others = P.pieces.filter((p) => p._csPile !== 1).map((p) => ({ ...p.position }));
  P.player.Piece.selectedPiece = picked;
  const dealt = sort({ mode: 'deal' });
  assert.equal(dealt, P.pieces.filter((p) => p._csPile === 1).length);
  assert.equal(pairsOverlapping(P.pieces.filter((p) => p._csPile === 1), 6), 0, 'dealt deck is spread out');
  P.pieces.filter((p) => p._csPile !== 1).forEach((p, i) => assert.deepEqual(p.position, others[i], 'other decks untouched'));
});
