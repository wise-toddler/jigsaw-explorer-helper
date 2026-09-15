// Helper buttons, placed inside the player's own top toolbar (falls back to a floating strip if it is missing).
(function () {
  'use strict';
  if (document.getElementById('jigex-colorsort')) return;
  var toolbar = document.getElementById('jigex-toolbar');
  var host = document.createElement('div');
  host.id = 'jigex-colorsort';
  host.style.cssText = toolbar
    ? 'position:absolute;left:52px;top:0;height:100%;display:flex;align-items:center;gap:5px;z-index:5'
    : 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px';
  var BTN = 'padding:3px 9px;border:0;border-radius:12px;background:rgba(255,255,255,.22);color:#fff;font:12px sans-serif;' +
    'line-height:16px;cursor:pointer;white-space:nowrap';

  function flash(btn, label, text) {
    btn.textContent = text;
    setTimeout(function () { btn.textContent = label; }, 2000);
  }

  // Shortcuts are Alt+letter: the player itself uses plain B C D M P R S T, Space and the arrow keys.
  var keys = {};

  function add(label, title, key, onClick) {
    var btn = document.createElement('button');
    btn.textContent = label;
    btn.title = title + ' (Alt+' + key + ')';
    btn.style.cssText = BTN;
    btn.dataset.bg = btn.style.background; // fit.js restores this after its "armed" red
    btn.addEventListener('click', function () { onClick(btn); });
    keys['Key' + key] = function () { onClick(btn); };
    host.appendChild(btn);
  }

  function sortBtn(label, title, key, mode) {
    add(label, title, key, function (btn) {
      var n = window.jigexColorSort({ mode: mode });
      flash(btn, label, n ? '✅ ' + n : '⚠️ nothing to do');
    });
  }

  sortBtn('🎨 Gradient', 'Arrange loose pieces in one colour gradient', 'G', 'gradient');
  sortBtn('🗂 Piles', 'Sort loose pieces into colour piles (one band per pile)', 'P', 'piles');
  sortBtn('🧲 Magnet', 'Pull each loose piece next to the matching-colour part of the assembly', 'M', 'magnet');
  sortBtn('📚 Stack', 'Stack loose pieces into colour decks to clear the table', 'S', 'stack');
  sortBtn('🃏 Deal', 'Spread the deck of the piece you are holding / last picked', 'D', 'deal');
  add('🎯 Fit', 'Click a gap beside the assembly: pieces that could fit come over (or snap in). Click a piece of the ' +
    'assembly: keep snapping candidates around that spot, park the rest away', 'F', function (btn) {
    window.jigexFit.toggle(btn);
  });
  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    if (!e.altKey || e.ctrlKey || e.metaKey || tag === 'INPUT' || tag === 'TEXTAREA' || !keys[e.code]) return;
    e.preventDefault();
    keys[e.code]();
  }, true);
  if (toolbar) {
    if (getComputedStyle(toolbar).position === 'static') toolbar.style.position = 'relative';
    toolbar.appendChild(host);
  } else document.body.appendChild(host);
})();
