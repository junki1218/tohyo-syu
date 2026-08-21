/* =========================================================
   store.js  設定と画像の保存
   - 設定       : localStorage
   - 画像       : IndexedDB(Blob)。localStorage の 5MB 制限を避ける
   ========================================================= */
(function (global) {
  'use strict';

  var LS_KEY = 'votingApp.settings.v1';
  var DB_NAME = 'votingAppDB';
  var DB_STORE = 'images';
  var MAX_EDGE = 1024;      // 長辺をここまで縮小
  var JPEG_Q = 0.85;

  /* 最初から入れておく絵と、その下に出す名前。
     設定で写真を入れ替えたら そちらが優先され、消すと ここに戻る。 */
  var DEFAULT_IMAGES = [
    'ICON/03_platform_wait_boy.png',
    'ICON/17_itadakimasu_boy.png',
    'ICON/26_skytree_observe_lookdown_boy.png',
    'ICON/38_sleep_girl.png',
    'ICON/44_aquarium_tunnel_boy.png'
  ];
  var DEFAULT_NAMES = ['しんかんせん', 'ごはん', 'スカイツリー', 'おとまり', 'アクアパーク'];

  var DEFAULTS = {
    imageCount: 5,          // つかう画像の枚数 (2〜5)
    totalVotes: 28,         // クラス合計の票数
    revealMode: true,       // 結果発表モード(逆順・1つずつ)
    showNumber: true,       // 画像に 1〜5 のバッジを出す
    sound: true,            // 効果音
    holdMs: 1200,           // 長押しで確定するまでの時間
    tapsToVote: 10,         // 連打で確定するまでの回数
    deviceId: null,         // 子機の識別子(2文字)
    names: null             // 絵の下に出す名前。null なら既定の名前を使う
  };

  /* ---------- 設定 ---------- */
  var settings = null;

  function loadSettings() {
    var s = {};
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (raw) s = JSON.parse(raw) || {};
    } catch (e) { s = {}; }

    settings = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      settings[k] = (s[k] === undefined || s[k] === null) ? DEFAULTS[k] : s[k];
    });
    if (!settings.deviceId) {
      settings.deviceId = makeDeviceId();
      saveSettings();
    }
    if (!Array.isArray(settings.names) || settings.names.length !== 5) {
      settings.names = DEFAULT_NAMES.slice();
      saveSettings();
    }
    return settings;
  }

  function saveSettings() {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(settings)); }
    catch (e) { /* プライベートブラウズ等。保存できなくても動作は続ける */ }
  }

  function get() { return settings || loadSettings(); }

  function set(key, value) {
    get()[key] = value;
    saveSettings();
  }

  /* 紛らわしい文字(0/O, 1/I, 8/B 等)を除いた 2 文字 */
  function makeDeviceId() {
    var CH = '23456789ACDEFGHJKLMNPQRTUVWXY';
    var a = '';
    for (var i = 0; i < 2; i++) a += CH.charAt(Math.floor(Math.random() * CH.length));
    return a;
  }

  /* ---------- IndexedDB ---------- */
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(DB_STORE, mode);
        var store = t.objectStore(DB_STORE);
        var out = fn(store);
        t.oncomplete = function () {
          resolve(out instanceof global.IDBRequest ? out.result : out);
        };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  /* index: 0〜4 */
  function putImage(index, blob) { return tx('readwrite', function (s) { return s.put(blob, index); }); }
  function delImage(index) { return tx('readwrite', function (s) { return s.delete(index); }); }
  function getImage(index) { return tx('readonly', function (s) { return s.get(index); }); }
  function clearImages() { return tx('readwrite', function (s) { return s.clear(); }); }

  /* 表示に使う URL を用意する。
     取り込んだ写真があればそれを、なければ ICON/ の既定の絵を使う。 */
  var urlCache = DEFAULT_IMAGES.slice();           // 実際に表示する URL
  var objectUrls = [null, null, null, null, null]; // 後始末が要る blob URL だけ
  var customFlags = [false, false, false, false, false];

  function loadAllUrls() {
    revokeUrls();
    var jobs = [0, 1, 2, 3, 4].map(function (i) {
      return getImage(i).then(function (blob) {
        return blob ? global.URL.createObjectURL(blob) : null;
      }).catch(function () { return null; });
    });
    return Promise.all(jobs).then(function (list) {
      objectUrls = list;
      customFlags = list.map(function (u) { return !!u; });
      urlCache = list.map(function (u, i) { return u || DEFAULT_IMAGES[i] || null; });
      return urlCache;
    });
  }

  function revokeUrls() {
    objectUrls.forEach(function (u) { if (u) { try { global.URL.revokeObjectURL(u); } catch (e) {} } });
    objectUrls = [null, null, null, null, null];
    urlCache = DEFAULT_IMAGES.slice();
    customFlags = [false, false, false, false, false];
  }

  function urls() { return urlCache; }

  /* img に src を当てる。読み込みに失敗したら 少し待って 2回まで やり直す。
     簡易サーバは 大きい画像を同時に返すと たまに接続を切るため。 */
  function attachImage(img, url, tries) {
    tries = tries || 0;
    img.onerror = function () {
      if (tries >= 2) { img.onerror = null; return; }
      setTimeout(function () {
        attachImage(img, url, tries + 1);
      }, 250 * (tries + 1));
    };
    img.src = /^blob:/.test(url) || tries === 0
            ? url
            : url + (url.indexOf('?') < 0 ? '?' : '&') + 'r=' + tries;
  }
  function isCustom(i) { return !!customFlags[i]; }
  function hasDefault(i) { return !!DEFAULT_IMAGES[i]; }
  function nameOf(i) {
    var n = get().names;
    var v = n && n[i];
    return (v === undefined || v === null) ? (DEFAULT_NAMES[i] || '') : v;
  }
  function setName(i, value) {
    var n = get().names.slice();
    n[i] = value;
    set('names', n);
  }

  /* ---------- 画像の縮小 ---------- */
  function shrinkToBlob(file) {
    return new Promise(function (resolve, reject) {
      var url = global.URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        global.URL.revokeObjectURL(url);
        cv.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('canvas.toBlob failed'));
        }, 'image/jpeg', JPEG_Q);
      };
      img.onerror = function () {
        global.URL.revokeObjectURL(url);
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  }

  function resetAll() {
    try { global.localStorage.removeItem(LS_KEY); } catch (e) {}
    settings = null;
    return clearImages().then(function () { revokeUrls(); loadSettings(); });
  }

  global.Store = {
    DEFAULTS: DEFAULTS,
    load: loadSettings,
    get: get,
    set: set,
    save: saveSettings,
    putImage: putImage,
    delImage: delImage,
    getImage: getImage,
    clearImages: clearImages,
    loadAllUrls: loadAllUrls,
    urls: urls,
    attachImage: attachImage,
    isCustom: isCustom,
    hasDefault: hasDefault,
    nameOf: nameOf,
    setName: setName,
    DEFAULT_NAMES: DEFAULT_NAMES,
    shrinkToBlob: shrinkToBlob,
    resetAll: resetAll,
    makeDeviceId: makeDeviceId
  };
})(window);
