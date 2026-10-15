/* IKOREADTUBE - vanilla JS, no framework, no build step. Videos come only from window.IkoData.loadVideos(). */
(function () {
  "use strict";

  // Where summaries come from. Default: the Next.js route on this site.
  // For the GoDaddy/PHP version, set this to "api/summarize.php" (see README.md).
  var PROXY_URL = window.IKOREADTUBE_PROXY || "/api/ikoreadtube/summarize";
  var LEVELS = ["less", "standard", "more"];
  var LEVEL_LABEL = { less: "LESS", standard: "STANDARD", more: "MORE" };
  var RECENT_KEY = "ikoreadtube.recent";
  var RECENT_MAX = 8;
  var MIN_GEN_MS = 600;
  var REQUEST_TIMEOUT_MS = 20000;

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    feed: $("feed"), recent: $("recent"), recentWrap: $("recent-wrap"), empty: $("empty"), feedTitle: $("feed-title"),
    q: $("q"), searchbar: $("searchbar"),
    sFeed: $("screen-feed"), sGen: $("screen-gen"), sDetail: $("screen-detail"),
    genStep: $("gen-step"), genText: $("gen-text"),
    back: $("btn-back"), less: $("btn-less"), more: $("btn-more"),
    dTitle: $("d-title"), dChan: $("d-chan"), dThumbWrap: $("d-thumb-wrap"), dThumb: $("d-thumb"),
    dLevel: $("d-level"), dText: $("d-text"), dSrc: $("d-src")
  };

  var videos = [];
  var byId = {};
  var screen = "feed";
  var feedScroll = 0;
  var selectedId = null;
  var current = null;      // { id, level }
  var cache = {};          // "id:level" -> { text, source, reason }
  var token = 0;           // cancels stale generations
  var cameFromFeed = false;

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ---------- storage ---------- */
  function readRecent() {
    try {
      var raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (r) { return r && typeof r.id === "string"; }).slice(0, RECENT_MAX);
    } catch { return []; }
  }
  function pushRecent(v) {
    var list = readRecent().filter(function (r) { return r.id !== v.id; });
    list.unshift({ id: v.id, title: v.title });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* private mode: fine */ }
  }

  /* ---------- feed ---------- */
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function makeItem(v, opts) {
    var li = node("li");
    var b = node("button", "item");
    b.type = "button";
    b.setAttribute("data-id", v.id);
    b.appendChild(node("span", "arrow"));
    if (opts.thumb && v.thumb) {
      var img = node("img", "th");
      img.src = v.thumb;
      img.alt = "";
      img.width = 64; img.height = 36;
      img.loading = "lazy";
      b.appendChild(img);
    }
    var t = node("span", "txt");
    t.appendChild(node("span", "t", v.title));
    t.appendChild(node("span", "c", opts.sub));
    b.appendChild(t);
    li.appendChild(b);
    return li;
  }

  function renderFeed() {
    var q = el.q.value.trim().toLowerCase();
    el.feed.textContent = "";
    el.recent.textContent = "";

    var shown = videos.filter(function (v) {
      return !q || (v.title + " " + v.channel).toLowerCase().indexOf(q) !== -1;
    });
    shown.forEach(function (v) { el.feed.appendChild(makeItem(v, { thumb: true, sub: v.channel })); });
    el.empty.hidden = shown.length > 0;
    el.feedTitle.hidden = shown.length === 0;

    var rec = q ? [] : readRecent().filter(function (r) { return byId[r.id]; });
    el.recentWrap.hidden = rec.length === 0;
    rec.forEach(function (r) {
      var v = byId[r.id];
      el.recent.appendChild(makeItem(v, { thumb: false, sub: "ID " + v.id }));
    });
    markSelected();
  }

  function items() { return Array.prototype.slice.call(document.querySelectorAll("#screen-feed .item")); }

  function markSelected() {
    var all = items();
    var found = false;
    all.forEach(function (b) {
      var on = b.getAttribute("data-id") === selectedId && !found;
      if (on) found = true;
      b.classList.toggle("is-sel", on);
    });
    if (!found && all[0] && selectedId == null) all[0].classList.add("is-sel");
  }

  function select(b) {
    selectedId = b.getAttribute("data-id");
    markSelected();
  }

  el.sFeed.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".item") : null;
    if (!b) return;
    select(b);
    cameFromFeed = true;
    location.hash = "#/read/" + encodeURIComponent(b.getAttribute("data-id"));
  });
  el.sFeed.addEventListener("mouseover", function (e) {
    var b = e.target.closest ? e.target.closest(".item") : null;
    if (b) select(b);
  });
  el.sFeed.addEventListener("focusin", function (e) {
    var b = e.target.closest ? e.target.closest(".item") : null;
    if (b) select(b);
  });
  el.sFeed.addEventListener("keydown", function (e) {
    var b = e.target.closest ? e.target.closest(".item") : null;
    if (!b) return;
    var all = items();
    var i = all.indexOf(b);
    var n = null;
    if (e.key === "ArrowDown") n = all[Math.min(all.length - 1, i + 1)];
    else if (e.key === "ArrowUp") { if (i === 0) { el.q.focus(); e.preventDefault(); return; } n = all[i - 1]; }
    else if (e.key === "Home") n = all[0];
    else if (e.key === "End") n = all[all.length - 1];
    if (n) { e.preventDefault(); n.focus(); }
  });

  el.q.addEventListener("input", renderFeed);
  el.q.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      var all = items();
      if (all[0]) { e.preventDefault(); all[0].focus(); }
    } else if (e.key === "Escape" && el.q.value) {
      el.q.value = "";
      renderFeed();
    }
  });

  /* ---------- screens ---------- */
  function show(name) {
    if (screen === "feed" && name !== "feed") feedScroll = window.scrollY || 0;
    screen = name;
    el.sFeed.hidden = name !== "feed";
    el.sGen.hidden = name !== "gen";
    el.sDetail.hidden = name !== "detail";
    el.searchbar.hidden = name !== "feed";
    if (name === "feed") {
      window.scrollTo(0, feedScroll);
      var sel = selectedId && document.querySelector('#screen-feed .item[data-id="' + cssEsc(selectedId) + '"]');
      if (sel) sel.focus({ preventScroll: true });
      window.scrollTo(0, feedScroll);
    } else {
      window.scrollTo(0, 0);
    }
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  /* ---------- summaries ---------- */
  function fallbackText(v, level) {
    var s = v.summaries && v.summaries[level];
    return s || "NO SUMMARY SAVED FOR THIS VIDEO.";
  }

  function reasonFor(status, header) {
    if (header === "no_key") return "NO API KEY ON THE SERVER";
    if (status === 429) return "BUSY, TRY LATER";
    if (status === 0) return "OFFLINE";
    if (status === 404) return "PROXY NOT FOUND";
    return "SERVICE UNAVAILABLE";
  }

  // Asks the proxy. Resolves { text, source: "ai"|"preset", reason }. Never rejects.
  function summarize(v, level) {
    var key = v.id + ":" + level;
    if (cache[key]) return Promise.resolve(cache[key]);
    var preset = function (reason) { return { text: fallbackText(v, level), source: "preset", reason: reason }; };
    if (!v.transcript) return Promise.resolve(preset("NO TRANSCRIPT"));

    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/plain" },
      body: JSON.stringify({ id: v.id, title: v.title, transcript: v.transcript, level: level }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (body) {
        var text = String(body || "").trim();
        if (res.ok && text) {
          var out = { text: text, source: "ai", reason: "" };
          cache[key] = out;
          return out;
        }
        return preset(reasonFor(res.status, res.headers.get("X-Ikoreadtube-Error")));
      });
    }).catch(function () {
      return preset(reasonFor(0, ""));
    }).then(function (r) {
      clearTimeout(timer);
      if (r.source === "preset" && r.reason !== "BUSY, TRY LATER") cache[key] = r;
      return r;
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function paintDetail(v, level, res) {
    var i = LEVELS.indexOf(level);
    el.dTitle.textContent = v.title;
    el.dChan.textContent = v.channel;
    if (v.thumb) {
      el.dThumb.src = v.thumb;
      el.dThumbWrap.hidden = false;
    } else {
      el.dThumbWrap.hidden = true;
    }
    el.dLevel.textContent = "DETAIL " + (i + 1) + "/3: " + LEVEL_LABEL[level];
    el.dText.textContent = res.text;
    el.dSrc.textContent = res.source === "ai" ? "AI SUMMARY" : "PRESET SUMMARY (" + res.reason + ")";
    el.less.disabled = i === 0;
    el.more.disabled = i === LEVELS.length - 1;
    el.less.setAttribute("aria-disabled", String(i === 0));
    el.more.setAttribute("aria-disabled", String(i === LEVELS.length - 1));
  }

  function read(id, level, opts) {
    var v = byId[id];
    if (!v) { location.replace("#/"); return; }
    opts = opts || {};
    var my = ++token;
    current = { id: id, level: level };
    pushRecent(v);
    var key = id + ":" + level;
    if (cache[key]) {
      paintDetail(v, level, cache[key]);
      show("detail");
      if (!opts.keepFocus) el.dTitle.focus({ preventScroll: true });
      else (level === "less" ? el.more : el.less).focus({ preventScroll: true });
      return;
    }
    el.genStep.textContent = "STEP 1 OF 2";
    el.genText.firstChild.nodeValue = "READING TRANSCRIPT...";
    show("gen");
    var started = Date.now();
    var stage = setTimeout(function () {
      if (my !== token) return;
      el.genStep.textContent = "STEP 2 OF 2";
      el.genText.firstChild.nodeValue = "GENERATING...";
    }, 300);
    summarize(v, level).then(function (res) {
      return wait(Math.max(0, MIN_GEN_MS - (Date.now() - started))).then(function () { return res; });
    }).then(function (res) {
      clearTimeout(stage);
      if (my !== token) return;
      paintDetail(v, level, res);
      show("detail");
      el.dTitle.focus({ preventScroll: true });
    });
  }

  function step(delta) {
    if (!current) return;
    var i = LEVELS.indexOf(current.level) + delta;
    if (i < 0 || i >= LEVELS.length) return;
    read(current.id, LEVELS[i], { keepFocus: true });
  }

  function back() {
    token++;
    if (cameFromFeed) { cameFromFeed = false; history.back(); }
    else location.hash = "#/";
  }

  el.back.addEventListener("click", back);
  el.less.addEventListener("click", function () { step(-1); });
  el.more.addEventListener("click", function () { step(1); });

  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA";
    if (screen === "feed" && e.key === "/" && !typing) { e.preventDefault(); el.q.focus(); return; }
    if (screen === "detail" || screen === "gen") {
      if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); back(); }
      else if (screen === "detail" && e.key === "ArrowLeft") step(-1);
      else if (screen === "detail" && e.key === "ArrowRight") step(1);
    }
  });

  /* ---------- routing ---------- */
  function route() {
    var m = /^#\/read\/([^/?]+)/.exec(location.hash);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (current && current.id === id && screen !== "feed") return;
      read(id, "standard");
      return;
    }
    token++;
    current = null;
    renderFeed();
    show("feed");
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("pageshow", function (e) { if (e.persisted && screen === "feed") renderFeed(); });

  /* ---------- start ---------- */
  window.IkoData.loadVideos().then(function (list) {
    videos = Array.isArray(list) ? list : [];
    videos.forEach(function (v) { byId[v.id] = v; });
    route();
  }).catch(function () {
    el.empty.textContent = "COULD NOT LOAD VIDEOS.";
    el.empty.hidden = false;
  });
})();
