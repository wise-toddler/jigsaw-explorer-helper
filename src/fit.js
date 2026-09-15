// Fit mode: click an empty slot beside the assembly and the loose pieces that could go there are
// ranked by shape (tab/hole must be complementary) and boundary-colour continuity, then pulled next to it.
(function (root) {
  'use strict';
  var TOP_N = 8, DIM = 0.35; // candidates pulled to a clicked slot; opacity of the rest
  var PER_SLOT = 3, RING = 2; // frontier: candidates kept per slot; keep-out ring (in cells) around the assembly
  var STRIP_N = 12, INSET = 2; // samples per edge strip; px inside the core edge they are taken from
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]], SIDES = ['top', 'right', 'bottom', 'left'], OPP = [2, 3, 0, 1];

  function util() { return root.jigexColorSort.util; }

  // Lab samples along one side of a piece's core, just inside the edge, top→bottom or left→right.
  function edgeStrip(piece, side, subj, n) {
    var s = piece.spec, bb = s.image.bounds, core = s.core, out = [], toLab = util().rgbToLab;
    var x0 = bb.x + core.x, y0 = bb.y + core.y, w = core.width, h = core.height;
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n, x, y;
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
    var slots = [];
    main.forEach(function (p) {
      var cc = coreCentre(p);
      (p.neighbors || []).forEach(function (n, k) {
        if (!n || n.group === p.group) return;
        var x = cc.x + DIRS[k][0] * pitchW, y = cc.y + DIRS[k][1] * pitchH, slot = null;
        for (var i = 0; i < slots.length; i++)
          if (Math.abs(slots[i].x - x) < pitchW / 3 && Math.abs(slots[i].y - y) < pitchH / 3) { slot = slots[i]; break; }
        // id is the true neighbour's id: used only to tell whether the slot lies on the puzzle border.
        if (!slot) { slot = { x: x, y: y, sides: [], id: n.id }; slots.push(slot); }
        slot.sides.push({ side: OPP[k], piece: p }); // p sits on side OPP[k] of the slot
      });
    });
    return slots;
  }

  // Loose pieces that could sit in `slot`, best first. Shape filtering only applies when pieces cannot rotate.
  function rankCandidates(slot, loose, subj, pz) {
    var cols = pz.pieces.numCols, rows = pz.pieces.numRows;
    var row = Math.floor((slot.id - 1) / cols), col = (slot.id - 1) % cols;
    var border = [row === 0, col === cols - 1, row === rows - 1, col === 0];
    var strips = slot.sides.map(function (s) { return { side: s.side, strip: edgeStrip(s.piece, OPP[s.side], subj, STRIP_N), tab: s.piece.spec.edges[SIDES[OPP[s.side]]].tab }; });
    var ranked = [];
    loose.forEach(function (p) {
      var e = p.spec.edges, ok = true, score = 0;
      if (!pz.rotatable) {
        for (var k = 0; k < 4 && ok; k++) ok = e[SIDES[k]].border === border[k];
        strips.forEach(function (s) { if (ok && e[SIDES[s.side]].tab === s.tab) ok = false; });
      }
      if (!ok) return;
      strips.forEach(function (s) { score += stripDist(s.strip, edgeStrip(p, s.side, subj, STRIP_N)); });
      ranked.push({ piece: p, score: score / strips.length });
    });
    return ranked.sort(function (a, b) { return a.score - b.score; });
  }

  var dimmed = [], active = false, btn = null;

  function restore() {
    dimmed.forEach(function (p) { if (!p.isDisposed) p.opacity = 1; });
    dimmed = [];
  }

  // Puzzle, assembly, loose singles and layout cell size shared by the two fit entry points; null if not ready.
  function scene() {
    var u = util(), pz = u.getPuzzle();
    if (!pz || !pz.isReady()) return null;
    var all = u.pieces(pz), mainGroup = u.mainGroup(all);
    if (!mainGroup) { console.warn('jigexFit: nothing assembled yet'); return null; }
    var main = mainGroup.members, core = main[0].spec.core, canvas = document.getElementById('jigex-canvas');
    // movable = everything outside the assembly (small groups included); loose = the singles that can be candidates
    var movable = all.filter(function (p) { return p.group !== mainGroup && p.state && p.state.name === 'resting'; });
    var loose = movable.filter(function (p) { return !p.group; });
    return { u: u, pz: pz, all: all, main: main, movable: movable, loose: loose, subj: u.subject(main[0]), W: canvas.width, H: canvas.height,
      slots: findSlots(main, core.width, core.height), pitch: core.width,
      cellW: Math.max.apply(null, loose.map(function (p) { return p.width; })) + u.CELL_PAD,
      cellH: Math.max.apply(null, loose.map(function (p) { return p.height; })) + u.CELL_PAD };
  }

  // Move each candidate piece to the free cell nearest its slot (claimed in grid `o`); returns the cells taken.
  // Moves are instant: an animated move can stall mid-tween while the game is idle, leaving the piece behind.
  function pullToSlots(sc, picks, o) {
    var taken = [];
    picks.forEach(function (k) {
      var unit = sc.u.makeUnit([k.piece], sc.subj);
      if (!sc.u.nearestCell(unit, [{ x: k.slot.x, y: k.slot.y }], o, sc.cellW, sc.cellH)) return;
      k.piece.raise();
      k.piece.move(unit.cell.x, unit.cell.y);
      taken.push({ position: unit.cell, width: sc.cellW, height: sc.cellH });
    });
    return taken;
  }

  function dimExcept(loose, keep) {
    loose.forEach(function (p) { if (keep.indexOf(p) < 0) { p.opacity = DIM; dimmed.push(p); } });
  }

  // Rank pieces for the slot nearest to canvas point (x, y); pull the best next to it and dim the rest.
  function fitAt(x, y) {
    var sc = scene();
    if (!sc) return 0;
    var slot = null, bd = Infinity;
    sc.slots.forEach(function (s) {
      var d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bd) { bd = d; slot = s; }
    });
    if (!slot || bd > sc.pitch * sc.pitch) { console.warn('jigexFit: click an empty spot right next to the assembly'); return 0; }
    var top = rankCandidates(slot, sc.loose, sc.subj, sc.pz).slice(0, TOP_N).map(function (r) { return r.piece; });
    restore();
    var o = sc.u.occupied(sc.all.filter(function (p) { return top.indexOf(p) < 0; }), sc.W, sc.H, sc.cellW, sc.cellH);
    pullToSlots(sc, top.map(function (p) { return { piece: p, slot: slot }; }), o);
    dimExcept(sc.movable, top);
    return top.length;
  }

  // Frontier: for every open slot around the assembly pull its best PER_SLOT candidates to the rim,
  // and park every other loose piece (as a gradient) outside a keep-out ring around the assembly.
  function frontier() {
    var sc = scene();
    if (!sc) return 0;
    var best = new Map();
    sc.slots.forEach(function (slot) {
      rankCandidates(slot, sc.loose, sc.subj, sc.pz).slice(0, PER_SLOT).forEach(function (r) {
        var cur = best.get(r.piece);
        if (!cur || r.score < cur.score) best.set(r.piece, { piece: r.piece, slot: slot, score: r.score });
      });
    });
    var picks = Array.from(best.values()).sort(function (a, b) { return a.score - b.score; });
    var chosen = picks.map(function (k) { return k.piece; });
    restore();
    var o = sc.u.occupied(sc.main, sc.W, sc.H, sc.cellW, sc.cellH);
    var taken = pullToSlots(sc, picks, o);
    // Keep-out zone: the assembly's box grown by RING cells, plus the cells the candidates now occupy.
    var b = sc.u.bbox(sc.main), fence = { position: { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 },
      width: b.r - b.l + 2 * RING * sc.cellW, height: b.b - b.t + 2 * RING * sc.cellH };
    var obstacles = sc.main.concat([fence], taken);
    // Everything else — singles and small groups alike — is parked outside the ring as a gradient.
    var rest = sc.u.collectUnits(sc.pz).units.filter(function (unit) { return !best.has(unit.members[0]); });
    if (rest.length) {
      rest = sc.u.orderByColor(rest);
      var scales = [1, 0.85, 0.7, 0.6];
      for (var i = 0; i < scales.length; i++)
        if (sc.u.layout(rest, sc.W, sc.H, obstacles, sc.cellW * scales[i], sc.cellH * scales[i], 0) === rest.length) break;
      rest.forEach(function (unit) {
        if (unit.cell) unit.members[0].move(unit.cell.x + unit.dx, unit.cell.y + unit.dy);
      });
    }
    dimExcept(sc.movable, chosen);
    return chosen.length;
  }

  function onPointer(e) {
    if (!active || e.button) return;
    var canvas = document.getElementById('jigex-canvas'), r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) * canvas.width / r.width, y = (e.clientY - r.top) * canvas.height / r.height;
    e.preventDefault(); e.stopImmediatePropagation();
    var sc = scene(), onAssembly = !!sc && sc.main.some(function (p) {
      return Math.abs(p.position.x - x) < p.width / 2 && Math.abs(p.position.y - y) < p.height / 2;
    });
    var n = onAssembly ? frontier() : fitAt(x, y);
    if (btn) btn.textContent = n ? '🎯 ' + n + ' candidates (Esc)' : '🎯 Click a gap or the assembly';
  }

  function setActive(on, button) {
    active = on; btn = button || btn;
    if (!on) restore();
    if (btn) { btn.textContent = on ? '🎯 Click a gap or the assembly… (Esc)' : '🎯 Fit'; btn.style.background = on ? '#c0392b' : ''; }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && active) setActive(false); }, true);
  }

  root.jigexFit = { at: fitAt, frontier: frontier, toggle: function (button) { setActive(!active, button); }, active: function () { return active; },
    findSlots: findSlots, rankCandidates: rankCandidates, edgeStrip: edgeStrip, coreCentre: coreCentre };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.jigexFit;
})(typeof window !== 'undefined' ? window : globalThis);
