// Fit mode: click an empty slot beside the assembly and the loose pieces or small groups that could go there
// are ranked by shape (tab/hole must be complementary) and boundary-colour continuity, then pulled next to it.
(function (root) {
  'use strict';
  if (root.jigexFit) return; // bookmarklet on top of the extension must not register listeners twice
  var TOP_N = 5, DIM = 0.35; // candidates pulled to a clicked slot; opacity of the rest
  var PER_SLOT = 3, RING = 2; // frontier: candidates kept per slot; keep-out ring (in cells) around the assembly
  var NEAR = 3, NEAR_SLOTS = 5; // assembly click: slots within NEAR pitches of the click, at most NEAR_SLOTS of them
  var STRIP_N = 12, INSET = 2; // samples per edge strip; px inside the core edge they are taken from
  var SIDES = ['top', 'right', 'bottom', 'left'], OPP = [2, 3, 0, 1];

  function util() { return root.jigexColorSort.util; }

  // STRIP_N Lab samples along one side of a piece's core, just inside the edge, top→bottom or left→right.
  function edgeStrip(piece, side, subj) {
    var s = piece.spec, bb = s.image.bounds, core = s.core, out = [], toLab = util().rgbToLab;
    var x0 = bb.x + core.x, y0 = bb.y + core.y, w = core.width, h = core.height;
    for (var i = 0; i < STRIP_N; i++) {
      var t = (i + 0.5) / STRIP_N, x, y;
      if (side === 0) { x = x0 + t * w; y = y0 + INSET; }
      else if (side === 2) { x = x0 + t * w; y = y0 + h - 1 - INSET; }
      else if (side === 3) { x = x0 + INSET; y = y0 + t * h; }
      else { x = x0 + w - 1 - INSET; y = y0 + t * h; }
      var k = (Math.floor(y) * subj.width + Math.floor(x)) * 4;
      out.push(toLab([subj.data[k], subj.data[k + 1], subj.data[k + 2]]));
    }
    return out;
  }

  // RMS Lab distance between two strips of equal length.
  function stripDist(a, b) {
    var d = 0, dist = util().dist;
    for (var i = 0; i < a.length; i++) d += dist({ lab: a[i] }, { lab: b[i] });
    return Math.sqrt(d / a.length);
  }

  // Centre of a piece's core (neighbouring cores are exactly one pitch apart; image centres are not).
  function coreCentre(p) {
    var bb = p.spec.image.bounds, c = p.spec.core;
    return { x: p.position.x + c.x + c.width / 2 - bb.width / 2, y: p.position.y + c.y + c.height / 2 - bb.height / 2 };
  }

  // Empty slots next to the assembly: one per open side, merged when several pieces border the same slot.
  function findSlots(main, pitchW, pitchH) {
    var slots = [], dirs = util().DIRS;
    main.forEach(function (p) {
      var cc = coreCentre(p);
      (p.neighbors || []).forEach(function (n, k) {
        if (!n || n.group === p.group) return;
        var x = cc.x + dirs[k][0] * pitchW, y = cc.y + dirs[k][1] * pitchH, slot = null;
        for (var i = 0; i < slots.length; i++)
          if (Math.abs(slots[i].x - x) < pitchW / 3 && Math.abs(slots[i].y - y) < pitchH / 3) { slot = slots[i]; break; }
        // id is the true neighbour's id: used only to tell whether the slot lies on the puzzle border.
        if (!slot) { slot = { x: x, y: y, sides: [], id: n.id }; slots.push(slot); }
        slot.sides.push({ side: OPP[k], piece: p }); // p sits on side OPP[k] of the slot
      });
    });
    return slots;
  }

  // Grid step from point a to point b in piece pitches, as a "dx,dy" key.
  function stepKey(a, b, pitchW, pitchH) {
    return Math.round((b.x - a.x) / pitchW) + ',' + Math.round((b.y - a.y) / pitchH);
  }

  // Units (single pieces or small groups) that could sit in `slot`, best first. A group is tried with each
  // member as the piece going into the slot; the rest of the group must then land on squares the assembly
  // does not occupy. Shape filtering only applies when pieces cannot rotate.
  function rankCandidates(slot, units, subj, pz, main) {
    var cols = pz.pieces.numCols, rows = pz.pieces.numRows;
    var row = Math.floor((slot.id - 1) / cols), col = (slot.id - 1) % cols;
    var border = [row === 0, col === cols - 1, row === rows - 1, col === 0];
    var strips = slot.sides.map(function (s) { return { side: s.side, strip: edgeStrip(s.piece, OPP[s.side], subj), tab: s.piece.spec.edges[SIDES[OPP[s.side]]].tab }; });
    var pitchW = main[0].spec.core.width, pitchH = main[0].spec.core.height, taken = {};
    main.forEach(function (p) { taken[stepKey(slot, coreCentre(p), pitchW, pitchH)] = true; });
    var ranked = [];
    units.forEach(function (unit) {
      var best = null;
      unit.members.forEach(function (p) {
        var e = p.spec.edges, ok = true, score = 0, ca = coreCentre(p);
        if (!pz.rotatable) {
          for (var k = 0; k < 4 && ok; k++) ok = e[SIDES[k]].border === border[k];
          strips.forEach(function (s) { if (ok && e[SIDES[s.side]].tab === s.tab) ok = false; });
        }
        unit.members.forEach(function (m) { if (ok && m !== p && taken[stepKey(ca, coreCentre(m), pitchW, pitchH)]) ok = false; });
        if (!ok) return;
        strips.forEach(function (s) { score += stripDist(s.strip, edgeStrip(p, s.side, subj)); });
        score /= strips.length;
        if (!best || score < best.score) best = { unit: unit, piece: p, score: score };
      });
      if (best) ranked.push(best);
    });
    return ranked.sort(function (a, b) { return a.score - b.score; });
  }

  var dimmed = [], active = false, btn = null, snapped = false, lastSlots = 0, lastSnaps = 0, lastFail = '';

  // Remember why the last click did nothing, so the button can say so instead of a generic hint.
  function fail(msg) { lastFail = msg; console.warn('jigexFit: ' + msg); }

  function restore() {
    dimmed.forEach(function (p) { if (!p.isDisposed) p.opacity = 1; });
    dimmed = [];
  }

  // Puzzle, assembly, movable units and layout cell size shared by the two fit entry points; null if not ready.
  function scene() {
    var u = util(), pz = u.getPuzzle();
    if (!pz || !pz.isReady()) return null;
    var all = u.pieces(pz), c = u.collectUnits(pz);
    if (!c.mainGroup) { fail('Join 2 pieces first'); return null; }
    var main = c.mainGroup.members, core = main[0].spec.core, canvas = document.getElementById('jigex-canvas');
    // movable = every piece outside the assembly; units = the same pieces as singles / small groups (candidates)
    var movable = all.filter(function (p) { return p.group !== c.mainGroup && p.state && p.state.name === 'resting'; });
    if (!movable.length) { fail('No loose pieces left'); return null; }
    return { u: u, pz: pz, all: all, main: main, movable: movable, units: c.units, subj: c.subj, W: canvas.width, H: canvas.height,
      slots: findSlots(main, core.width, core.height), pitch: core.width,
      cellW: Math.max.apply(null, movable.map(function (p) { return p.width; })) + u.CELL_PAD,
      cellH: Math.max.apply(null, movable.map(function (p) { return p.height; })) + u.CELL_PAD };
  }

  // Centre of a unit's bounding box on the table (dx/dy is the first member's offset from it).
  function unitCentre(u) {
    return { x: u.members[0].position.x - u.dx, y: u.members[0].position.y - u.dy };
  }

  // Put a unit on the cell it was assigned. Moves are instant: an animated move can stall mid-tween while
  // the game is idle, leaving the piece behind.
  function settle(u) {
    u.members[0].move(u.cell.x + u.dx, u.cell.y + u.dy);
  }

  // Move each candidate unit to the free block nearest its slot (claimed in grid `o`); returns the space taken.
  function pullToSlots(sc, picks, o) {
    var taken = [];
    picks.forEach(function (k) {
      var unit = k.unit;
      if (!sc.u.nearestCell(unit, [{ x: k.slot.x, y: k.slot.y }], o, sc.cellW, sc.cellH)) return;
      unit.members[0].raise();
      settle(unit);
      taken.push({ position: unit.cell, width: unit.w + sc.u.CELL_PAD, height: unit.h + sc.u.CELL_PAD });
    });
    return taken;
  }

  // Move every non-candidate unit that overlaps one of the `taken` blocks to the nearest cell that is free of
  // the assembly, the candidates and every other piece.
  function evict(sc, candidates, taken) {
    var hit = function (u) {
      var c = unitCentre(u);
      return taken.some(function (t) {
        return Math.abs(c.x - t.position.x) < (u.w + t.width) / 2 && Math.abs(c.y - t.position.y) < (u.h + t.height) / 2;
      });
    };
    var victims = sc.units.filter(function (u) { return candidates.indexOf(u) < 0 && hit(u); });
    if (!victims.length) return;
    var stay = sc.all.filter(function (p) { return !victims.some(function (u) { return u.members.indexOf(p) >= 0; }); });
    var o = sc.u.occupied(stay.concat(taken), sc.W, sc.H, sc.cellW, sc.cellH);
    victims.forEach(function (u) {
      if (sc.u.nearestCell(u, [unitCentre(u)], o, sc.cellW, sc.cellH)) settle(u);
    });
  }

  function dimExcept(movable, keep) {
    movable.forEach(function (p) { if (keep.indexOf(p) < 0) { p.opacity = DIM; dimmed.push(p); } });
  }

  function membersOf(units) {
    return units.reduce(function (a, u) { return a.concat(u.members); }, []);
  }

  // Put the candidate's entry piece exactly on the slot and let the player's own drop() decide: it only
  // joins a true neighbour within snap distance. A wrong guess is moved back to where it was.
  function trySnap(sc, cand, slot) {
    var p = cand.piece, first = cand.unit.members[0], cc = coreCentre(p), fx = first.position.x, fy = first.position.y;
    first.raise();
    first.move(fx + slot.x - cc.x, fy + slot.y - cc.y);
    if (p.drop) p.drop(false);
    if (p.group && p.group === sc.main[0].group) return true;
    first.move(fx, fy);
    return false;
  }

  // Rank candidates for the slot nearest to canvas point (x, y). Each of the best few is tried on the slot in
  // turn and snapped in if it really fits (unless opts.snap === false); otherwise they are pulled next to the
  // slot and the rest dimmed.
  function fitAt(x, y, opts) {
    var sc = scene();
    if (!sc) return 0;
    var slot = null, bd = Infinity;
    sc.slots.forEach(function (s) {
      var d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bd) { bd = d; slot = s; }
    });
    if (!slot || bd > sc.pitch * sc.pitch) { fail('Click right next to a gap'); return 0; }
    var top = rankCandidates(slot, sc.units, sc.subj, sc.pz, sc.main).slice(0, TOP_N);
    snapped = !(opts && opts.snap === false) && top.some(function (cand) { return trySnap(sc, cand, slot); });
    if (snapped) { // keep going from the filled slot: every snap opens new slots, so the fill spreads by itself
      var n = frontier(slot.x, slot.y, opts);
      lastSnaps++; snapped = true;
      return n;
    }
    var topUnits = top.map(function (r) { return r.unit; }), chosen = membersOf(topUnits);
    restore();
    // Only the assembly blocks candidate cells (on a crowded table the nearest truly free cell can be far away);
    // whatever was sitting in those cells is evicted to the nearest free spot so nothing ends up overlapping.
    var o = sc.u.occupied(sc.main, sc.W, sc.H, sc.cellW, sc.cellH);
    var taken = pullToSlots(sc, top.map(function (r) { return { unit: r.unit, slot: slot }; }), o);
    evict(sc, topUnits, taken);
    dimExcept(sc.movable, chosen);
    return top.length;
  }

  // Open slots within NEAR pitches of any of `pts` (nearest first, at most NEAR_SLOTS); all slots when pts is null.
  function slotsNear(sc, pts) {
    if (!pts) return sc.slots;
    var d = function (s) { var m = Infinity; pts.forEach(function (p) { m = Math.min(m, Math.hypot(s.x - p.x, s.y - p.y)); }); return m; };
    var byDist = sc.slots.slice().sort(function (a, b) { return d(a) - d(b); });
    var near = byDist.filter(function (s) { return d(s) <= NEAR * sc.pitch; }).slice(0, NEAR_SLOTS);
    return near.length ? near : byDist.slice(0, 1);
  }

  // Frontier: around the click (or the whole rim when called without a point) keep dropping the best
  // candidates onto the open slots for as long as the player snaps one in — each snap opens new slots next
  // to it, so the fill spreads out from the click. Whatever is left is pulled to the rim, the rest parked.
  function frontier(x, y, opts) {
    var pts = typeof x === 'number' ? [{ x: x, y: y }] : null, sc, slots, snaps = 0;
    for (var round = 0; round < 1000; round++) {
      sc = scene();
      if (!sc) return 0;
      slots = slotsNear(sc, pts);
      if (opts && opts.snap === false) break;
      var hit = null;
      slots.some(function (slot) {
        return rankCandidates(slot, sc.units, sc.subj, sc.pz, sc.main).slice(0, PER_SLOT).some(function (cand) {
          if (trySnap(sc, cand, slot)) { hit = cand; return true; }
          return false;
        });
      });
      if (!hit) break;
      snaps++;
      if (pts) pts.push(coreCentre(hit.piece));
    }
    snapped = snaps > 0; lastSnaps = snaps; lastSlots = slots.length;
    var best = new Map();
    slots.forEach(function (slot) {
      rankCandidates(slot, sc.units, sc.subj, sc.pz, sc.main).slice(0, PER_SLOT).forEach(function (r) {
        var cur = best.get(r.unit);
        if (!cur || r.score < cur.score) best.set(r.unit, { unit: r.unit, slot: slot, score: r.score });
      });
    });
    var picks = Array.from(best.values()).sort(function (a, b) { return a.score - b.score; });
    var chosen = membersOf(picks.map(function (k) { return k.unit; }));
    restore();
    var o = sc.u.occupied(sc.main, sc.W, sc.H, sc.cellW, sc.cellH);
    var taken = pullToSlots(sc, picks, o);
    // Keep-out zone: the assembly's box grown by RING cells, plus the cells the candidates now occupy.
    var b = sc.u.bbox(sc.main), fence = { position: { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 },
      width: b.r - b.l + 2 * RING * sc.cellW, height: b.b - b.t + 2 * RING * sc.cellH };
    var obstacles = [fence].concat(taken);
    // Everything else — singles and small groups alike — is parked outside the ring as a gradient.
    var rest = sc.units.filter(function (unit) { return !best.has(unit); });
    if (rest.length) {
      rest = sc.u.orderByColor(rest);
      var scales = [1, 0.85, 0.7, 0.6];
      for (var i = 0; i < scales.length; i++)
        if (sc.u.layout(rest, sc.W, sc.H, obstacles, sc.cellW * scales[i], sc.cellH * scales[i], 0) === rest.length) break;
      rest.forEach(function (unit) { if (unit.cell) settle(unit); });
    }
    dimExcept(sc.movable, chosen);
    return picks.length;
  }

  function onPointer(e) {
    if (!active || e.button || (e.target && e.target.closest && e.target.closest('#jigex-colorsort'))) return; // toolbar clicks are not slot clicks
    var canvas = document.getElementById('jigex-canvas'), r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) * canvas.width / r.width, y = (e.clientY - r.top) * canvas.height / r.height;
    e.preventDefault(); e.stopImmediatePropagation();
    // A click near an open slot is a slot click even if it lands on a neighbour's tab; only a click on a
    // piece's core (body without tabs) counts as clicking the assembly.
    var sc = scene(), nearSlot = !!sc && sc.slots.some(function (s) { return Math.hypot(s.x - x, s.y - y) <= sc.pitch; });
    var onAssembly = !!sc && !nearSlot && sc.main.some(function (p) {
      var cc = coreCentre(p), core = p.spec.core;
      return Math.abs(cc.x - x) < core.width / 2 && Math.abs(cc.y - y) < core.height / 2;
    });
    snapped = false; lastSnaps = 0; lastFail = '';
    var n = onAssembly ? frontier(x, y) : fitAt(x, y);
    if (!btn) return;
    var rest = n ? n + ' candidates' + (onAssembly ? ' for ' + lastSlots + ' gaps' : '') : '';
    btn.textContent = snapped ? '✅ ' + lastSnaps + ' snapped' + (rest ? ', ' + rest : '') + ' (Esc)'
      : n ? '🎯 ' + rest + ' (Esc)' : '🎯 ' + (lastFail || 'Click a gap or the assembly');
  }

  function setActive(on, button) {
    active = on; btn = button || btn;
    if (!on) restore();
    if (btn) { btn.textContent = on ? '🎯 Click a gap or the assembly… (Esc)' : '🎯 Fit'; btn.style.background = on ? '#c0392b' : (btn.dataset && btn.dataset.bg) || ''; }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && active) setActive(false); }, true);
  }

  root.jigexFit = { at: fitAt, frontier: frontier, toggle: function (button) { setActive(!active, button); }, active: function () { return active; },
    findSlots: findSlots, rankCandidates: rankCandidates, edgeStrip: edgeStrip, coreCentre: coreCentre };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.jigexFit;
})(typeof window !== 'undefined' ? window : globalThis);
