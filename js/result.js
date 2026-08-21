/* =========================================================
   result.js  棒グラフの描画と 結果発表
   - 発表モード ON : 最下位から 1つずつ。先生のタップで次へ
   - 発表モード OFF: ぜんぶ 同時に 伸びる
   ========================================================= */
(function (global) {
  'use strict';

  var BAR_MS = 1600;               // CSS の transition と揃える

  var state = {
    counts: [],
    order: [],                     // 発表する順(index の配列 / 下位→上位)
    step: 0,
    reveal: true,
    showQR: true
  };

  var el = {};
  function cache() {
    el.chart = document.getElementById('chart');
    el.title = document.getElementById('result-title');
    el.next = document.getElementById('btn-reveal-next');
    el.qr = document.getElementById('btn-to-qr');
  }

  /* counts: [n,n,n,n,n] / opts:{count,urls,showNumber,reveal,showQR,title} */
  function show(counts, opts) {
    if (!el.chart) cache();
    opts = opts || {};
    var n = opts.count || 5;

    state.counts = counts.slice(0, n);
    state.reveal = opts.reveal !== false;
    state.showQR = opts.showQR !== false;
    state.step = 0;

    el.title.textContent = opts.title || (state.reveal ? 'けっか はっぴょう' : 'とうひょう けっか');

    var max = Math.max(1, Math.max.apply(null, state.counts));

    /* 並び: 上が 1位。同数は 番号の小さい方を上に */
    var rank = state.counts.map(function (c, i) { return { i: i, c: c }; });
    rank.sort(function (a, b) { return b.c - a.c || a.i - b.i; });

    /* 発表順: 下(最下位)から 上へ */
    state.order = rank.map(function (r) { return r.i; }).reverse();

    el.chart.innerHTML = '';
    rank.forEach(function (r) {
      el.chart.appendChild(buildRow(r.i, r.c, max, opts));
    });

    if (state.reveal) {
      el.next.style.display = '';
      el.next.textContent = 'はっぴょう する';
      el.next.disabled = false;
      el.qr.style.display = 'none';
    } else {
      el.next.style.display = 'none';
      el.qr.style.display = state.showQR ? '' : 'none';
      // 少し待ってから いっせいに 伸ばす
      setTimeout(function () {
        var last = state.order.length - 1;
        state.order.forEach(function (idx, k) { revealRow(idx, k === last); });
        if (global.Snd) global.Snd.reveal();
      }, 350);
    }
  }

  function buildRow(idx, count, max, opts) {
    var row = document.createElement('div');
    row.className = 'bar-row';
    row.dataset.idx = String(idx);
    row.style.setProperty('--slot', 'var(--c' + (idx + 1) + ')');

    /* 左は「しゃしん」ひと枠だけ。番号はその上に重ねる
       （枠と番号を横に並べると 同じものが2つあるように見えるため） */
    var url = (opts.urls || [])[idx];
    var thumb = document.createElement('div');
    thumb.className = 'bar-thumb' + (url ? '' : ' no-img');
    if (url) {
      var img = document.createElement('img');
      img.alt = '';
      global.Store.attachImage(img, url);
      thumb.appendChild(img);
    }
    if (opts.showNumber !== false || !url) {
      var num = document.createElement('div');
      num.className = 'bar-num'; num.textContent = String(idx + 1);
      thumb.appendChild(num);
    }
    row.appendChild(thumb);

    var nm = (opts.names || [])[idx];
    if (nm) {
      var name = document.createElement('div');
      name.className = 'bar-name'; name.textContent = nm;
      row.appendChild(name);
    }

    var track = document.createElement('div');
    track.className = 'bar-track';
    var fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.dataset.pct = String(Math.round((count / max) * 100));
    track.appendChild(fill);
    row.appendChild(track);

    var val = document.createElement('div');
    val.className = 'bar-val';
    val.innerHTML = '<span>0</span><small>ひょう</small>';
    row.appendChild(val);

    row.dataset.count = String(count);
    return row;
  }

  function rowOf(idx) {
    return el.chart.querySelector('.bar-row[data-idx="' + idx + '"]');
  }

  function revealRow(idx, isTop) {
    var row = rowOf(idx); if (!row) return;
    row.classList.add('shown');
    var fill = row.querySelector('.bar-fill');
    var span = row.querySelector('.bar-val span');
    var count = parseInt(row.dataset.count, 10) || 0;

    // 一度レイアウトを確定させてから width を当て、transition を起こす
    void fill.offsetWidth;
    fill.style.width = fill.dataset.pct + '%';

    countUp(span, count, BAR_MS);
    // rAF が動かない環境でも 最後は必ず 正しい数字になるようにする
    setTimeout(function () { span.textContent = String(count); }, BAR_MS + 120);

    if (isTop && !row.querySelector('.crown')) {
      var crown = document.createElement('span');
      crown.className = 'crown'; crown.textContent = '👑';
      row.appendChild(crown);
      row.classList.add('win');
      if (global.Fx) setTimeout(function () { global.Fx.confetti(56); }, 300);
    }
  }

  function countUp(span, to, ms) {
    var start = null;
    function tick(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / ms);
      var e = 1 - Math.pow(1 - p, 3);
      span.textContent = String(Math.round(to * e));
      if (p < 1) requestAnimationFrame(tick);
      else span.textContent = String(to);
    }
    requestAnimationFrame(tick);
  }

  /* 「はっぴょう する」= 次の1本 */
  function next() {
    if (state.step >= state.order.length) return;
    var idx = state.order[state.step];
    var isTop = (state.step === state.order.length - 1);

    el.next.disabled = true;
    revealRow(idx, isTop);
    if (global.Snd) { isTop ? global.Snd.fanfare() : global.Snd.reveal(); }

    state.step++;

    setTimeout(function () {
      if (state.step >= state.order.length) {
        el.next.style.display = 'none';
        el.qr.style.display = state.showQR ? '' : 'none';
        el.title.textContent = 'けっか はっぴょう おわり';
      } else {
        el.next.disabled = false;
        el.next.textContent = 'つぎを はっぴょう';
      }
    }, BAR_MS * 0.75);
  }

  function isDone() { return !state.reveal || state.step >= state.order.length; }

  global.Result = { show: show, next: next, isDone: isDone };
})(window);
