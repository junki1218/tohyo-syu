/* =========================================================
   settings.js  せってい画面
   ========================================================= */
(function (global) {
  'use strict';

  var MIN_VOTES = 1, MAX_VOTES = 40;
  var HOLDS = [{ v: 700, t: 'みじかい' }, { v: 1200, t: 'ふつう' }, { v: 2000, t: 'ながい' }];
  var TAPS  = [5, 10, 15, 20];

  var el = {};
  var pickingSlot = -1;

  function cache() {
    el.segCount = document.getElementById('seg-imgcount');
    el.slots = document.getElementById('img-slots');
    el.fileInput = document.getElementById('file-input');
    el.votes = document.getElementById('votes-value');
    el.tgReveal = document.getElementById('tg-reveal');
    el.tgNumber = document.getElementById('tg-number');
    el.tgSound = document.getElementById('tg-sound');
    el.segHold = document.getElementById('seg-hold');
    el.segTaps = document.getElementById('seg-taps');
    el.devId = document.getElementById('device-id');
  }

  function render() {
    if (!el.slots) cache();
    var s = global.Store.get();

    // まいすう
    el.segCount.innerHTML = '';
    [2, 3, 4, 5].forEach(function (n) {
      var b = document.createElement('button');
      b.textContent = String(n);
      if (n === s.imageCount) b.classList.add('on');
      b.addEventListener('click', function () {
        global.Store.set('imageCount', n);
        if (global.Snd) global.Snd.tap();
        render();
      });
      el.segCount.appendChild(b);
    });

    // ながおし
    el.segHold.innerHTML = '';
    HOLDS.forEach(function (h) {
      var b = document.createElement('button');
      b.textContent = h.t;
      b.style.minWidth = '84px';
      if (h.v === s.holdMs) b.classList.add('on');
      b.addEventListener('click', function () {
        global.Store.set('holdMs', h.v);
        if (global.Snd) global.Snd.tap();
        render();
      });
      el.segHold.appendChild(b);
    });

    // とんとん(連打)の回数
    el.segTaps.innerHTML = '';
    TAPS.forEach(function (n) {
      var b = document.createElement('button');
      b.textContent = String(n) + 'かい';
      b.style.minWidth = '84px';
      if (n === s.tapsToVote) b.classList.add('on');
      b.addEventListener('click', function () {
        global.Store.set('tapsToVote', n);
        if (global.Snd) global.Snd.tap();
        render();
      });
      el.segTaps.appendChild(b);
    });

    el.votes.textContent = String(s.totalVotes);
    setToggle(el.tgReveal, s.revealMode);
    setToggle(el.tgNumber, s.showNumber);
    setToggle(el.tgSound, s.sound);
    el.devId.textContent = s.deviceId;

    renderSlots();
  }

  function renderSlots() {
    var cfg = global.Store.get();
    var urls = global.Store.urls();
    el.slots.innerHTML = '';

    for (var i = 0; i < cfg.imageCount; i++) {
      (function (idx) {
        var cell = document.createElement('div');
        cell.className = 'img-cell slot-c' + (idx + 1);

        var slot = document.createElement('div');
        slot.className = 'img-slot';

        var badge = document.createElement('div');
        badge.className = 'badge'; badge.textContent = String(idx + 1);
        slot.appendChild(badge);

        if (urls[idx]) {
          slot.classList.add('filled');
          var img = document.createElement('img');
          img.alt = '';
          global.Store.attachImage(img, urls[idx]);
          slot.appendChild(img);
        } else {
          var plus = document.createElement('div');
          plus.className = 'plus'; plus.textContent = '＋';
          slot.appendChild(plus);
          var t = document.createElement('div');
          t.textContent = 'しゃしんを えらぶ';
          slot.appendChild(t);
        }

        // 自分で入れた写真のときだけ「もどす／けす」を出す
        if (global.Store.isCustom(idx)) {
          var clr = document.createElement('button');
          clr.className = 'clear';
          clr.textContent = global.Store.hasDefault(idx) ? 'もどす' : 'けす';
          clr.addEventListener('click', function (e) {
            e.stopPropagation();
            global.Store.delImage(idx)
              .then(global.Store.loadAllUrls)
              .then(renderSlots);
          });
          slot.appendChild(clr);
        }

        slot.addEventListener('click', function () {
          pickingSlot = idx;
          el.fileInput.click();
        });
        cell.appendChild(slot);

        // 絵の下に出す名前
        var name = document.createElement('input');
        name.type = 'text';
        name.className = 'name-input';
        name.maxLength = 12;
        name.value = global.Store.nameOf(idx);
        name.placeholder = 'なまえ';
        name.addEventListener('input', function () {
          global.Store.setName(idx, name.value.trim());
        });
        cell.appendChild(name);

        el.slots.appendChild(cell);
      })(i);
    }
  }

  function setToggle(node, on) { node.classList.toggle('on', !!on); }

  function bindToggle(node, key) {
    node.addEventListener('click', function () {
      var v = !global.Store.get()[key];
      global.Store.set(key, v);
      setToggle(node, v);
      if (key === 'sound' && v && global.Snd) { global.Snd.unlock(); global.Snd.ok(); }
      else if (global.Snd) global.Snd.tap();
    });
  }

  function bind() {
    cache();

    el.fileInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f || pickingSlot < 0) return;
      var idx = pickingSlot; pickingSlot = -1;

      global.App.toast('とりこんで います…');
      global.Store.shrinkToBlob(f)
        .then(function (blob) { return global.Store.putImage(idx, blob); })
        .then(global.Store.loadAllUrls)
        .then(function () {
          renderSlots();
          global.App.toast((idx + 1) + 'ばんの しゃしんを とりこみました');
          if (global.Snd) global.Snd.ok();
        })
        .catch(function () {
          global.App.toast('この がぞうは とりこめませんでした', true);
        });
    });

    document.getElementById('votes-minus').addEventListener('click', function () {
      var v = Math.max(MIN_VOTES, global.Store.get().totalVotes - 1);
      global.Store.set('totalVotes', v);
      el.votes.textContent = String(v);
      if (global.Snd) global.Snd.tap();
    });
    document.getElementById('votes-plus').addEventListener('click', function () {
      var v = Math.min(MAX_VOTES, global.Store.get().totalVotes + 1);
      global.Store.set('totalVotes', v);
      el.votes.textContent = String(v);
      if (global.Snd) global.Snd.tap();
    });

    bindToggle(el.tgReveal, 'revealMode');
    bindToggle(el.tgNumber, 'showNumber');
    bindToggle(el.tgSound, 'sound');

    document.getElementById('btn-reset').addEventListener('click', function () {
      if (!global.confirm('がぞうと せっていを ぜんぶ けします。よろしいですか？')) return;
      global.Store.resetAll()
        .then(global.Store.loadAllUrls)
        .then(function () {
          render();
          global.App.toast('けしました');
        });
    });
  }

  /* 投票を始められる状態か */
  function readyCheck() {
    var s = global.Store.get();
    var urls = global.Store.urls();
    var missing = [];
    for (var i = 0; i < s.imageCount; i++) if (!urls[i]) missing.push(i + 1);
    return missing;
  }

  global.Settings = { bind: bind, render: render, readyCheck: readyCheck };
})(window);
