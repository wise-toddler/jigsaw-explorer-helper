// Fit mode: click an empty slot beside the assembly and the loose pieces that could go there are
// ranked by shape (tab/hole must be complementary) and boundary-colour continuity, then pulled next to it.
(function (root) {
  'use strict';
  var TOP_N = 8, DIM = 0.35;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]], SIDES = ['top', 'right', 'bottom', 'left'], OPP = [2, 3, 0, 1];

  // Lab samples along one side of a piece's core, just inside the edge, top→bottom or left→right.
  function edgeStrip(piece, side, subj, util, n) {
    var s = piece.spec, bb = s.image.bounds, core = s.core, out = [];
    var x0 = bb.x + core.x, y0 = bb.y + core.y, w = core.width, h = core.height, inset = 2;
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n, x, y;
      if (side === 0) { x = x0 + t * w; y = y0 + inset; }
      else if (side === 2) { x = x0 + t * w; y = y0 + h - 1 - inset; }
      else if (side === 3) { x = x0 + inset; y = y0 + t * h; }
      else { x = x0 + w - 1 - inset; y = y0 + t * h; }
      var k = (Math.floor(y) * subj.width + Math.floor(x)) * 4;
      out.push(util.rgbToLab([subj.data[k], subj.data[k + 1], subj.data[k + 2]]));
    }
    return out;
  }

  function stripDist(a, b) {
    var d = 0;
    for (var i = 0; i < a.length; i++) d += util().dist({ lab: a[i] }, { lab: b[i] });
    return Math.sqrt(d / a.length);
  }

  function util() { return root.jigexColorSort.util; }

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
        if (!slot) { slot = { x: x, y: y, sides: [], id: n.id }; slots.push(slot); }
        slot.sides.push({ side: OPP[k], piece: p }); // p sits on side OPP[k] of the slot
      });
    });
    return slots;
  }

  function rankCandidates(slot, loose, subj, pz) {
    var u = util(), cols = pz.pieces.numCols, rows = pz.pieces.numRows, n = 12;
    var row = Math.floor((slot.id - 1) / cols), col = (slot.id - 1) % cols;
    var border = [row === 0, col === cols - 1, row === rows - 1, col === 0];
    var strips = slot.sides.map(function (s) { return { side: s.side, strip: edgeStrip(s.piece, OPP[s.side], subj, u, n), tab: s.piece.spec.edges[SIDES[OPP[s.side]]].tab }; });
    var ranked = [];
    loose.forEach(function (p) {
      var e = p.spec.edges, ok = true, score = 0;
      if (!pz.rotatable) {
        for (var k = 0; k < 4 && ok; k++) ok = e[SIDES[k]].border === border[k];
        strips.forEach(function (s) { if (ok && e[SIDES[s.side]].tab === s.tab) ok = false; });
      }
      if (!ok) return;
      strips.forEach(function (s) { score += stripDist(s.strip, edgeStrip(p, s.side, subj, u, n)); });
      ranked.push({ piece: p, score: score / strips.length });
    });
    return ranked.sort(function (a, b) { return a.score - b.score; });
  }

  var dimmed = [], active = false, btn = null;

  function restore() {
    dimmed.forEach(function (p) { if (!p.isDisposed) p.opacity = 1; });
    dimmed = [];
  }

  // Rank pieces for the slot nearest to canvas point (x, y); pull the best next to it and dim the rest.
  function fitAt(x, y) {
    var u = util(), pz = u.getPuzzle();
    if (!pz || !pz.isReady()) return 0;
    var all = pz.pieces.specList.map(function (s) { return s.piece; }).filter(function (p) { return p && !p.isDisposed; });
    var groups = [];
    all.forEach(function (p) { if (p.group && groups.indexOf(p.group) < 0) groups.push(p.group); });
    groups.sort(function (a, b) { return b.members.length - a.members.length; });
    if (!groups.length) { console.warn('jigexFit: nothing assembled yet'); return 0; }
    var main = groups[0].members, core = main[0].spec.core, pitchW = core.width, pitchH = core.height;
    var slot = null, bd = Infinity;
    findSlots(main, pitchW, pitchH).forEach(function (s) {
      var d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bd) { bd = d; slot = s; }
    });
    if (!slot || bd > pitchW * pitchW) { console.warn('jigexFit: click an empty spot right next to the assembly'); return 0; }
    var sc = main[0].spec.image.data, subj = sc.getContext('2d').getImageData(0, 0, sc.width, sc.height);
    var loose = all.filter(function (p) { return !p.group && p.state && p.state.name === 'resting'; });
    var ranked = rankCandidates(slot, loose, subj, pz), top = ranked.slice(0, TOP_N).map(function (r) { return r.piece; });
    restore();
    var canvas = document.getElementById('jigex-canvas'), W = canvas.width, H = canvas.height;
    var maxW = Math.max.apply(null, loose.map(function (p) { return p.width; })), maxH = Math.max.apply(null, loose.map(function (p) { return p.height; }));
    var obstacles = all.filter(function (p) { return top.indexOf(p) < 0; });
    var o = u.occupied(obstacles, W, H, maxW + 4, maxH + 4);
    top.forEach(function (p) {
      var unit = u.makeUnit([p], subj);
      if (!u.nearestCell(unit, [{ x: slot.x, y: slot.y }], o, maxW + 4, maxH + 4)) return;
      p.raise();
      p.move(unit.cell.x, unit.cell.y, { animate: true, aniInterval: 500 });
    });
    loose.forEach(function (p) { if (top.indexOf(p) < 0) { p.opacity = DIM; dimmed.push(p); } });
    return top.length;
  }

  function onPointer(e) {
    if (!active || e.button) return;
    var canvas = document.getElementById('jigex-canvas'), r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) * canvas.width / r.width, y = (e.clientY - r.top) * canvas.height / r.height;
    e.preventDefault(); e.stopImmediatePropagation();
    var n = fitAt(x, y);
    if (btn) btn.textContent = n ? '🎯 ' + n + ' candidates (Esc)' : '🎯 Click next to the assembly';
  }

  function setActive(on, button) {
    active = on; btn = button || btn;
    if (!on) restore();
    if (btn) { btn.textContent = on ? '🎯 Click a gap… (Esc)' : '🎯 Fit'; btn.style.background = on ? '#c0392b' : ''; }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && active) setActive(false); }, true);
  }

  root.jigexFit = { at: fitAt, toggle: function (button) { setActive(!active, button); }, active: function () { return active; },
    findSlots: findSlots, rankCandidates: rankCandidates, edgeStrip: edgeStrip, coreCentre: coreCentre };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.jigexFit;
})(typeof window !== 'undefined' ? window : globalThis);
