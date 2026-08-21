/* =========================================================
   app.js  画面のきりかえと 全体の ながれ
   ========================================================= */
(function (global) {
  'use strict';

  var current = 'home';
  var lastCounts = null;      // 直近の投票結果（QR出力に使う）
  var toastTimer = 0;

  /* ---------- 画面きりかえ ---------- */
  function go(name) {
    var next = document.getElementById('screen-' + name);
    if (!next) return;

    // 出るときの後始末
    if (current === 'vote' && name !== 'vote') global.Vote.stop();
    if (current === 'parent' && name !== 'parent') global.Parent.camStop();
    if (global.Fx) global.Fx.clear();

    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (s) {
      s.classList.remove('active');
    });
    next.classList.add('active');
    if (next.classList.contains('scrollable')) next.scrollTop = 0;
    current = name;
  }

  /* ---------- toast ---------- */
  function toast(msg, warn) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('warn', !!warn);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* ---------- つうじょうモード 開始 ---------- */
  function startNormal() {
    var missing = global.Settings.readyCheck();
    if (missing.length) {
      var ok = global.confirm(
        'がぞうが はいって いない ばんごうが あります：' + missing.join('、') + 'ばん\n' +
        'このまま はじめますか？（「キャンセル」で せってい へ）'
      );
      if (!ok) { global.Settings.render(); go('settings'); return; }
    }

    var resume = false;
    if (global.Vote.hasUnfinished()) {
      resume = global.confirm('まえの とうひょうの つづきが のこって います。\nつづき から はじめますか？');
      if (!resume) global.Vote.clearSession();
    }

    global.Vote.start(resume);
    go('vote');
  }

  /* ---------- 投票おわり ---------- */
  function onVoteFinished(counts) {
    lastCounts = counts.slice();
    go('votedone');
    if (global.Snd) global.Snd.fanfare();
    if (global.Fx) global.Fx.confetti(70);
  }

  function showResultFromVote() {
    if (!lastCounts) { go('home'); return; }
    var s = global.Store.get();
    global.Result.show(lastCounts, {
      count: s.imageCount,
      urls: global.Store.urls(),
      names: [0, 1, 2, 3, 4].map(global.Store.nameOf),
      showNumber: s.showNumber,
      reveal: s.revealMode,
      showQR: true,
      title: s.revealMode ? 'けっか はっぴょう' : 'とうひょう けっか'
    });
    go('result');
  }

  /* ---------- おやき 合計 ---------- */
  function onParentTotal(totals, count, deviceCount) {
    var s = global.Store.get();
    lastCounts = totals.slice(0, count);
    global.Result.show(totals, {
      count: count,
      urls: global.Store.urls(),
      names: [0, 1, 2, 3, 4].map(global.Store.nameOf),
      showNumber: s.showNumber,
      reveal: s.revealMode,
      showQR: false,
      title: 'ぜんいんの けっか（' + deviceCount + 'だい ぶん）'
    });
    go('result');
  }

  /* ---------- QR しゅつりょく ---------- */
  function showQR() {
    if (!lastCounts) { go('home'); return; }
    var s = global.Store.get();
    var counts = lastCounts.slice(0, s.imageCount);
    var text = global.QR.encode(s.deviceId, counts);

    global.QR.render(document.getElementById('qr-canvas'), text, 8);
    document.getElementById('qr-text').textContent =
      s.deviceId + ' ' + counts.join('-');

    var sum = document.getElementById('qr-summary');
    sum.innerHTML = '';
    counts.forEach(function (c, i) {
      var chip = document.createElement('div');
      chip.className = 'qr-chip';
      chip.style.setProperty('--slot', 'var(--c' + (i + 1) + ')');
      var nm = global.Store.nameOf(i);
      chip.innerHTML = '<i>' + (i + 1) + '</i>' +
                       (nm ? '<b>' + nm + '</b>' : '') + c + 'ひょう';
      sum.appendChild(chip);
    });
    go('qr');
  }

  /* ---------- 起動 ---------- */
  function boot() {
    global.Store.load();

    // data-go を持つボタンは そのまま画面遷移
    Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
      b.addEventListener('click', function () {
        var target = b.getAttribute('data-go');
        if (global.Snd) { global.Snd.unlock(); global.Snd.tap(); }
        if (target === 'settings') global.Settings.render();
        go(target);
      });
    });

    document.getElementById('btn-mode-normal').addEventListener('click', function () {
      if (global.Snd) { global.Snd.unlock(); global.Snd.tap(); }
      startNormal();
    });
    document.getElementById('btn-mode-parent').addEventListener('click', function () {
      if (global.Snd) { global.Snd.unlock(); global.Snd.tap(); }
      global.Parent.render();
      go('parent');
    });

    document.getElementById('btn-to-result').addEventListener('click', showResultFromVote);
    document.getElementById('btn-reveal-next').addEventListener('click', function () {
      global.Result.next();
    });
    document.getElementById('btn-to-qr').addEventListener('click', showQR);
    document.getElementById('btn-qr-back').addEventListener('click', function () { go('result'); });

    global.Settings.bind();
    global.Parent.bind();
    global.Vote.bindAbort(function () {
      if (global.confirm('とうひょうを ちゅうだんして さいしょ に もどりますか？\n' +
                         '（いま までの ひょうは のこります）')) {
        go('home');
      }
    });

    // iOS の音声解錠（最初のタッチ）
    document.addEventListener('touchstart', function once() {
      if (global.Snd) global.Snd.unlock();
      document.removeEventListener('touchstart', once);
    }, { passive: true });

    // ピンチズーム / ダブルタップズーム を止める
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    var lastTouch = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouch < 320) e.preventDefault();
      lastTouch = now;
    }, false);

    // file:// で直接ひらくと、iPad Safari では 画像の保存(IndexedDB)も
    // カメラも 使えない。気づけるように 起動時に知らせる。
    if (location.protocol === 'file:') {
      setTimeout(function () {
        toast('ファイルを 直接ひらいています。がぞうの ほぞんと カメラが つかえません', true);
      }, 800);
    }

    // 画像の読み込みを待たずに ホームを出す
    // （IndexedDB が使えない環境でも 画面が真っ白に ならないように）
    go('home');
    // せってい画面の中身は、開いたときに組み立てる。
    // 起動しただけで 5枚ぶんの画像を取りに行かないようにするため。
    global.Store.loadAllUrls().catch(function () {
      toast('がぞうの よみこみに しっぱい しました', true);
    });
  }

  global.App = {
    go: go,
    toast: toast,
    onVoteFinished: onVoteFinished,
    onParentTotal: onParentTotal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})(window);
