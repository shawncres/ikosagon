/* IKOREADTUBE - vanilla JS, no framework, no build step. Videos come only from window.IkoData.loadVideos(). */
(function () {
  "use strict";

  // Real YouTube data and Gemini summaries come from the Next.js routes under API (same origin).
  var API = (window.IkoData && window.IkoData.api) || "/api/ikoreadtube";
  // Groq summaries of pasted text (and of the built-in sample videos). Default: the Next.js route on this site.
  // For the GoDaddy/PHP version, set this to "api/summarize.php" (see README.md).
  var PROXY_URL = window.IKOREADTUBE_PROXY || "/api/ikoreadtube/summarize";
  var WATCH_URL = "https://www.youtube.com/watch?v=";
  var THUMB_URL = "https://i.ytimg.com/vi/";
  var LEVELS = ["less", "standard", "more"];
  var LEVEL_LABEL = { less: "LESS", standard: "STANDARD", more: "MORE" };
  var RECENT_KEY = "ikoreadtube.recent";
  var THUMBS_KEY = "ikoreadtube.thumbs";
  var RECENT_MAX = 8;
  var MIN_GEN_MS = 600;
  var REQUEST_TIMEOUT_MS = 20000;
  var SUMMARY_TIMEOUT_MS = 58000;
  var SEARCH_TIMEOUT_MS = 20000;
  var PASTE_MIN = 40;
  var ID_RE = /^[A-Za-z0-9_-]{11}$/;

  var REASONS = {
    off: "AI SUMMARIES ARE OFF RIGHT NOW",
    "long": "THIS VIDEO IS TOO LONG FOR AI",
    "short": "THIS VIDEO IS VERY SHORT",
    live: "THIS IS A LIVE VIDEO",
    budget: "TODAY'S AI LIMIT IS REACHED",
    busy: "AI IS BUSY RIGHT NOW",
    failed: "AI COULD NOT READ THIS VIDEO"
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    feed: $("feed"), recent: $("recent"), recentWrap: $("recent-wrap"), empty: $("empty"), feedTitle: $("feed-title"), notice: $("notice"),
    q: $("q"), searchbar: $("searchbar"), thumbs: $("btn-thumbs"), searchYt: $("search-yt"), searchYtBtn: $("btn-search-yt"),
    sFeed: $("screen-feed"), sGen: $("screen-gen"), sDetail: $("screen-detail"),
    genStep: $("gen-step"), genText: $("gen-text"), genNote: $("gen-note"),
    back: $("btn-back"), less: $("btn-less"), more: $("btn-more"),
    dTitle: $("d-title"), dChan: $("d-chan"), dWatch: $("d-watch"), dThumbWrap: $("d-thumb-wrap"), dThumb: $("d-thumb"),
    dLevel: $("d-level"), dText: $("d-text"), dSrc: $("d-src"),
    paste: $("btn-paste"), pastePanel: $("paste-panel"), pasteText: $("paste-text"), pasteHelp: $("paste-help"),
    pasteGo: $("btn-paste-go"), pasteCancel: $("btn-paste-cancel")
  };
  var PASTE_HELP = el.pasteHelp.textContent;

  var source = "sample";   // "youtube" | "sample"
  var videos = [];
  var byId = {};
  var screen = "feed";
  var feedScroll = 0;
  var selectedId = null;
  var current = null;      // { id, level }
  var sum = {};            // id -> { kind, levels: { level: { text, ai, reason } }, ... }
  var token = 0;           // cancels stale generations
  var cameFromFeed = false;
  var thumbsOn = false;
  var sr = null;           // YouTube search state: { q, state, videos, msg }
  var searchToken = 0;
  var stageTimer = 0;

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ---------- helpers ---------- */
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function isReal(id) { return ID_RE.test(id) && !window.IkoData.isSample(id); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  function fmtDur(sec) {
    sec = Math.round(Number(sec) || 0);
    if (sec <= 0) return "";
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }
  function ago(iso) {
    var t = Date.parse(iso);
    if (!t) return "";
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 60) return Math.max(1, m) + "M AGO";
    var h = Math.round(m / 60);
    if (h < 24) return h + "H AGO";
    var d = Math.round(h / 24);
    if (d < 30) return d + "D AGO";
    var mo = Math.round(d / 30);
    return mo < 12 ? mo + "MO AGO" : Math.round(mo / 12) + "Y AGO";
  }
  function metaLine(v) {
    return [v.channel, ago(v.published), fmtDur(v.duration)].filter(Boolean).join(" | ");
  }
  function timeoutFetch(url, opts, ms) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    opts = opts || {};
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }

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
    list.unshift({ id: v.id, title: v.title || "", channel: v.channel || "" });
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* private mode: fine */ }
  }
  function loadThumbsPref() {
    try { thumbsOn = localStorage.getItem(THUMBS_KEY) === "1"; } catch { thumbsOn = false; }
    paintThumbsBtn();
  }
  function paintThumbsBtn() {
    el.thumbs.textContent = "THUMBS: " + (thumbsOn ? "ON" : "OFF");
    el.thumbs.setAttribute("aria-pressed", String(thumbsOn));
  }

  /* ---------- video registry ---------- */
  function addVideo(v) {
    if (!byId[v.id]) byId[v.id] = v;
    return byId[v.id];
  }
  function ensureVideo(id) {
    if (byId[id]) return byId[id];
    var samples = window.IkoData.sampleVideos();
    for (var i = 0; i < samples.length; i++) if (samples[i].id === id) return addVideo(samples[i]);
    if (isReal(id)) {
      var saved = readRecent().filter(function (r) { return r.id === id; })[0] || {};
      return addVideo({ id: id, title: saved.title || "", channel: saved.channel || "", published: "", duration: 0 });
    }
    return null;
  }
  function thumbSrc(v) { return isReal(v.id) ? THUMB_URL + encodeURIComponent(v.id) + "/default.jpg" : v.thumb || ""; }

  /* ---------- feed ---------- */
  function makeItem(v, opts) {
    var li = node("li");
    var b = node("button", "item");
    b.type = "button";
    b.setAttribute("data-id", v.id);
    b.appendChild(node("span", "arrow"));
    var src = opts.thumb ? thumbSrc(v) : "";
    if (src) {
      var img = node("img", isReal(v.id) ? "th yt" : "th");
      img.src = src;
      img.alt = "";
      img.width = isReal(v.id) ? 48 : 64; img.height = isReal(v.id) ? 36 : 36;
      img.loading = "lazy";
      b.appendChild(img);
    }
    var t = node("span", "txt");
    t.appendChild(node("span", "t", v.title || "VIDEO " + v.id));
    t.appendChild(node("span", "c", opts.sub));
    b.appendChild(t);
    li.appendChild(b);
    if (isReal(v.id)) li.appendChild(watchLink(v.id, "watch"));
    return li;
  }

  function watchLink(id, cls) {
    var a = node("a", cls, "WATCH ON YOUTUBE");
    a.href = WATCH_URL + encodeURIComponent(id);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function renderFeed() {
    var q = el.q.value.trim();
    var ql = q.toLowerCase();
    el.feed.textContent = "";
    el.recent.textContent = "";
    el.notice.hidden = source === "youtube";
    el.notice.textContent = "THE YOUTUBE FEED IS NOT AVAILABLE RIGHT NOW. SHOWING SAMPLE VIDEOS INSTEAD.";
    el.empty.textContent = "NO MATCH.";

    if (sr) {
      el.recentWrap.hidden = true;
      el.feedTitle.hidden = false;
      el.feedTitle.textContent = "YOUTUBE SEARCH: " + sr.q;
      el.searchYt.hidden = false;
      el.searchYtBtn.textContent = "CLEAR SEARCH";
      sr.videos.forEach(function (v) { el.feed.appendChild(makeItem(v, { thumb: thumbsOn, sub: metaLine(v) })); });
      var msg = sr.state === "loading" ? "SEARCHING YOUTUBE..." : sr.msg || (sr.videos.length ? "" : "NO RESULTS.");
      el.empty.textContent = msg;
      el.empty.hidden = !msg;
      markSelected();
      return;
    }

    var shown = videos.filter(function (v) {
      return !ql || ((v.title || "") + " " + (v.channel || "")).toLowerCase().indexOf(ql) !== -1;
    });
    shown.forEach(function (v) {
      el.feed.appendChild(makeItem(v, { thumb: thumbsOn, sub: source === "youtube" ? metaLine(v) : v.channel }));
    });
    el.empty.hidden = shown.length > 0;
    el.feedTitle.hidden = shown.length === 0;
    el.feedTitle.textContent = ql ? "MATCHES (" + shown.length + ")" : source === "youtube" ? "NEW FROM YOUTUBE" : "SAMPLE VIDEOS";

    var canSearch = source === "youtube" && q.length >= 3;
    el.searchYt.hidden = !canSearch;
    if (canSearch) el.searchYtBtn.textContent = "SEARCH YOUTUBE: " + (q.length > 24 ? q.slice(0, 24) + "..." : q);

    var rec = ql ? [] : readRecent().map(function (r) {
      var v = byId[r.id];
      if (v) return v;
      if (source === "youtube" && isReal(r.id)) return ensureVideo(r.id);
      return null;
    }).filter(function (v) { return v && (source === "youtube" ? true : !isReal(v.id)); });
    el.recentWrap.hidden = rec.length === 0;
    rec.forEach(function (v) {
      el.recent.appendChild(makeItem(v, { thumb: false, sub: v.channel || "ID " + v.id }));
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

  el.q.addEventListener("input", function () {
    if (sr && el.q.value.trim() !== sr.q) { sr = null; searchToken++; }
    renderFeed();
  });
  el.q.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      var all = items();
      if (all[0]) { e.preventDefault(); all[0].focus(); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    } else if (e.key === "Escape" && el.q.value) {
      el.q.value = "";
      sr = null; searchToken++;
      renderFeed();
    }
  });

  el.thumbs.addEventListener("click", function () {
    thumbsOn = !thumbsOn;
    try { localStorage.setItem(THUMBS_KEY, thumbsOn ? "1" : "0"); } catch { /* fine */ }
    paintThumbsBtn();
    renderFeed();
  });

  /* ---------- YouTube search (server route, capped per day) ---------- */
  function runSearch() {
    var q = el.q.value.trim();
    if (source !== "youtube" || q.length < 3) return;
    var my = ++searchToken;
    sr = { q: q, state: "loading", videos: [], msg: "" };
    renderFeed();
    timeoutFetch(API + "/search?q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } }, SEARCH_TIMEOUT_MS)
      .then(function (res) {
        return res.json().then(function (body) { return { status: res.status, body: body || {} }; }, function () { return { status: res.status, body: {} }; });
      })
      .then(function (r) {
        if (my !== searchToken || !sr) return;
        sr.state = "done";
        if (r.status === 200 && Array.isArray(r.body.videos)) {
          sr.videos = r.body.videos.filter(function (v) { return v && typeof v.id === "string" && ID_RE.test(v.id); }).map(addVideo);
        } else if (r.status === 429 && r.body.error === "limit") {
          sr.msg = "TODAY'S YOUTUBE SEARCH LIMIT IS REACHED. FILTER THE FEED, OR TRY AGAIN TOMORROW.";
        } else if (r.status === 429) {
          sr.msg = "TOO MANY SEARCHES. WAIT A MINUTE AND TRY AGAIN.";
        } else {
          sr.msg = "YOUTUBE SEARCH IS NOT AVAILABLE RIGHT NOW.";
        }
        renderFeed();
      })
      .catch(function () {
        if (my !== searchToken || !sr) return;
        sr.state = "done";
        sr.msg = "YOUTUBE SEARCH IS NOT AVAILABLE RIGHT NOW.";
        renderFeed();
      });
  }
  el.searchYtBtn.addEventListener("click", function () {
    if (sr) { sr = null; searchToken++; renderFeed(); el.q.focus(); }
    else runSearch();
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

  /* ---------- summaries ---------- */
  function entry(text, ai, reason) { return { text: text, ai: ai, reason: reason || "" }; }

  // Gemini route: one call returns all three levels (or the channel's description when AI can't run). Never rejects.
  function fetchSummary(v) {
    var fail = function (reason) {
      var t = "WE COULD NOT GET A SUMMARY (" + reason + "). YOU CAN WATCH THE VIDEO ON YOUTUBE OR PASTE ITS TRANSCRIPT BELOW.";
      var levels = {};
      LEVELS.forEach(function (l) { levels[l] = entry(t, false, reason); });
      return { kind: "error", levels: levels, reason: reason };
    };
    return timeoutFetch(API + "/summary?id=" + encodeURIComponent(v.id), { headers: { Accept: "application/json" } }, SUMMARY_TIMEOUT_MS)
      .then(function (res) {
        return res.json().then(function (body) { return { status: res.status, body: body || {} }; }, function () { return { status: res.status, body: {} }; });
      })
      .then(function (r) {
        var b = r.body, lv = b.levels;
        if (r.status === 200 && lv && typeof lv.less === "string" && typeof lv.standard === "string" && typeof lv.more === "string") {
          if (!v.title && b.title) v.title = String(b.title);
          if (!v.channel && b.channel) v.channel = String(b.channel);
          if (!v.published && b.published) v.published = String(b.published);
          if (!v.duration && b.duration) v.duration = Number(b.duration) || 0;
          var ai = b.source === "gemini";
          var levels = {};
          LEVELS.forEach(function (l) { levels[l] = entry(lv[l], ai, b.reason); });
          var s = { kind: ai ? "gemini" : "description", reason: String(b.reason || ""), levels: levels };
          sum[v.id] = s;
          return s;
        }
        if (r.status === 404) return fail("VIDEO NOT FOUND OR NOT PUBLIC");
        if (r.status === 429) return fail("TOO MANY REQUESTS, WAIT A MINUTE");
        return fail("THE SUMMARY SERVICE IS NOT AVAILABLE");
      })
      .catch(function () { return fail("OFFLINE OR TOO SLOW"); });
  }

  // Groq route (pasted text, and the built-in sample videos). Fills s.levels[level]. Never rejects.
  function groqLevel(v, s, level) {
    if (s.levels[level]) return Promise.resolve(s);
    var fallback = function (reason) {
      if (s.pasted || !s.preset || !s.preset[level]) {
        return { entry: entry("WE COULD NOT SUMMARIZE THE TEXT RIGHT NOW (" + reason + "). TRY AGAIN IN A MINUTE.", false, reason), keep: false };
      }
      return { entry: entry(s.preset[level], false, reason), keep: reason !== "BUSY, TRY LATER" };
    };
    var reasonFor = function (status, header) {
      if (header === "no_key") return "NO API KEY ON THE SERVER";
      if (status === 429) return "BUSY, TRY LATER";
      if (status === 0) return "OFFLINE";
      if (status === 404) return "PROXY NOT FOUND";
      return "SERVICE UNAVAILABLE";
    };
    if (!s.transcript) {
      var none = fallback("NO TRANSCRIPT");
      s.levels[level] = none.entry;
      return Promise.resolve(s);
    }
    return timeoutFetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/plain" },
      body: JSON.stringify({ id: v.id, title: v.title, transcript: s.transcript, level: level })
    }, REQUEST_TIMEOUT_MS).then(function (res) {
      return res.text().then(function (body) {
        var text = String(body || "").trim();
        if (res.ok && text) return { entry: entry(text, true, ""), keep: true };
        return fallback(reasonFor(res.status, res.headers.get("X-Ikoreadtube-Error")));
      });
    }).catch(function () {
      return fallback(reasonFor(0, ""));
    }).then(function (r) {
      s.levels[level] = r.entry;
      if (!r.keep) s.transient = level;
      return s;
    });
  }

  function labelFor(s, e) {
    if (s.kind === "gemini") return "AI SUMMARY BY GEMINI. NOT FROM YOUTUBE. CAN BE WRONG.";
    if (s.kind === "description") return "VIDEO DESCRIPTION FROM THE CHANNEL, NOT A SUMMARY (" + (REASONS[s.reason] || "AI SUMMARY NOT AVAILABLE") + ")";
    if (s.kind === "groq") {
      if (e.ai) return s.pasted ? "AI SUMMARY OF YOUR PASTED TEXT BY GROQ. NOT FROM YOUTUBE. CAN BE WRONG." : "AI SUMMARY BY GROQ OF SAMPLE TEXT";
      return s.pasted ? "NOT SUMMARIZED (" + e.reason + ")" : "PRESET SUMMARY (" + e.reason + ")";
    }
    return "NO SUMMARY (" + (s.reason || "ERROR") + ")";
  }

  function paintDetail(v, s, level) {
    var i = LEVELS.indexOf(level);
    var e = s.levels[level];
    el.dTitle.textContent = v.title || "VIDEO " + v.id;
    el.dChan.textContent = isReal(v.id) ? metaLine(v) : v.channel;
    el.dWatch.hidden = !isReal(v.id);
    if (isReal(v.id)) el.dWatch.href = WATCH_URL + encodeURIComponent(v.id);
    var src = thumbsOn ? thumbSrc(v) : "";
    if (src) {
      el.dThumb.src = src;
      el.dThumbWrap.className = isReal(v.id) ? "thumb-big yt" : "thumb-big";
      el.dThumbWrap.hidden = false;
    } else {
      el.dThumbWrap.hidden = true;
    }
    el.dLevel.textContent = "DETAIL " + (i + 1) + "/3: " + LEVEL_LABEL[level];
    el.dText.textContent = e.text;
    el.dSrc.textContent = labelFor(s, e);
    el.less.disabled = i === 0;
    el.more.disabled = i === LEVELS.length - 1;
    el.less.setAttribute("aria-disabled", String(i === 0));
    el.more.setAttribute("aria-disabled", String(i === LEVELS.length - 1));
    el.paste.textContent = s.pasted ? "PASTE DIFFERENT TEXT" : "PASTE TRANSCRIPT";
    if (s.transient === level) { delete s.levels[level]; s.transient = null; } // failures are not remembered
  }

  function closePaste() {
    el.pastePanel.hidden = true;
    el.pasteHelp.textContent = PASTE_HELP;
  }

  function read(id, level, opts) {
    var v = ensureVideo(id);
    if (!v) { location.replace("#/"); return; }
    opts = opts || {};
    var my = ++token;
    clearTimeout(stageTimer);
    current = { id: id, level: level };
    pushRecent(v);
    closePaste();
    var s = sum[id];
    if (s && s.levels[level]) {
      paintDetail(v, s, level);
      show("detail");
      if (!opts.keepFocus) el.dTitle.focus({ preventScroll: true });
      else (level === "less" ? el.more : el.less).focus({ preventScroll: true });
      return;
    }

    var real = isReal(id) && !s;
    el.genStep.textContent = "STEP 1 OF 2";
    el.genText.firstChild.nodeValue = real ? "OPENING THE VIDEO..." : "READING TRANSCRIPT...";
    el.genNote.textContent = real ? "AI IS WATCHING IT FOR YOU. THIS CAN TAKE UP TO 30 SECONDS." : "";
    show("gen");
    var started = Date.now();
    stageTimer = setTimeout(function () {
      if (my !== token) return;
      el.genStep.textContent = "STEP 2 OF 2";
      el.genText.firstChild.nodeValue = real ? "WRITING THE SUMMARY..." : "GENERATING...";
    }, real ? 4000 : 300);

    var work;
    if (real) work = fetchSummary(v);
    else {
      if (!s) {
        s = sum[id] = { kind: "groq", pasted: false, levels: {}, transcript: v.transcript || "", preset: v.summaries || null };
      }
      work = groqLevel(v, s, level);
    }
    work.then(function (res) {
      return wait(Math.max(0, MIN_GEN_MS - (Date.now() - started))).then(function () { return res; });
    }).then(function (res) {
      clearTimeout(stageTimer);
      if (my !== token) return;
      pushRecent(v);
      paintDetail(v, res, level);
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

  function forgetPasted() {
    if (current && sum[current.id] && sum[current.id].pasted) delete sum[current.id]; // pasted text never outlives the screen
  }

  function back() {
    token++;
    clearTimeout(stageTimer);
    forgetPasted();
    if (cameFromFeed) { cameFromFeed = false; history.back(); }
    else location.hash = "#/";
  }

  el.back.addEventListener("click", back);
  el.less.addEventListener("click", function () { step(-1); });
  el.more.addEventListener("click", function () { step(1); });

  el.paste.addEventListener("click", function () {
    el.pastePanel.hidden = !el.pastePanel.hidden;
    if (!el.pastePanel.hidden) el.pasteText.focus();
  });
  el.pasteCancel.addEventListener("click", function () { closePaste(); el.paste.focus(); });
  el.pasteGo.addEventListener("click", function () {
    var text = el.pasteText.value.replace(/\s+/g, " ").trim();
    if (text.length < PASTE_MIN) {
      el.pasteHelp.textContent = "PASTE A FEW MORE SENTENCES (AT LEAST " + PASTE_MIN + " CHARACTERS).";
      el.pasteText.focus();
      return;
    }
    if (!current) return;
    sum[current.id] = { kind: "groq", pasted: true, levels: {}, transcript: text.slice(0, 9000) };
    el.pasteText.value = "";
    read(current.id, "standard");
  });

  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA";
    if (screen === "feed" && e.key === "/" && !typing) { e.preventDefault(); el.q.focus(); return; }
    if (screen === "detail" || screen === "gen") {
      if (typing) {
        if (e.key === "Escape" && tag === "TEXTAREA") { closePaste(); el.paste.focus(); }
        return;
      }
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
    clearTimeout(stageTimer);
    forgetPasted();
    current = null;
    renderFeed();
    show("feed");
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("pageshow", function (e) { if (e.persisted && screen === "feed") renderFeed(); });

  /* ---------- start ---------- */
  loadThumbsPref();
  el.empty.textContent = "LOADING VIDEOS FROM YOUTUBE...";
  el.empty.hidden = false;
  window.IkoData.loadVideos().then(function (r) {
    source = r && r.source === "youtube" ? "youtube" : "sample";
    videos = (r && Array.isArray(r.videos) ? r.videos : []).map(addVideo);
    route();
  }).catch(function () {
    el.empty.textContent = "COULD NOT LOAD VIDEOS.";
    el.empty.hidden = false;
  });
})();
