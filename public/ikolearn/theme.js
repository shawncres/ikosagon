/*
 * IkoLearn light and dark (PR 102). The page follows the device (prefers-color-scheme) until the learner picks one with
 * the small sun/moon button; that choice is kept on this device only (localStorage "ikolearn-theme", outside the
 * "ikolearn." keys, so it is never part of a learner's cloud, an IkoCloud file or a reset). The <head> of each page sets
 * html[data-theme] before the first paint (see HEAD below); this file keeps it in step afterwards, sets the browser's
 * theme-color, re-tones the colours set from script (cards, the cloud's points and lines) and draws the button.
 */
(function (root) {
  "use strict";
  var KEY = "ikolearn-theme", FONT_KEY = "ikolearn-font", SIZE_KEY = "ikolearn-size", doc = root.document;
  var SIZES = { small: "0.88", "default": "1", large: "1.16" };
  var THEMES = ["light", "dark", "ikosagon"]; /* more names can be added here, with a matching html[data-theme] palette */
  var BAR = { light: "#f3ead8", dark: "#1e1712", ikosagon: "#000000" }; /* the browser's bar: the page's own paper */
  var FONTS = {
    current: "",
    futura: "Futura, 'Century Gothic', 'Avenir Next', Avenir, 'Trebuchet MS', sans-serif",
    sans: "system-ui, 'Segoe UI', sans-serif",
    palatino: "'Palatino Linotype', Palatino, 'Iowan Old Style', Georgia, serif"
  };
  var mq = root.matchMedia ? root.matchMedia("(prefers-color-scheme: dark)") : null;
  function saved() { try { var v = root.localStorage.getItem(KEY); return THEMES.indexOf(v) >= 0 ? v : null; } catch { return null; } }
  function system() { return mq && mq.matches ? "dark" : "light"; }
  function mode() { return saved() || system(); }
  function dark() { return doc.documentElement.getAttribute("data-theme") === "dark"; }
  function night() { var t = doc.documentElement.getAttribute("data-theme"); return t === "dark" || t === "ikosagon"; }
  function fontName() { try { var v = root.localStorage.getItem(FONT_KEY); return v && FONTS[v] ? v : "current"; } catch { return "current"; } }
  function sizeName() { try { var v = root.localStorage.getItem(SIZE_KEY); return SIZES[v] ? v : "default"; } catch { return "default"; } }

  /* a colour made for paper, toned for the dark page: the same hue, a little quieter, light enough to read (WCAG AA) */
  var HSL = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;
  function forDark(c) {
    var m = HSL.exec(String(c || "").trim());
    if (!m) return c;
    var h = +m[1], s = Math.round(+m[2] * 0.75), l = Math.round(Math.min(84, Math.max(66, 94 - +m[3] * 0.5)));
    return m[4] != null ? "hsla(" + h + ", " + s + "%, " + l + "%, " + m[4] + ")" : "hsl(" + h + ", " + s + "%, " + l + "%)";
  }
  function tone(c) { return night() ? forDark(c) : c; }
  /* set colour custom properties from script, remembered so a change of theme re-tones them in place */
  function paint(el, props) {
    if (!el) return;
    var keep = {};
    try { keep = JSON.parse(el.getAttribute("data-tone") || "{}"); } catch { keep = {}; }
    Object.keys(props).forEach(function (k) { if (props[k] == null) return; keep[k] = props[k]; el.style.setProperty(k, tone(props[k])); });
    el.setAttribute("data-tone", JSON.stringify(keep));
  }
  function repaint() {
    doc.querySelectorAll("[data-tone]").forEach(function (el) {
      var keep = {}; try { keep = JSON.parse(el.getAttribute("data-tone")); } catch { return; }
      Object.keys(keep).forEach(function (k) { el.style.setProperty(k, tone(keep[k])); });
    });
  }
  /* the cloud canvas reads these: ink for lines and labels, paper for the plates under them */
  function inks() { var cs = root.getComputedStyle(doc.documentElement); return { ink: cs.getPropertyValue("--ink").trim() || "#2b2118", paper: cs.getPropertyValue("--paper").trim() || "#f3ead8", line: cs.getPropertyValue("--line").trim() || cs.getPropertyValue("--ink").trim() || "#2b2118" }; }

  function bar(m) { doc.querySelectorAll('meta[name="theme-color"]').forEach(function (t) { if (!t.media) t.setAttribute("content", BAR[m] || BAR.light); }); }
  function applyFont(name) {
    var st = doc.documentElement.style;
    if (!st || !st.setProperty) return;
    if (!FONTS[name]) name = "current";
    if (!FONTS[name]) st.removeProperty("--font-ui");
    else st.setProperty("--font-ui", FONTS[name]);
  }
  function apply(m) {
    if (THEMES.indexOf(m) < 0) m = system();
    var was = doc.documentElement.getAttribute("data-theme");
    doc.documentElement.setAttribute("data-theme", m);
    bar(m);
    doc.querySelectorAll(".theme-tg").forEach(label);
    if (was !== m) { repaint(); try { root.dispatchEvent(new root.CustomEvent("ikotheme", { detail: { theme: m } })); } catch { /* old browsers */ } }
  }
  var easeT = 0;
  function set(m) {
    var de = doc.documentElement; de.classList.add("theme-easing"); clearTimeout(easeT); easeT = setTimeout(function () { de.classList.remove("theme-easing"); }, 400); /* a quiet cross-fade (none with reduced motion) */
    if (m && THEMES.indexOf(m) < 0) m = null;
    try { if (m) root.localStorage.setItem(KEY, m); else root.localStorage.removeItem(KEY); } catch { /* private mode: this visit only */ } apply(m || system()); }
  function setFont(name) {
    if (!name || name === "current" || !FONTS[name]) name = "current";
    try { if (name === "current") root.localStorage.removeItem(FONT_KEY); else root.localStorage.setItem(FONT_KEY, name); } catch { /* this visit only */ }
    applyFont(name);
  }
  function applySize(name) {
    if (!SIZES[name]) name = "default";
    var de = doc.documentElement;
    if (name === "default") { if (de.removeAttribute) de.removeAttribute("data-size"); }
    else if (de.setAttribute) de.setAttribute("data-size", name);
    if (de.style && de.style.setProperty) de.style.setProperty("--text-scale", SIZES[name]);
  }
  function setSize(name) {
    if (!SIZES[name] || name === "default") name = "default";
    try { if (name === "default") root.localStorage.removeItem(SIZE_KEY); else root.localStorage.setItem(SIZE_KEY, name); } catch { /* this visit only */ }
    applySize(name);
  }
  function toggle() { set(dark() ? "light" : "dark"); }

  var SUN = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" stroke-width="1.4"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2M4.2 4.2l1.5 1.5M14.3 14.3l1.5 1.5M4.2 15.8l1.5-1.5M14.3 5.7l1.5-1.5"/></g></svg>';
  var MOON = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M15.6 12.6A6.6 6.6 0 0 1 7.4 4.4a6.6 6.6 0 1 0 8.2 8.2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  function label(b) {
    var d = dark();
    b.innerHTML = d ? SUN : MOON; /* what a tap brings */
    b.setAttribute("aria-label", d ? "Light mode" : "Dark mode");
    b.setAttribute("aria-pressed", d ? "true" : "false");
    b.title = d ? "Light mode" : "Dark mode";
  }
  /* the small sun/moon button: a 44px target that looks like one quiet glyph in the fine print */
  function button() {
    var b = doc.createElement("button");
    b.type = "button"; b.className = "theme-tg";
    label(b);
    b.addEventListener("click", function (e) { e.preventDefault(); toggle(); });
    return b;
  }
  /* into the fine print of each place (the welcome, the cloud's footer, the chat dock, the family pages) */
  function mount(sel) {
    doc.querySelectorAll(sel).forEach(function (p) {
      if (p.querySelector(".theme-tg")) return;
      p.appendChild(doc.createTextNode(" · "));
      p.appendChild(button());
    });
  }

  if (mq) { var follow = function () { if (!saved()) apply(system()); }; if (mq.addEventListener) mq.addEventListener("change", follow); else if (mq.addListener) mq.addListener(follow); }
  root.addEventListener("storage", function (e) { if (e.key === KEY) apply(mode()); }); /* another tab changed it */
  apply(mode());
  applyFont(fontName());
  applySize(sizeName());
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { mount("[data-theme-slot]"); });
  else mount("[data-theme-slot]");

  root.IkoTheme = { KEY: KEY, FONT_KEY: FONT_KEY, SIZE_KEY: SIZE_KEY, SIZES: SIZES, BAR: BAR, THEMES: THEMES, FONTS: FONTS, mode: mode, saved: saved, dark: dark, night: night, font: fontName, size: sizeName, set: set, setFont: setFont, setSize: setSize, toggle: toggle, tone: tone, forDark: forDark, paint: paint, inks: inks, button: button, mount: mount };
})(typeof window !== "undefined" ? window : globalThis);
