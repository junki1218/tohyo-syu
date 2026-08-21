/* =========================================================
   parent.js  おやきモード
   子機の QR を よみとって ためていき、「しゅうけい する」で合計。
   台数は 決めず、先生が 手で 締める。
   同じ たんまつを 2回 よみこんだ ときは 警告を 出す。
   ========================================================= */
(function (global) {
  'use strict';

  var STORE_KEY = 'votingApp.parentScans.v1';

  var scans = [];            // [{deviceId, counts:[5], src:'cam'|'file'|'manual'}]
  var stream = null;
  var loopId = 0;
  var lastHit = 0;

  var el = {};
  function cache() {
    el.video = document.getElementById('scan-video');
    el.box = document.getElementById('scan-video-box');
    el.msg = document.getElementById('scan-msg');
    el.list = document.getElementById('scan-list');
    el.count = document.getElementById('scan-count');
    el.manual = document.getElementById('manual-input');
    el.fileInput = document.getElementById('qr-file-input');
    el.total = document.getElementById('btn-parent-total');
  }

  function persist() {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(scans)); } catch (e) {}
  }
  function restore() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      scans = raw ? (JSON.parse(raw) || []) : [];
    } catch (e) { scans = []; }
  }

  /* ---------- 追加 ---------- */
  function add(parsed, src) {
    if (!parsed) { global.App.toast('よみとれませんでした', true); return false; }

    if (parsed.deviceId !== '??') {
      var dup = scans.some(function (s) { return s.deviceId === parsed.deviceId; });
      if (dup) {
        global.App.toast('この たんまつ（' + parsed.deviceId + '）は よみこみずみ です', true);
        if (global.Snd) global.Snd.err();
        return false;
      }
    }
    scans.push({ deviceId: parsed.deviceId, counts: parsed.counts.slice(0, 5), src: src || 'cam' });
    persist();
    render();
    if (global.Snd) global.Snd.ok();
    global.App.toast('ついか しました（' + parsed.deviceId + '）');
    return true;
  }

  function remove(i) {
    scans.splice(i, 1);
    persist();
    render();
  }

  function clearAll() {
    if (!scans.length) return;
    if (!global.confirm('よみとった データを ぜんぶ けしますか？')) return;
    scans = [];
    persist();
    render();
  }

  function render() {
    if (!el.list) cache();
    el.count.textContent = String(scans.length);
    el.list.innerHTML = '';

    if (!scans.length) {
      var p = document.createElement('div');
      p.className = 'scan-empty';
      p.textContent = 'まだ ありません。QRを よみとるか、コードを てにゅうりょく してください。';
      el.list.appendChild(p);
      el.total.disabled = true;
      return;
    }
    el.total.disabled = false;

    scans.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'scan-item';

      var d = document.createElement('span');
      d.className = 'did'; d.textContent = s.deviceId;
      row.appendChild(d);

      var n = document.createElement('span');
      n.className = 'nums';
      n.textContent = s.counts.map(function (c, k) { return (k + 1) + 'ばん:' + c; }).join('　');
      row.appendChild(n);

      var del = document.createElement('button');
      del.className = 'del'; del.textContent = '✕'; del.title = 'けす';
      del.addEventListener('click', function () { remove(i); });
      row.appendChild(del);

      el.list.appendChild(row);
    });
  }

  /* ---------- カメラ ---------- */
  function camStart() {
    if (!el.video) cache();
    if (stream) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      el.msg.textContent = 'この ブラウザでは カメラが つかえません。てにゅうりょく を つかってください。';
      return;
    }
    if (location.protocol === 'file:') {
      el.msg.textContent = 'ファイルを 直接ひらいた ときは カメラが つかえません。'
                         + 'ローカルサーバ か https で ひらいてください。';
      return;
    }

    el.msg.textContent = 'カメラを きどう しています…';
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }).then(function (s) {
      stream = s;
      el.video.srcObject = s;
      el.video.setAttribute('playsinline', '');
      return el.video.play();
    }).then(function () {
      el.msg.textContent = 'わくの なかに QRを あわせて ください';
      tick();
    }).catch(function (err) {
      el.msg.textContent = 'カメラを ひらけません（' + (err && err.name ? err.name : 'error') + '）。'
                         + 'てにゅうりょく か がぞうファイル を つかってください。';
    });
  }

  function camStop() {
    if (loopId) { cancelAnimationFrame(loopId); loopId = 0; }
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    if (el.video) el.video.srcObject = null;
    if (el.msg) el.msg.textContent = '「カメラを つかう」を おしてください';
    if (el.box) el.box.classList.remove('hit');
  }

  function tick() {
    loopId = requestAnimationFrame(tick);
    if (!stream || el.video.readyState < 2) return;

    var now = performance.now();
    if (now - lastHit < 1200) return;          // 連続ヒット防止

    var text = global.QR.scanVideo(el.video);
    if (!text) { el.box.classList.remove('hit'); return; }

    var parsed = global.QR.decode(text);
    if (!parsed) return;

    lastHit = now;
    el.box.classList.add('hit');
    add(parsed, 'cam');
    setTimeout(function () { if (el.box) el.box.classList.remove('hit'); }, 500);
  }

  /* ---------- ファイル / てにゅうりょく ---------- */
  function fromFile(file) {
    if (!file) return;
    global.QR.scanFile(file).then(function (text) {
      if (!text) { global.App.toast('この がぞうから QRが みつかりません', true); return; }
      add(global.QR.decode(text), 'file');
    });
  }

  function fromManual() {
    var v = (el.manual.value || '').trim();
    if (!v) return;
    var parsed = global.QR.decode(v);
    if (!parsed) { global.App.toast('コードの かたちが ちがいます', true); return; }
    if (add(parsed, 'manual')) el.manual.value = '';
  }

  /* ---------- 合計 ---------- */
  function totals() {
    var t = [0, 0, 0, 0, 0];
    scans.forEach(function (s) {
      for (var i = 0; i < 5; i++) t[i] += (s.counts[i] || 0);
    });
    return t;
  }

  function displayCount() {
    var t = totals();
    var last = 0;
    for (var i = 0; i < 5; i++) if (t[i] > 0) last = i + 1;
    return Math.max(global.Store.get().imageCount, last, 2);
  }

  function bind() {
    cache();
    restore();
    render();

    document.getElementById('btn-cam-start').addEventListener('click', camStart);
    document.getElementById('btn-cam-stop').addEventListener('click', camStop);
    document.getElementById('btn-pick-image').addEventListener('click', function () {
      el.fileInput.click();
    });
    el.fileInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      fromFile(f);
      e.target.value = '';
    });
    document.getElementById('btn-manual-add').addEventListener('click', fromManual);
    el.manual.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); fromManual(); }
    });
    document.getElementById('btn-clear-scans').addEventListener('click', clearAll);
    el.total.addEventListener('click', function () {
      if (!scans.length) return;
      camStop();
      global.App.onParentTotal(totals(), displayCount(), scans.length);
    });
  }

  global.Parent = {
    bind: bind, render: render, camStart: camStart, camStop: camStop,
    totals: totals, count: function () { return scans.length; }
  };
})(window);
