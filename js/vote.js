/* =========================================================
   vote.js  とうひょう画面
   ---------------------------------------------------------
   1票を入れるまでの「ためかた」は2とおり。どちらでもよいし、混ぜてもよい。
     ・ながおし  … 押しつづけると たまる（設定した秒数で満タン）
     ・とんとん  … 細かく連打しても たまる（設定した回数で満タン）
   どちらも同じ「ためゲージ(0〜1)」を動かしていて、1になったら1票入る。
   手を止めて しばらく さわらないと、ゲージは ゆっくり 戻る。

   各画像の得票は 投票中は 見せない（見えると 多い方に 寄るため）。
   出すのは 「あと ○にん」 と 残り票の ●印 だけ。
   ========================================================= */
(function (global) {
  'use strict';

  var SESSION_KEY = 'votingApp.session.v1';
  var IDLE_MS = 2200;   // 最後にさわってから、ゲージが戻りはじめるまで
  var FADE_MS = 900;    // 戻りきるまでの時間
  var FULL    = 0.999;  // 満タン判定。0.1を10回足すと1.0にならないため少し手前で見る

  var st = {
    counts: [0, 0, 0, 0, 0],
    cast: 0,
    total: 8,
    imageCount: 3,
    urls: [],
    holdMs: 1200,
    taps: 10,
    showNumber: true,
    busy: false
  };

  var el = {};
  var press = null;                                  // 今 指が触れている札
  var gauge = { idx: -1, value: 0, last: 0 };        // ためゲージ
  var raf = 0;
  var abortHold = null;
  var chargeTimer = 0;   // 連打では長押し音を鳴らさないための待ち
  var holdTimer = 0;     // rAF が止まる環境でも長押しが成立するようにする保険
  var fadeTimer = 0;     // 同じく、放置したゲージが確実に戻るようにする保険

  /* 音は「あれば鳴らす」。古い sound.js が混ざっても投票が止まらないように */
  function snd(name, arg) {
    var S = global.Snd;
    if (S && typeof S[name] === 'function') S[name](arg);
  }

  function cache() {
    el.grid = document.getElementById('vote-grid');
    el.remain = document.getElementById('remain-num');
    el.pips = document.getElementById('remain-pips');
    el.hint = document.getElementById('vote-hint');
    el.abort = document.getElementById('btn-abort');
    el.overlay = document.getElementById('cast-overlay');
    el.frame = el.overlay.querySelector('.cast-frame');
    el.castImg = document.getElementById('cast-img');
  }

  /* ---------- セッションの保存 / 復元 ---------- */
  function saveSession() {
    try {
      global.localStorage.setItem(SESSION_KEY, JSON.stringify({
        counts: st.counts, cast: st.cast, total: st.total, imageCount: st.imageCount
      }));
    } catch (e) {}
  }
  function loadSession() {
    try {
      var raw = global.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSession() {
    try { global.localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function hasUnfinished() {
    var s = loadSession();
    return !!(s && s.cast > 0 && s.cast < s.total);
  }

  /* ---------- 開始 ---------- */
  function start(resume) {
    if (!el.grid) cache();
    var cfg = global.Store.get();

    st.total = cfg.totalVotes;
    st.imageCount = cfg.imageCount;
    st.holdMs = cfg.holdMs;
    st.taps = cfg.tapsToVote;
    st.showNumber = cfg.showNumber;
    st.urls = global.Store.urls();
    st.names = [0, 1, 2, 3, 4].map(global.Store.nameOf);
    st.busy = false;

    var prev = resume ? loadSession() : null;
    if (prev && prev.imageCount === st.imageCount && prev.total === st.total) {
      st.counts = prev.counts.slice(0, 5);
      st.cast = prev.cast;
    } else {
      st.counts = [0, 0, 0, 0, 0];
      st.cast = 0;
      clearSession();
    }

    resetGauge();
    buildGrid();
    updateRemain();
  }

  function buildGrid() {
    el.grid.className = 'vote-grid n' + st.imageCount;
    el.grid.innerHTML = '';
    for (var i = 0; i < st.imageCount; i++) el.grid.appendChild(buildCard(i));
  }

  function buildCard(idx) {
    var card = document.createElement('div');
    card.className = 'vote-card';
    card.dataset.idx = String(idx);
    card.style.setProperty('--slot', 'var(--c' + (idx + 1) + ')');
    card.style.touchAction = 'none';

    var url = st.urls[idx];
    if (url) {
      var img = document.createElement('img');
      img.alt = ''; img.draggable = false;
      global.Store.attachImage(img, url);
      card.appendChild(img);
    } else {
      // 画像がない枠は、番号を大きく出して押せる状態は保つ
      var ph = document.createElement('div');
      ph.className = 'card-no';
      ph.textContent = String(idx + 1);
      card.appendChild(ph);
    }

    var ring = document.createElement('div');
    ring.className = 'ring';
    card.appendChild(ring);

    var rt = document.createElement('div');
    rt.className = 'ring-txt';
    rt.innerHTML = '<span></span>';
    card.appendChild(rt);

    if (st.showNumber) {
      var num = document.createElement('div');
      num.className = 'num'; num.textContent = String(idx + 1);
      card.appendChild(num);
    }

    var nm = st.names[idx];
    if (nm) {
      var name = document.createElement('div');
      name.className = 'name'; name.textContent = nm;
      card.appendChild(name);
    }

    card.addEventListener('pointerdown', onDown);
    card.addEventListener('pointerup', onUp);
    card.addEventListener('pointercancel', onUp);
    card.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return card;
  }

  function cardOf(idx) {
    return el.grid.querySelector('.vote-card[data-idx="' + idx + '"]');
  }

  /* ---------- ためゲージ ---------- */
  function resetGauge() {
    if (gauge.idx >= 0) {
      var c = cardOf(gauge.idx);
      if (c) {
        c.classList.remove('charging');
        c.querySelector('.ring').style.setProperty('--p', '0%');
      }
    }
    gauge.idx = -1; gauge.value = 0; gauge.last = 0; gauge.fading = false;
    clearTimeout(fadeTimer); fadeTimer = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function paint() {
    var card = cardOf(gauge.idx);
    if (!card) return;
    card.classList.toggle('charging', gauge.value > 0);
    card.querySelector('.ring').style
        .setProperty('--p', (Math.min(1, gauge.value) * 100).toFixed(1) + '%');

    var label = card.querySelector('.ring-txt span');
    if (press) {
      label.textContent = 'そのまま…';
    } else {
      var left = Math.max(1, Math.round((1 - gauge.value) * st.taps));
      label.textContent = 'あと ' + left + ' かい';
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);

    if (press) {
      // 押しつづけている間は たまりつづける
      gauge.value += (now - gauge.last) / st.holdMs;
      gauge.last = now;
      gauge.fading = false;
      paint();
      if (gauge.value >= FULL) commit();
      return;
    }

    // 指が離れているとき: しばらく待ってから ゆっくり戻す
    if (now - gauge.last <= IDLE_MS) return;

    if (!gauge.fading) {
      gauge.fading = true;
      gauge.fadeFrom = gauge.value;
      gauge.fadeAt = now;
    }
    gauge.value = gauge.fadeFrom * (1 - (now - gauge.fadeAt) / FADE_MS);
    if (gauge.value <= 0) { resetGauge(); return; }
    paint();
  }

  function ensureLoop() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  /* ---------- 指の出入り ---------- */
  function onDown(e) {
    if (st.busy || press) return;
    e.preventDefault();
    var card = e.currentTarget;
    var idx = parseInt(card.dataset.idx, 10);

    // ちがう写真に移ったら、ためていたぶんは いったん捨てる
    if (gauge.idx !== idx) { resetGauge(); gauge.idx = idx; }

    try { card.setPointerCapture(e.pointerId); } catch (err) {}

    press = { idx: idx, card: card, pointerId: e.pointerId, at: gauge.value };
    gauge.last = performance.now();
    gauge.fading = false;

    // 画面が裏に回ると requestAnimationFrame が止まるので、
    // 長押しの成立だけは setTimeout でも見張っておく
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      if (press) { gauge.value = 1; commit(); }
    }, Math.max(60, (1 - gauge.value) * st.holdMs));

    snd('unlock');
    clearTimeout(chargeTimer);
    chargeTimer = setTimeout(function () {
      if (press) snd('chargeStart', st.holdMs - 200);
    }, 200);
    paint();
    ensureLoop();
  }

  function onUp(e) {
    if (!press) return;
    if (e && e.pointerId !== undefined && press.pointerId !== undefined &&
        e.pointerId !== press.pointerId) return;

    var card = press.card;
    var gained = gauge.value - press.at;
    var quantum = 1 / st.taps;

    // 一瞬しか触れていなくても、1回ぶんは必ず たまるようにする（連打むけ）
    if (gained < quantum) gauge.value = press.at + quantum;
    gauge.value = Math.round(gauge.value * 1000) / 1000;

    try { card.releasePointerCapture(press.pointerId); } catch (err) {}
    press = null;
    gauge.last = performance.now();
    gauge.fading = false;

    clearTimeout(chargeTimer);
    clearTimeout(holdTimer);
    snd('chargeStop');
    if (gauge.value < FULL) snd('tick', Math.min(1, gauge.value));

    paint();
    if (gauge.value >= FULL) { commit(); return; }

    ensureLoop();
    // rAF が止まっていても、放置ぶんは必ず戻す
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      if (!press && gauge.value > 0) resetGauge();
    }, IDLE_MS + FADE_MS + 60);
  }

  function commit() {
    if (st.busy) return;
    var idx = gauge.idx;
    if (idx < 0) return;

    st.busy = true;
    clearTimeout(chargeTimer);
    clearTimeout(holdTimer);
    press = null;
    resetGauge();

    st.counts[idx]++;
    st.cast++;
    saveSession();
    updateRemain();
    snd('cast');

    showCast(idx);
  }

  function showCast(idx) {
    var url = st.urls[idx];
    el.overlay.style.setProperty('--slot', 'var(--c' + (idx + 1) + ')');

    var old = el.frame.querySelector('.cast-no');
    if (old) el.frame.removeChild(old);

    if (url) {
      global.Store.attachImage(el.castImg, url);
      el.castImg.style.display = '';
    } else {
      // 画像が入っていない枠は、番号を大きく出す
      el.castImg.removeAttribute('src');
      el.castImg.style.display = 'none';
      var no = document.createElement('div');
      no.className = 'cast-no';
      no.textContent = String(idx + 1);
      el.frame.appendChild(no);
    }
    var nameEl = document.getElementById('cast-name');
    if (nameEl) {
      nameEl.textContent = st.names[idx] || '';
      nameEl.style.display = st.names[idx] ? '' : 'none';
    }

    el.overlay.classList.add('show');
    if (global.Fx) global.Fx.confetti(18, { burst: true });

    setTimeout(function () {
      el.overlay.classList.remove('show');
      st.busy = false;
      if (st.cast >= st.total) finish();
    }, 1200);
  }

  function updateRemain() {
    var left = Math.max(0, st.total - st.cast);
    el.remain.textContent = String(left);
    el.pips.innerHTML = '';
    el.pips.dataset.size = st.total > 24 ? 's' : (st.total > 14 ? 'm' : 'l');
    var show = Math.min(st.total, 40);              // 多すぎるときは ● を省略
    for (var i = 0; i < show; i++) {
      var p = document.createElement('div');
      p.className = 'pip' + (i < st.cast ? ' used' : '');
      el.pips.appendChild(p);
    }
  }

  function finish() {
    clearSession();
    global.App.onVoteFinished(st.counts.slice(0, st.imageCount));
  }

  /* ---------- 中断（✕ の長押し） ---------- */
  function bindAbort(onAbort) {
    if (!el.abort) cache();
    var ABORT_MS = 1500;
    function down(e) {
      e.preventDefault();
      el.abort.classList.add('charging');
      abortHold = setTimeout(function () {
        el.abort.classList.remove('charging');
        abortHold = null;
        onAbort();
      }, ABORT_MS);
    }
    function up() {
      el.abort.classList.remove('charging');
      if (abortHold) { clearTimeout(abortHold); abortHold = null; }
    }
    el.abort.addEventListener('pointerdown', down);
    el.abort.addEventListener('pointerup', up);
    el.abort.addEventListener('pointerleave', up);
    el.abort.addEventListener('pointercancel', up);
  }

  function stop() {
    clearTimeout(chargeTimer);
    clearTimeout(holdTimer);
    press = null;
    resetGauge();
    snd('chargeStop');
    if (el.overlay) el.overlay.classList.remove('show');
    st.busy = false;
  }

  global.Vote = {
    start: start,
    stop: stop,
    bindAbort: bindAbort,
    hasUnfinished: hasUnfinished,
    clearSession: clearSession,
    counts: function () { return st.counts.slice(0, st.imageCount); }
  };
})(window);
