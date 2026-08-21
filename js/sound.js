/* =========================================================
   sound.js  効果音(WebAudio で合成。音源ファイル不要)
   iOS Safari は最初のユーザー操作で resume する必要がある。
   ========================================================= */
(function (global) {
  'use strict';

  var ctx = null;
  var chargeOsc = null, chargeGain = null;

  function enabled() { return global.Store && global.Store.get().sound; }

  function ac() {
    if (!ctx) {
      var C = global.AudioContext || global.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  /* 最初のタッチで解錠（iOS対策） */
  function unlock() {
    var c = ac();
    if (!c) return;
    var b = c.createBuffer(1, 1, 22050);
    var s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  }

  function beep(freq, dur, type, vol) {
    if (!enabled()) return;
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.25, c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }

  /* 長押し中：音がだんだん上がっていく */
  function chargeStart(ms) {
    if (!enabled()) return;
    var c = ac(); if (!c) return;
    chargeStop();
    chargeOsc = c.createOscillator();
    chargeGain = c.createGain();
    chargeOsc.type = 'triangle';
    chargeOsc.frequency.setValueAtTime(330, c.currentTime);
    chargeOsc.frequency.linearRampToValueAtTime(880, c.currentTime + (ms || 1200) / 1000);
    chargeGain.gain.setValueAtTime(0.0001, c.currentTime);
    chargeGain.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 0.06);
    chargeOsc.connect(chargeGain); chargeGain.connect(c.destination);
    chargeOsc.start();
  }

  function chargeStop() {
    if (!chargeOsc) return;
    var c = ctx;
    try {
      chargeGain.gain.cancelScheduledValues(c.currentTime);
      chargeGain.gain.setValueAtTime(chargeGain.gain.value || 0.0001, c.currentTime);
      chargeGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.06);
      chargeOsc.stop(c.currentTime + 0.09);
    } catch (e) {}
    chargeOsc = null; chargeGain = null;
  }

  function cast() {                       // 1票 入った
    chargeStop();
    beep(880, 0.10, 'sine', 0.3);
    setTimeout(function () { beep(1318, 0.22, 'sine', 0.3); }, 90);
  }
  function cancel() { chargeStop(); beep(220, 0.14, 'square', 0.12); }
  function tap() { beep(660, 0.06, 'sine', 0.16); }
  /* 連打1回ぶん。たまってくるほど 音が高くなる */
  function tick(p) { beep(440 + 620 * Math.min(1, p || 0), 0.07, 'sine', 0.2); }
  function reveal() {                     // 棒が伸びるとき
    beep(523, 0.9, 'sine', 0.10);
  }
  function fanfare() {                    // 1位発表
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { beep(f, 0.34, 'sine', 0.26); }, i * 130);
    });
  }
  function ok() { beep(1046, 0.14, 'sine', 0.24); }
  function err() { beep(180, 0.28, 'sawtooth', 0.14); }

  global.Snd = {
    unlock: unlock, tap: tap, cast: cast, cancel: cancel,
    chargeStart: chargeStart, chargeStop: chargeStop, tick: tick,
    reveal: reveal, fanfare: fanfare, ok: ok, err: err
  };
})(window);
