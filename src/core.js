// Arranges loose Jigsaw Explorer pieces (singles + any group except the main assembly) by colour.
(function (root) {
  'use strict';
  if (root.jigexColorSort) return;
  var CELL_PAD = 4; // px of breathing room added to a piece's size when sizing layout cells

  function getPlayer() { var g = root.jigexGlobals; return g && g.modules && g.modules.player; }
  function getPuzzle() { var p = getPlayer(); return p && p.Puzzle && p.Puzzle.curr; }

  // Every live piece of the puzzle.
  function pieces(pz) {
    return pz.pieces.specList.map(function (s) { return s.piece; }).filter(function (p) { return p && !p.isDisposed; });
  }

  // The largest joined cluster is the assembly; null while nothing is joined yet.
  function mainGroup(all) {
    var groups = [];
    all.forEach(function (p) { if (p.group && groups.indexOf(p.group) < 0) groups.push(p.group); });
    groups.sort(function (a, b) { return b.members.length - a.members.length; });
    return groups[0] || null;
  }

  // Pixel data of the shared subject image (every piece's spec.image.data is the same canvas).
  function subject(piece) {
    var sc = piece.spec.image.data;
    return sc.getContext('2d').getImageData(0, 0, sc.width, sc.height);
  }

  // Average colour of a piece's core (body without tabs) sampled from the shared subject image.
  function avgColor(piece, subj) {
    var s = piece.spec, bb = s.image.bounds, core = s.core;
    var x0 = bb.x + core.x, y0 = bb.y + core.y, x1 = x0 + core.width, y1 = y0 + core.height;
    var d = subj.data, W = subj.width, r = 0, g = 0, b = 0, n = 0;
    for (var y = y0; y < y1; y += 3) for (var x = x0; x < x1; x += 3) {
      var i = (y * W + x) * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return n ? [r / n, g / n, b / n] : [0, 0, 0];
  }

  // sRGB -> CIE Lab (D65), so distances match perceived colour difference.
  function rgbToLab(c) {
    var f = function (v) { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
    var t = function (v) { return v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116; };
    var r = f(c[0]), g = f(c[1]), b = f(c[2]);
    var x = t((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    var y = t(r * 0.2126 + g * 0.7152 + b * 0.0722);
    var z = t((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  function dist(a, b) {
    var p = a.lab, q = b.lab;
    return (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]);
  }

  // Gradient order: start at the most extreme colour, chain nearest neighbours, then smooth with 2-opt.
  function orderByColor(units) {
    var n = units.length, i, j;
    var mean = [0, 0, 0];
    units.forEach(function (u) { for (i = 0; i < 3; i++) mean[i] += u.lab[i] / n; });
    var start = 0, best = -1;
    units.forEach(function (u, k) { var d = dist(u, { lab: mean }); if (d > best) { best = d; start = k; } });
    var order = [units[start]], left = units.slice();
    left.splice(start, 1);
    while (left.length) {
      var last = order[order.length - 1], bi = 0, bd = Infinity;
      for (i = 0; i < left.length; i++) { var d = dist(last, left[i]); if (d < bd) { bd = d; bi = i; } }
      order.push(left.splice(bi, 1)[0]);
    }
    for (var pass = 0, improved = true; pass < 8 && improved; pass++) {
      improved = false;
      for (i = 1; i < n - 1; i++) for (j = i + 1; j < n; j++) {
        var before = dist(order[i - 1], order[i]) + (j + 1 < n ? dist(order[j], order[j + 1]) : 0);
        var after = dist(order[i - 1], order[j]) + (j + 1 < n ? dist(order[i], order[j + 1]) : 0);
        if (after < before - 1e-9) {
          var seg = order.slice(i, j + 1).reverse();
          for (var k = 0; k < seg.length; k++) order[i + k] = seg[k];
          improved = true;
        }
      }
    }
    return order;
  }

  // k-means in Lab (farthest-point init, so results are deterministic). Returns non-empty piles.
  function kmeans(units, k) {
    var cents = [units[0].lab], i, j, it;
    while (cents.length < k) {
      var far = null, fd = -1;
      units.forEach(function (u) {
        var d = Infinity;
        cents.forEach(function (c) { d = Math.min(d, dist(u, { lab: c })); });
        if (d > fd) { fd = d; far = u; }
      });
      cents.push(far.lab.slice());
    }
    var piles;
    for (it = 0; it < 25; it++) {
      piles = cents.map(function () { return []; });
      units.forEach(function (u) {
        var bi = 0, bd = Infinity;
        for (i = 0; i < cents.length; i++) { var d = dist(u, { lab: cents[i] }); if (d < bd) { bd = d; bi = i; } }
        piles[bi].push(u);
      });
      var moved = false;
      piles.forEach(function (p, pi) {
        if (!p.length) return;
        var m = [0, 0, 0];
        p.forEach(function (u) { for (j = 0; j < 3; j++) m[j] += u.lab[j] / p.length; });
        if (dist({ lab: m }, { lab: cents[pi] }) > 0.01) moved = true;
        cents[pi] = m;
      });
      if (!moved) break;
    }
    return piles.filter(function (p) { return p.length; });
  }

  function bbox(pieces) {
    var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    pieces.forEach(function (p) {
      var w = p.width / 2, h = p.height / 2;
      l = Math.min(l, p.position.x - w); r = Math.max(r, p.position.x + w);
      t = Math.min(t, p.position.y - h); b = Math.max(b, p.position.y + h);
    });
    return { l: l, t: t, r: r, b: b };
  }

  // A unit is a single piece or a small group; moved via its first member (move() carries the group).
  function makeUnit(members, subj) {
    var b = bbox(members), c = [0, 0, 0];
    members.forEach(function (p) { var a = avgColor(p, subj); c[0] += a[0]; c[1] += a[1]; c[2] += a[2]; });
    return { members: members, w: b.r - b.l, h: b.b - b.t, single: members.length === 1,
      lab: rgbToLab(c.map(function (v) { return v / members.length; })),
      dx: members[0].position.x - (b.l + b.r) / 2, dy: members[0].position.y - (b.t + b.b) / 2 };
  }

  // Grid of cells covered by any assembly piece (per piece, not its bounding box, so interior gaps stay free).
  function occupied(main, W, H, cellW, cellH) {
    var cols = Math.max(1, Math.floor(W / cellW)), rows = Math.max(1, Math.floor(H / cellH)), grid = [], r, c;
    for (r = 0; r < rows; r++) { grid.push([]); for (c = 0; c < cols; c++) grid[r].push(false); }
    main.forEach(function (p) {
      var l = p.position.x - p.width / 2, t = p.position.y - p.height / 2;
      for (r = Math.max(0, Math.floor(t / cellH)); r < rows && r * cellH < t + p.height; r++)
        for (c = Math.max(0, Math.floor(l / cellW)); c < cols && c * cellW < l + p.width; c++) grid[r][c] = true;
    });
    return { cols: cols, rows: rows, grid: grid };
  }

  // Cells a unit spans at this cell size: singles always 1, groups by their real size (tabs may overlap a bit).
  function span(u, cellW, cellH, cols, rows) {
    return { cw: Math.min(cols, u.single ? 1 : Math.max(1, Math.ceil(u.w / cellW - 0.2))),
      ch: Math.min(rows, u.single ? 1 : Math.max(1, Math.ceil(u.h / cellH - 0.2))) };
  }

  // Occupancy grid in snake order. A unit flagged newBand starts on a fresh row (plus `gap` empty rows);
  // cells over the assembled area are used only as a last resort.
  function layout(units, W, H, main, cellW, cellH, gap) {
    var o = occupied(main, W, H, cellW, cellH), cols = o.cols, rows = o.rows, busy = o.grid, used = [];
    for (var r = 0; r < rows; r++) { used.push([]); for (var c = 0; c < cols; c++) used[r].push(false); }
    var bandRow = 0, maxRow = -1;
    function place(u, allowBusy) {
      var s = span(u, cellW, cellH, cols, rows), cw = s.cw, ch = s.ch;
      for (var r = allowBusy ? 0 : bandRow; r + ch <= rows; r++) for (var c0 = 0; c0 + cw <= cols; c0++) {
        var c = r % 2 ? cols - cw - c0 : c0, ok = true;
        for (var i = 0; i < ch && ok; i++) for (var j = 0; j < cw && ok; j++)
          ok = !used[r + i][c + j] && (allowBusy || !busy[r + i][c + j]);
        if (!ok) continue;
        for (i = 0; i < ch; i++) for (j = 0; j < cw; j++) used[r + i][c + j] = true;
        u.cell = { x: (c + cw / 2) * cellW, y: (r + ch / 2) * cellH };
        maxRow = Math.max(maxRow, r + ch - 1);
        return true;
      }
      return false;
    }
    var clean = 0;
    units.forEach(function (u) {
      u.cell = null;
      if (u.newBand && maxRow >= 0) bandRow = maxRow + 1 + (gap || 0);
      if (place(u, false)) clean++;
    });
    units.forEach(function (u) { u.cell || place(u, true); });
    return clean;
  }

  // Magnet: each unit goes to the nearest free cell beside the assembly piece whose colour matches it best.
  // neighbors[] is [top, right, bottom, left]; a side is open when that neighbour is not in the assembly yet.
  function magnet(units, main, subj, W, H, cellW, cellH) {
    var o = occupied(main, W, H, cellW, cellH);
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var anchors = main.map(function (p) {
      var pts = [];
      (p.neighbors || []).forEach(function (n, k) {
        if (n && n.group !== p.group) pts.push({ x: p.position.x + dirs[k][0] * cellW, y: p.position.y + dirs[k][1] * cellH });
      });
      return { lab: rgbToLab(avgColor(p, subj)), pts: pts.length ? pts : [{ x: p.position.x, y: p.position.y }], open: !!pts.length };
    });
    var openOnly = anchors.some(function (a) { return a.open; });
    units.forEach(function (u) {
      u.cell = null; u.anchor = null; u.score = Infinity;
      anchors.forEach(function (a) {
        if (openOnly && !a.open) return;
        var d = dist(u, a);
        if (d < u.score) { u.score = d; u.anchor = a; }
      });
    });
    units.sort(function (a, b) { return a.score - b.score; }); // best matches get the closest spots
    var placed = 0;
    units.forEach(function (u) { if (nearestCell(u, u.anchor.pts, o, cellW, cellH)) placed++; });
    return placed;
  }

  // Claim the free block of cells closest to any of `pts` for unit u; marks it used in o.grid.
  function nearestCell(u, pts, o, cellW, cellH) {
    var s = span(u, cellW, cellH, o.cols, o.rows), cw = s.cw, ch = s.ch, best = null, bd = Infinity, i, j;
    for (var r = 0; r + ch <= o.rows; r++) for (var c = 0; c + cw <= o.cols; c++) {
      var cx = (c + cw / 2) * cellW, cy = (r + ch / 2) * cellH, d = Infinity;
      pts.forEach(function (p) { d = Math.min(d, (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy)); });
      if (d >= bd) continue;
      var ok = true;
      for (i = 0; i < ch && ok; i++) for (j = 0; j < cw && ok; j++) ok = !o.grid[r + i][c + j];
      if (ok) { bd = d; best = { r: r, c: c }; }
    }
    if (!best) return false;
    for (i = 0; i < ch; i++) for (j = 0; j < cw; j++) o.grid[best.r + i][best.c + j] = true;
    u.cell = { x: (best.c + cw / 2) * cellW, y: (best.r + ch / 2) * cellH };
    return true;
  }

  // Stack: every pile becomes one deck (top piece visible) parked in free cells along the bottom of the table.
  function stack(units, main, W, H, cellW, cellH) {
    var o = occupied(main, W, H, cellW, cellH), spots = [];
    for (var r = o.rows - 1; r >= 0 && spots.length < 64; r--)
      for (var c = 0; c < o.cols; c += 2) if (!o.grid[r][c]) spots.push({ x: (c + 0.5) * cellW, y: (r + 0.5) * cellH });
    var pile = -1, j = 0;
    units.forEach(function (u) {
      if (u.newBand || pile < 0) { pile++; j = 0; }
      var s = spots[Math.min(pile, spots.length - 1)];
      u.cell = { x: s.x + (j % 5) * 4, y: s.y + (Math.floor(j / 5) % 5) * 4 };
      u.members.forEach(function (p) { p._csPile = pile; });
      j++;
    });
    return units.length;
  }

  // Deal: spread one pile (the one holding the selected piece) as a gradient around where it sits.
  function deal(units, pileId, obstacles, W, H, cellW, cellH) {
    var mine = orderByColor(units.filter(function (u) { return u.members[0]._csPile === pileId; }));
    if (!mine.length) return [];
    var at = mine[0].members[0].position, o = occupied(obstacles, W, H, cellW, cellH);
    mine.forEach(function (u) { nearestCell(u, [{ x: at.x, y: at.y }], o, cellW, cellH); });
    return mine;
  }

  // Movable units of the puzzle: the largest joined cluster is the assembly and stays put; every other
  // resting piece or group is a unit. `resting` also includes assembly pieces (used for cell sizing).
  function collectUnits(pz) {
    var all = pieces(pz), resting = all.filter(function (p) { return p.state && p.state.name === 'resting'; });
    var main = mainGroup(all), subj = resting.length ? subject(resting[0]) : null, units = [];
    resting.forEach(function (p) {
      if (!p.group) return units.push(makeUnit([p], subj));
      if (p.group === main || p.group.members[0] !== p) return;
      units.push(makeUnit(p.group.members.slice(), subj));
    });
    return { units: units, mainGroup: main, resting: resting, subj: subj };
  }

  // Order the piles themselves as a gradient, and each pile internally; each pile starts a new band.
  function orderPiles(piles) {
    var cents = piles.map(function (g) { var m = [0, 0, 0]; g.forEach(function (u) { for (var j = 0; j < 3; j++) m[j] += u.lab[j] / g.length; }); return { lab: m, pile: g }; });
    var units = [];
    orderByColor(cents).forEach(function (c) {
      var ordered = orderByColor(c.pile);
      ordered[0].newBand = true;
      units = units.concat(ordered);
    });
    return units;
  }

  // opts.mode: gradient (default) | piles | magnet | stack | deal; opts.k: pile count (auto if omitted).
  root.jigexColorSort = function (opts) {
    opts = opts || {};
    var pz = getPuzzle();
    if (!pz || !pz.pieces || !pz.pieces.specList || !pz.isReady()) { console.warn('jigexColorSort: puzzle not ready'); return 0; }
    var coll = collectUnits(pz), units = coll.units, resting = coll.resting, subj = coll.subj;
    if (!units.length) { alert('No loose pieces to sort'); return 0; }
    var pileCount = 0, mode = opts.mode || 'gradient';
    if (mode === 'magnet' && !coll.mainGroup) mode = 'piles'; // nothing to attract to yet
    var canvas = document.getElementById('jigex-canvas'), W = canvas.width, H = canvas.height;
    var main = coll.mainGroup ? coll.mainGroup.members : [];
    var maxW = Math.max.apply(null, resting.map(function (p) { return p.width; }));
    var maxH = Math.max.apply(null, resting.map(function (p) { return p.height; }));
    if (mode === 'deal') {
      var player = getPlayer(), sel = opts.piece || player.Piece.selectedPiece || player.Piece.capturedList[0];
      var pileId = sel && sel._csPile;
      if (pileId === undefined) { console.warn('jigexColorSort: pick a piece from a stack first'); return 0; }
      var others = main.concat(resting.filter(function (p) { return p._csPile !== pileId; }));
      return moveUnits(deal(units, pileId, others, W, H, maxW + CELL_PAD, maxH + CELL_PAD), W, H, false);
    }
    if ((mode === 'piles' || mode === 'stack') && units.length > 3) {
      var k = opts.k || Math.min(6, Math.max(2, Math.round(Math.sqrt(units.length / 3))));
      var piles = kmeans(units, k);
      units = orderPiles(piles);
      pileCount = piles.length;
    } else if (mode !== 'magnet') units = orderByColor(units);

    if (mode === 'stack') { stack(units, main, W, H, maxW + CELL_PAD, maxH + CELL_PAD); return moveUnits(units, W, H, true); }
    // Full-size cells with a gap row between piles first; drop the gap, then shrink cells (tabs overlap).
    var scales = [1, 0.9, 0.8, 0.7, 0.6], done = false;
    for (var si = 0; si < scales.length && !done; si++) {
      var cw = maxW * scales[si] + CELL_PAD, ch = maxH * scales[si] + CELL_PAD;
      if (mode === 'magnet') done = magnet(units, main, subj, W, H, cw, ch) === units.length;
      else for (var gap = pileCount ? 1 : 0; gap >= 0 && !done; gap--) done = layout(units, W, H, main, cw, ch, gap) === units.length;
    }
    return moveUnits(units, W, H, false);
  };

  // Animate every unit to its cell; `topFirst` raises in reverse so the first unit ends on top (stacks).
  function moveUnits(units, W, H, topFirst) {
    var order = topFirst ? units.slice().reverse() : units;
    order.forEach(function (u) {
      var c = u.cell || { x: W / 2, y: H / 2 };
      u.members[0].raise();
      u.members[0].move(c.x + u.dx, c.y + u.dy, { animate: true, aniInterval: 600 });
    });
    return units.length;
  }

  // Shared helpers for fit.js and the unit tests.
  root.jigexColorSort.util = { CELL_PAD: CELL_PAD, getPuzzle: getPuzzle, pieces: pieces, mainGroup: mainGroup, subject: subject,
    avgColor: avgColor, rgbToLab: rgbToLab, dist: dist, kmeans: kmeans, orderByColor: orderByColor, occupied: occupied, span: span,
    nearestCell: nearestCell, layout: layout, magnet: magnet, stack: stack, deal: deal, makeUnit: makeUnit, bbox: bbox,
    collectUnits: collectUnits };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.jigexColorSort;
})(typeof window !== 'undefined' ? window : globalThis);
