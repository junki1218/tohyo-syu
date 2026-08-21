/* =========================================================
   qr.js  QRコードの生成・読み取り・コード文字列の変換
   ---------------------------------------------------------
   コード書式 :  V1.7K.3-0-5-1-2
                 │  │   └ 1〜5番の得票数（つかう枚数ぶんだけ）
                 │  └ 子機の識別子（2文字）
                 └ 書式バージョン
   すべて英数字と ". -" のみなので QR の英数字モードに収まり、
   セル数が少ない＝遠くからでも読める QR になる。
   ========================================================= */
(function (global) {
  'use strict';

  var VER = 'V1';

  /* ---------- 文字列化 ---------- */
  function encode(deviceId, counts) {
    return VER + '.' + String(deviceId).toUpperCase() + '.' + counts.join('-');
  }

  /* ゆるく解釈する。QRの中身にも 手入力にも 同じものを通す。
     受け付ける例:
       V1.7K.3-0-5-1-2
       7K 3-0-5-1-2
       7k,3,0,5,1,2
     戻り値: {deviceId:'7K', counts:[3,0,5,1,2]} / 失敗時 null   */
  function decode(text) {
    if (!text) return null;
    var s = String(text).toUpperCase().trim();
    s = s.replace(/[！-～]/g, function (c) {       // 全角→半角
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    s = s.replace(/^V\d+[.\s,]+/, '');                      // 先頭の V1. を落とす
    s = s.replace(/[,\s_/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    var parts = s.split(/[.\-]/).filter(function (p) { return p !== ''; });
    if (parts.length < 2) return null;

    var head = parts[0];
    var nums = parts.slice(1);

    // 先頭が数字だけなら 端末IDが省略されたとみなす
    if (/^\d+$/.test(head)) {
      nums = parts.slice(0);
      head = '??';
    } else if (!/^[0-9A-Z]{1,4}$/.test(head)) {
      return null;
    }

    var counts = [];
    for (var i = 0; i < nums.length; i++) {
      if (!/^\d{1,3}$/.test(nums[i])) return null;
      counts.push(parseInt(nums[i], 10));
    }
    if (counts.length < 2 || counts.length > 5) return null;
    while (counts.length < 5) counts.push(0);               // 5枠に揃える

    return { deviceId: head, counts: counts };
  }

  /* ---------- 生成 ---------- */
  function render(el, text, cellSize) {
    el.innerHTML = '';
    var qr = global.qrcode(0, 'M');        // 0 = 型番自動 / M = 誤り訂正 15%
    qr.addData(text);
    qr.make();
    el.innerHTML = qr.createImgTag(cellSize || 8, 12);
  }

  /* ---------- 読み取り ---------- */
  var work = document.createElement('canvas');
  var wctx = work.getContext('2d', { willReadFrequently: true });

  /* video / image いずれかのフレームから 1回だけ探す */
  function scanSource(src, w, h) {
    if (!w || !h) return null;
    var max = 640;                          // 解析は 640px 程度に落とすと速い
    var scale = Math.min(1, max / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    work.width = cw; work.height = ch;
    wctx.drawImage(src, 0, 0, cw, ch);
    var data;
    try { data = wctx.getImageData(0, 0, cw, ch); }
    catch (e) { return null; }              // file:// で画像を読ませたときの汚染対策
    var res = global.jsQR(data.data, cw, ch, { inversionAttempts: 'attemptBoth' });
    return res && res.data ? res.data : null;
  }

  function scanVideo(video) {
    return scanSource(video, video.videoWidth, video.videoHeight);
  }

  function scanFile(file) {
    return new Promise(function (resolve) {
      var url = global.URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var r = scanSource(img, img.naturalWidth, img.naturalHeight);
        global.URL.revokeObjectURL(url);
        resolve(r);
      };
      img.onerror = function () { global.URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  global.QR = {
    encode: encode,
    decode: decode,
    render: render,
    scanVideo: scanVideo,
    scanFile: scanFile
  };
})(window);
