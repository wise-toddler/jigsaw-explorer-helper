'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makePuzzle, CORE } = require('./fixture');
require('../src/core');
const fit = require('../src/fit');

test('findSlots merges the open sides that border the same empty spot', () => {
  const P = makePuzzle({ rows: 4, cols: 4 });
  P.join([1, 2, 5], 100, 100); // L: (0,0) (0,1) (1,0) → slot (1,1) touches two pieces
  const slots = fit.findSlots(P.pieces.filter((p) => p.group), CORE, CORE);
  const ids = slots.map((s) => s.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [3, 6, 9], 'slots for pieces 3, 6 and 9');
  assert.equal(slots.find((s) => s.id === 6).sides.length, 2, 'slot 6 is bordered from above and from the left');
});

test('rankCandidates puts the true piece first and rejects incompatible tabs', () => {
  const P = makePuzzle({ rows: 5, cols: 5, seed: 21 });
  const subj = P.subject.getContext().getImageData();
  const assembled = [1, 2, 3, 6, 7, 8, 11, 12, 13];
  P.join(assembled, 200, 200);
  const loose = P.pieces.filter((p) => !p.group);
  const slots = fit.findSlots(P.pieces.filter((p) => p.group), CORE, CORE);
  let firsts = 0;
  slots.forEach((slot) => {
    const ranked = fit.rankCandidates(slot, loose, subj, P.pz);
    ranked.forEach((r) => slot.sides.forEach((s) => {
      const sideName = ['top', 'right', 'bottom', 'left'][s.side], oppName = ['bottom', 'left', 'top', 'right'][s.side];
      assert.notEqual(r.piece.spec.edges[sideName].tab, s.piece.spec.edges[oppName].tab, 'tab meets hole');
    }));
    const rank = ranked.findIndex((r) => r.piece.id === slot.id);
    assert.ok(rank >= 0 && rank < 3, `true piece ${slot.id} ranked ${rank}`);
    if (rank === 0) firsts++;
  });
  assert.ok(firsts >= slots.length * 0.75, 'true piece is first for most slots');
});

test('fit.at pulls candidates beside the slot, dims the rest, toggle restores', () => {
  const P = makePuzzle({ rows: 5, cols: 5, seed: 4 }), { W, H } = P.install(1600, 1200);
  P.join([1, 2, 6, 7], 400, 400);
  P.scatter(W, H);
  const slot = fit.findSlots(P.pieces.filter((p) => p.group), CORE, CORE).find((s) => s.id === 3);
  const n = fit.at(slot.x + 5, slot.y - 5);
  assert.ok(n > 0 && n <= 8);
  const loose = P.pieces.filter((p) => !p.group), near = loose.filter((p) => p.opacity === 1), dim = loose.filter((p) => p.opacity < 1);
  assert.equal(near.length, n);
  assert.equal(dim.length, loose.length - n);
  near.forEach((p) => assert.ok(Math.hypot(p.position.x - slot.x, p.position.y - slot.y) < 4 * CORE, 'candidate sits next to the slot'));
  fit.toggle(); fit.toggle(); // on, then off → restore
  assert.ok(loose.every((p) => p.opacity === 1));
});
