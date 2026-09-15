// Floating toolbar for the Jigsaw Explorer player page.
(function () {
  'use strict';
  if (document.getElementById('jigex-colorsort')) return;
  var host = document.createElement('div');
  host.id = 'jigex-colorsort';
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-wrap:wrap;' +
    'justify-content:flex-end;gap:6px;max-width:420px';
  var BTN = 'padding:7px 12px;border:0;border-radius:18px;background:#4a6fa5;color:#fff;font:13px sans-serif;' +
    'cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)';

  function flash(btn, label, text) {
    btn.textContent = text;
    setTimeout(function () { btn.textContent = label; }, 2000);
  }

  function add(label, title, onClick) {
    var btn = document.createElement('button');
    btn.textContent = label;
    btn.title = title;
    btn.style.cssText = BTN;
    btn.addEventListener('click', function () { onClick(btn, label); });
    host.appendChild(btn);
    return btn;
  }

  function sortBtn(label, title, mode) {
    add(label, title, function (btn) {
      var n = window.jigexColorSort({ mode: mode });
      flash(btn, label, n ? '✅ ' + n : '⚠️ nothing to do');
    });
  }

  sortBtn('🎨 Gradient', 'Arrange loose pieces in one colour gradient', 'gradient');
  sortBtn('🗂 Piles', 'Sort loose pieces into colour piles (one band per pile)', 'piles');
  sortBtn('🧲 Magnet', 'Pull each loose piece next to the matching-colour part of the assembly', 'magnet');
  sortBtn('📚 Stack', 'Stack loose pieces into colour decks to clear the table', 'stack');
  sortBtn('🃏 Deal', 'Spread the deck of the piece you are holding / last picked', 'deal');
  add('🎯 Fit', 'Click a gap beside the assembly: pieces that could fit come over. Click the assembly itself: ' +
    'candidates for every gap gather around it and the rest are parked away', function (btn) {
    window.jigexFit.toggle(btn);
  });
  document.body.appendChild(host);
})();
