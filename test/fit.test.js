'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makePuzzle, CORE } = require('./fixture');
const sort = require('../src/core');
const fit = require('../src/fit');
const { CELL_PAD } = sort.util;
const unitsOf = (P) => sort.util.collectUnits(P.pz).units;
const mainOf = (P) => P.pieces.filter((p) => p.group && p.group === sort.util.mainGroup(P.pieces));

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
  const units = unitsOf(P), main = mainOf(P);
  const slots = fit.findSlots(main, CORE, CORE);
  let firsts = 0;
  slots.forEach((slot) => {
    const ranked = fit.rankCandidates(slot, units, subj, P.pz, main);
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

test('rankCandidates accepts a small group through the member that fits, never through one that collides', () => {
  const P = makePuzzle({ rows: 5, cols: 5, seed: 21 });
  const subj = P.subject.getContext().getImageData();
  P.join([1, 2, 3, 6, 7, 8, 11, 12, 13], 200, 200);
  const pair = P.join([4, 5], 900, 900); // true home: right of piece 3, top row
  const units = unitsOf(P), main = mainOf(P);
  const slot4 = fit.findSlots(main, CORE, CORE).find((s) => s.id === 4);
  const ids = (r) => r.unit.members.map((m) => m.id);
  const ranked = fit.rankCandidates(slot4, units, subj, P.pz, main);
  assert.deepEqual(ids(ranked[0]), [4, 5], 'the pair is the best candidate for slot 4');
  assert.equal(ranked[0].piece.id, 4, 'entered through member 4: with 5 in the slot, 4 would land on assembled piece 3');
  const slot9 = fit.findSlots(main, CORE, CORE).find((s) => s.id === 9);
  const viaPair = fit.rankCandidates(slot9, units, subj, P.pz, main).find((r) => ids(r).length === 2);
  assert.equal(viaPair, undefined, 'slot 9 is interior: both members carry a border edge, so the pair is never offered');
});

test('frontier gathers candidates for every slot at the rim and parks the rest outside the ring', () => {
  const P = makePuzzle({ rows: 6, cols: 6, seed: 8 }), { W, H } = P.install(2400, 1800);
  const mainGroup = P.join([8, 9, 10, 14, 15, 16, 20, 21, 22], 1000, 800); // 3×3 block in the middle of the table
  const pair = P.join([35, 36], 1000, 800); // a small joined group right next to the assembly
  P.scatter(W, H);
  const n = fit.frontier();
  const movable = P.pieces.filter((p) => p.group !== mainGroup), near = movable.filter((p) => p.opacity === 1), far = movable.filter((p) => p.opacity < 1);
  assert.equal(near.length, n);
  assert.ok(n >= 12 && n <= 36, `one to three candidates per slot, got ${n}`);
  assert.equal(far.length, movable.length - n);
  pair.members.forEach((p) => assert.ok(far.includes(p), 'small group is dimmed and parked too'));
  const cx = 1000 + CORE, cy = 800 + CORE, cell = near[0].width + CELL_PAD;
  const dist = (p) => Math.max(Math.abs(p.position.x - cx), Math.abs(p.position.y - cy));
  near.forEach((p) => assert.ok(dist(p) < 1.5 * CORE + 3 * cell, 'candidate hugs the assembly'));
  far.forEach((p) => assert.ok(dist(p) > 1.5 * CORE + 2 * cell, 'parked piece is outside the keep-out ring'));
  const touching = (a, b) => Math.abs(a.position.x - b.position.x) < a.width - 6 && Math.abs(a.position.y - b.position.y) < a.height - 6;
  far.forEach((p) => near.forEach((q) => assert.ok(!touching(p, q), 'parked piece never lands on a candidate')));
});

test('fit.at snaps the best candidate in when it truly fits, and never joins a wrong one', () => {
  const P = makePuzzle({ rows: 5, cols: 5, seed: 4 }), { W, H } = P.install(1600, 1200);
  const mainGroup = P.join([1, 2, 6, 7], 400, 400);
  P.scatter(W, H);
  const slot = fit.findSlots(mainGroup.members, CORE, CORE).find((s) => s.id === 3);
  const before = P.pieces.filter((p) => !p.group).map((p) => ({ p, x: p.position.x, y: p.position.y }));
  assert.equal(fit.at(slot.x, slot.y), 1);
  const three = P.pieces[2];
  assert.equal(three.group, mainGroup, 'piece 3 joined the assembly');
  assert.ok(Math.abs(three.position.x - (400 + 2 * CORE)) < 1 && Math.abs(three.position.y - 400) < 1, 'sitting exactly right of piece 2');
  assert.ok(P.pieces.filter((p) => !p.group).every((p) => p.opacity === 1), 'nothing left dimmed after a snap');
  before.filter((b) => b.p !== three).forEach((b) => assert.deepEqual(b.p.position, { x: b.x, y: b.y }, 'candidates tried before the right one went back where they were'));
  // A wrong piece dropped on a slot stays loose: the fixture drop() (like the player's) only joins true neighbours.
  const wrong = P.pieces[20], slot8 = fit.findSlots(mainGroup.members, CORE, CORE).find((s) => s.id === 8);
  wrong.move(slot8.x, slot8.y); wrong.drop();
  assert.equal(wrong.group, null);
});

test('fit.at pulls candidates beside the slot, dims the rest, toggle restores', () => {
  const P = makePuzzle({ rows: 5, cols: 5, seed: 4 }), { W, H } = P.install(1600, 1200);
  P.join([1, 2, 6, 7], 400, 400);
  const slot = fit.findSlots(P.pieces.filter((p) => p.group), CORE, CORE).find((s) => s.id === 3);
  // Crowded table like a big sorted puzzle: non-candidates fill the cells nearest the slot, the real candidates
  // sit far away, so a naive "nearest free cell" would send them somewhere else entirely.
  const loose = P.pieces.filter((p) => !p.group), cell = loose[0].width + CELL_PAD, cells = [];
  for (let r = 0; r < Math.floor(H / cell); r++) for (let c = 0; c < Math.floor(W / cell); c++) cells.push({ x: (c + 0.5) * cell, y: (r + 0.5) * cell });
  const onAssembly = (q) => P.pieces.some((p) => p.group && Math.abs(p.position.x - q.x) < p.width && Math.abs(p.position.y - q.y) < p.height);
  const free = cells.filter((q) => !onAssembly(q)).sort((a, b) => Math.hypot(a.x - slot.x, a.y - slot.y) - Math.hypot(b.x - slot.x, b.y - slot.y));
  const subj = P.subject.getContext().getImageData();
  const cands = fit.rankCandidates(slot, unitsOf(P), subj, P.pz, mainOf(P)).slice(0, 8).map((r) => r.piece);
  loose.filter((p) => !cands.includes(p)).forEach((p, i) => p.move(free[i].x, free[i].y));
  cands.forEach((p, i) => p.move(free[free.length - 1 - i].x, free[free.length - 1 - i].y));
  const n = fit.at(slot.x + 5, slot.y - 5, { snap: false });
  assert.ok(n > 0 && n <= 8);
  const near = loose.filter((p) => p.opacity === 1), dim = loose.filter((p) => p.opacity < 1);
  assert.equal(near.length, n);
  assert.equal(dim.length, loose.length - n);
  near.forEach((p) => assert.ok(Math.hypot(p.position.x - slot.x, p.position.y - slot.y) < 2.5 * cell, 'candidate sits right beside the slot even on a full table'));
  const touching = (a, b) => Math.abs(a.position.x - b.position.x) < a.width - 6 && Math.abs(a.position.y - b.position.y) < a.height - 6;
  near.forEach((p) => dim.forEach((q) => assert.ok(!touching(p, q), 'pieces that were in the way got evicted, no overlap left')));
  fit.toggle(); fit.toggle(); // on, then off → restore
  assert.ok(loose.every((p) => p.opacity === 1));
});
