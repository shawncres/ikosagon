/* IkoLearn sound (PR 120): optional, quiet, made in the browser with the Web Audio API, so there are no files to
   download and nothing loads until the first sound is used. Default on but very soft; one switch in Preferences, or ask
   Iko to "turn sounds off". Three sounds only: a warm confirmation when a card is earned (<300 ms), a gentle tap on
   primary actions, and a barely-audible looping ambient bed on the cloud view that fades in and out. Silent under
   prefers-reduced-motion, while the tab is hidden, and when the device is muted (the AudioContext follows it). */
(function (root) {
  "use strict";
  var KEY = "ikolearn-sound", ctx = null, master = null, amb = null, lastTap = 0;
  function on() { try { return localStorage.getItem(KEY) !== "off"; } catch (e) { return true; } }
  function quiet() { return (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) || document.hidden; }
  function ac() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(function () {}); return ctx; }
    var A = root.AudioContext || root.webkitAudioContext; if (!A) return null;
    try { ctx = new A(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  function tone(freqs, dur, vol) {
    if (!on() || quiet()) return; var c = ac(); if (!c) return;
    var t = c.currentTime, g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master);
    freqs.forEach(function (f, i) { var o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f, t + i * 0.06); o.connect(g); o.start(t + i * 0.06); o.stop(t + dur + 0.02); });
  }
  function earn() { tone([523.25, 659.25, 783.99], 0.28, 0.06); } /* C-E-G, soft, 280 ms */
  function tap() { var n = Date.now(); if (n - lastTap < 120) return; lastTap = n; tone([880], 0.07, 0.018); }
  function ambient(want) {
    if (want && (!on() || quiet())) want = false;
    if (want && amb) return;
    if (!want) { if (amb) { var a = amb; amb = null; var t0 = ctx.currentTime; a.g.gain.cancelScheduledValues(t0); a.g.gain.setTargetAtTime(0.0001, t0, 0.4); setTimeout(function () { try { a.src.stop(); a.g.disconnect(); } catch (e) {} }, 2000); } return; }
    var c = ac(); if (!c) return;
    /* 4 s of soft brown noise, looped with a crossfaded seam, through a low-pass: a faint room tone, not music */
    var len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), last = 0, i;
    for (i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    var fade = c.sampleRate * 0.5; for (i = 0; i < fade; i++) { var k = i / fade; d[i] = d[i] * k + d[len - fade + i] * (1 - k); }
    var src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.loopEnd = (len - fade) / c.sampleRate;
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    var g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.022, c.currentTime, 1.2);
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
    amb = { src: src, g: g };
  }
  function set(v) { try { localStorage.setItem(KEY, v ? "on" : "off"); } catch (e) {} if (!v) ambient(false); }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", function () { if (document.hidden) ambient(false); else if (SND.cloudOn) ambient(true); });
  /* tap: primary actions only (never text input, scrolling or routine navigation) */
  if (typeof document !== "undefined") document.addEventListener("click", function (e) { var b = e.target && e.target.closest && e.target.closest(".btn.draw, .btn.primary, [data-snd=tap]"); if (b && !b.disabled) tap(); }, true);
  var SND = { on: on, set: set, earn: earn, tap: tap, ambient: function (w) { SND.cloudOn = Boolean(w); ambient(w); }, cloudOn: false };
  root.IkoSound = SND;
  if (typeof module !== "undefined") module.exports = SND;
})(typeof window !== "undefined" ? window : globalThis);
