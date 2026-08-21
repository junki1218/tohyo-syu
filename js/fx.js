/* =========================================================
   fx.js  ちいさな演出（紙ふぶき）
   使う場面は「1票 入ったとき」と「1位の発表」だけに絞る。
   画面を にぎやかにしすぎると、どこを見ればよいか分からなくなるため。
   ========================================================= */
(function (global) {
  'use strict';

  var COLORS = ['#F2544B', '#3D8FE0', '#3FBF6E', '#F5A623', '#A263D6', '#FF8A3D'];
  var host = null;

  function box() {
    if (!host) host = document.getElementById('confetti');
    return host;
  }

  /* n 枚を上から降らせる。opts.x / opts.y を渡すと そこから弾ける */
  function confetti(n, opts) {
    var c = box(); if (!c) return;
    opts = opts || {};
    n = n || 40;

    for (var i = 0; i < n; i++) {
      var p = document.createElement('i');
      var color = COLORS[Math.floor(Math.random() * COLORS.length)];
      var size = 8 + Math.random() * 10;
      var dur = 1400 + Math.random() * 1400;
      var delay = Math.random() * (opts.burst ? 120 : 600);

      p.className = 'cf' + (Math.random() < 0.4 ? ' cf-round' : '');
      p.style.background = color;
      p.style.width = size + 'px';
      p.style.height = (size * (0.5 + Math.random() * 0.8)) + 'px';
      p.style.left = (opts.burst ? 50 + (Math.random() - 0.5) * 30 : Math.random() * 100) + '%';
      p.style.top = (opts.burst ? 45 : -8) + '%';
      p.style.setProperty('--dx', ((Math.random() - 0.5) * 260).toFixed(0) + 'px');
      p.style.setProperty('--dy', (opts.burst ? 70 + Math.random() * 60 : 118) + 'vh');
      p.style.setProperty('--rot', (Math.random() * 1080 - 540).toFixed(0) + 'deg');
      p.style.animationDuration = dur + 'ms';
      p.style.animationDelay = delay + 'ms';

      c.appendChild(p);
      (function (node, life) {
        setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, life);
      })(p, dur + delay + 120);
    }
  }

  function clear() {
    var c = box(); if (c) c.innerHTML = '';
  }

  global.Fx = { confetti: confetti, clear: clear };
})(window);
