/*
 * IkoLearn lessons: parses the tagged lesson text the server streams (INTRO / EXPLAIN / STEP / EXAMPLE / CHECK / ANSWER / NEXT)
 * and renders the teaching half of a short, calm lesson ("Learn"); the app renders the questions after it ("Check yourself"). Works on partial text while it streams. No DOM needed for parsing, so the
 * check script can test it in Node (module.exports); the browser gets window.IkoLesson.
 */
(function (root) {
  "use strict";

  var TAGS = { intro: "intro", explain: "explain", step: "steps", example: "example", check: "check", answer: "answer", next: "next" };
  var TAG_RE = /^\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?(intro|explain|step|example|check|answer|next)\s*(?:\d+)?\s*[:.-]\s*/i;

  /*
   * Code (PR 107): a fenced block (```lang ... ```) is kept exactly, indentation and line breaks, as { code, lang } in the
   * section it follows (a string section's code goes with the worked example); while streaming, an open block shows
   * what has arrived. Single backticks stay in the text and render as inline code. Nothing is ever parsed as HTML.
   */
  var FENCE = /^\s*```\s*([A-Za-z0-9+#._-]{0,24})\s*$/;
  /* -> { intro: [], explain: [], steps: [], example: [], check: "", answer: "", next: "" }; untagged lines join the section above. */
  function parse(text) {
    var out = { intro: [], explain: [], steps: [], example: [], check: "", answer: "", next: "" };
    var cur = "intro", code = null;
    var put = function () {
      if (code && code.lines.length) (Array.isArray(out[cur]) ? out[cur] : out.example).push({ code: code.lines.join("\n").replace(/^\n+|\s+$/g, ""), lang: code.lang });
      code = null;
    };
    String(text || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var fm = FENCE.exec(raw);
      if (code) { if (fm && !fm[1]) put(); else code.lines.push(raw.replace(/\t/g, "    ").replace(/\s+$/, "")); return; }
      if (fm) { code = { lang: fm[1].toLowerCase(), lines: [] }; return; }
      var line = raw.replace(/\*\*|__/g, "").replace(/^#+\s*/, "").trim();
      if (!line) return;
      var m = TAG_RE.exec(line);
      if (m) {
        cur = TAGS[m[1].toLowerCase()];
        line = line.slice(m[0].length).trim();
        if (!line) return;
        if (Array.isArray(out[cur])) { out[cur].push(line); return; }
        out[cur] = out[cur] ? out[cur] + " " + line : line;
        return;
      }
      if (Array.isArray(out[cur])) {
        if (cur === "steps" && typeof out.steps[out.steps.length - 1] === "string") out.steps[out.steps.length - 1] += " " + line;
        else out[cur].push(line);
      } else out[cur] = out[cur] ? out[cur] + " " + line : line;
    });
    put();
    return out;
  }

  /* Text with code, for any plain text (a clarification, a question): [{ text } | { code, lang }] in order. */
  function segments(text) {
    var out = [], buf = [], code = null;
    var flush = function () { if (buf.length) { out.push({ text: buf.join("\n") }); buf = []; } };
    String(text || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var fm = FENCE.exec(raw);
      if (code) { if (fm && !fm[1]) { out.push({ code: code.lines.join("\n").replace(/\s+$/, ""), lang: code.lang }); code = null; } else code.lines.push(raw.replace(/\t/g, "    ").replace(/\s+$/, "")); return; }
      if (fm) { flush(); code = { lang: fm[1].toLowerCase(), lines: [] }; return; }
      buf.push(raw);
    });
    if (code && code.lines.length) out.push({ code: code.lines.join("\n"), lang: code.lang });
    flush();
    return out;
  }
  /* inline `code` inside a line of text: text nodes and <code> elements, built with textContent only */
  function inline(doc, el, text) {
    var parts = String(text == null ? "" : text).split(/`([^`\n]{1,80})`/);
    parts.forEach(function (t, i) {
      if (!t) return;
      if (i % 2) { var c = doc.createElement("code"); c.className = "ic"; c.textContent = t; el.appendChild(c); }
      else el.appendChild(doc.createTextNode(t.replace(/`/g, "")));
    });
    return el;
  }
  /* a quiet monospace block: indentation and line breaks kept, scrolls sideways, comment lines a little softer */
  function codeBlock(doc, code, lang) {
    var pre = doc.createElement("pre"), c = doc.createElement("code");
    pre.className = "code"; pre.tabIndex = 0;
    pre.setAttribute("aria-label", (lang ? lang + " " : "") + "code");
    if (lang) pre.setAttribute("data-lang", lang);
    String(code).split("\n").forEach(function (ln, i) {
      if (i) c.appendChild(doc.createTextNode("\n"));
      if (/^\s*(#|\/\/|--)/.test(ln)) { var s = doc.createElement("span"); s.className = "cm"; s.textContent = ln; c.appendChild(s); }
      else c.appendChild(doc.createTextNode(ln));
    });
    pre.appendChild(c);
    return pre;
  }
  /* any text into el: paragraphs (class cls) with inline code, and code blocks between them */
  function richText(el, text, cls) {
    var doc = el.ownerDocument;
    segments(text).forEach(function (sg) {
      if (sg.code != null) { el.appendChild(codeBlock(doc, sg.code, sg.lang)); return; }
      sg.text.split(/\n{2,}/).forEach(function (para) { para = para.replace(/\s*\n\s*/g, " ").trim(); if (para) { var p = doc.createElement("p"); if (cls) p.className = cls; el.appendChild(inline(doc, p, para)); } });
    });
    return el;
  }

  /* A lesson is usable once it has an intro and some teaching: an explanation or a step (used to decide whether to cache it). */
  function usable(p) { return Boolean(p && p.intro.length && (p.steps.length || (p.explain && p.explain.length))); }

  /* Renders into `el`. opts: { streaming, revealed, onReveal } */
  function render(el, p, opts) {
    opts = opts || {};
    var doc = el.ownerDocument;
    var mk = function (tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) inline(doc, e, text); return e; };
    var item = function (tag, cls, t) { return t && t.code != null ? codeBlock(doc, t.code, t.lang) : mk(tag, cls, t); };
    el.textContent = "";
    p.intro.forEach(function (t) { el.appendChild(item("p", "l-intro", t)); });
    (p.explain || []).forEach(function (t) { el.appendChild(item("p", "l-explain", t)); });
    if (p.steps.length) {
      el.appendChild(mk("p", "l-head", p.explain && p.explain.length ? "How to do it" : "Step by step"));
      var ol = mk("ol", "l-steps");
      p.steps.forEach(function (t) { if (t && t.code != null) { var last = ol.lastElementChild || ol.appendChild(mk("li")); last.appendChild(codeBlock(doc, t.code, t.lang)); } else ol.appendChild(mk("li", null, t)); });
      el.appendChild(ol);
    }
    if (p.example.length) {
      var ex = mk("div", "l-example");
      ex.appendChild(mk("p", "l-head", "Worked example"));
      p.example.forEach(function (t) { ex.appendChild(item("p", null, t)); });
      el.appendChild(ex);
    }
    if (p.check) {
      var ck = mk("div", "l-check");
      ck.appendChild(mk("p", "l-head", "Check yourself"));
      ck.appendChild(mk("p", null, p.check));
      if (p.answer) {
        if (opts.revealed) ck.appendChild(mk("p", "l-answer", p.answer));
        else if (!opts.streaming) {
          var b = mk("button", "link", "Show the answer");
          b.type = "button";
          b.addEventListener("click", function () { if (opts.onReveal) opts.onReveal(); });
          ck.appendChild(b);
        }
      }
      el.appendChild(ck);
    }
    if (p.next) {
      el.appendChild(mk("p", "l-head", "Try next"));
      el.appendChild(mk("p", "l-next", p.next));
    }
    if (opts.streaming) {
      var last = el.lastElementChild;
      if (last && last.tagName === "OL") last = last.lastElementChild;
      (last || el.appendChild(mk("p", "l-intro", ""))).classList.add("caret");
    }
  }

  /*
   * Further reading & viewing. The model gives only a title and a search phrase per item (never a link). Links are
   * built here, and only to these search pages; the phrase is URL-encoded and every link is labelled as a search.
   * "watch" uses a video search with SafeSearch on, limited to YouTube (YouTube's own search has no safe-search
   * setting in its address; its Restricted Mode is an account or network setting).
   */
  var SEARCH = {
    wiki: { label: "Wikipedia", base: "https://en.wikipedia.org/w/index.php?fulltext=1&search=" },
    khan: { label: "Khan Academy", base: "https://www.khanacademy.org/search?page_search_query=" },
    library: { label: "Open Library", base: "https://openlibrary.org/search?q=" },
    video: { label: "YouTube videos (SafeSearch on)", base: "https://www.google.com/search?tbm=vid&safe=active&q=", tail: " site:youtube.com" }
  };
  var SEARCH_HOSTS = ["en.wikipedia.org", "www.khanacademy.org", "openlibrary.org", "www.google.com"];
  var LINKY = /(https?:|www\.|:\/\/|\b[a-z0-9-]+\.(com|org|net|edu|gov|io|co|uk|ca|tv|be|ly)\b|@|\/)/i;
  function clip(v, n) { return String(v == null ? "" : v).replace(/[<>{}[\]`*_#|\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, n).trim(); }
  /* Re-checked on the device too (cached lessons, older servers): titles and phrases only, at most 3. */
  function cleanReading(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (r) {
      if (!r || typeof r !== "object" || out.length >= 3) return;
      var title = clip(r.title, 70), q = clip(r.q, 60);
      if (title.length < 3 || q.length < 3 || LINKY.test(title) || LINKY.test(q)) return;
      if (out.some(function (x) { return x.q.toLowerCase() === q.toLowerCase(); })) return;
      out.push({ title: title, q: q, kind: r.kind === "watch" ? "watch" : "read" });
    });
    return out;
  }
  /* -> [{ href, label }]: read items search Wikipedia, Khan Academy and Open Library; watch items search videos */
  function searchLinks(item) {
    var keys = item.kind === "watch" ? ["video", "khan"] : ["wiki", "khan", "library"];
    return keys.map(function (k) {
      var s = SEARCH[k];
      return { href: s.base + encodeURIComponent(item.q + (s.tail || "")), label: "Search " + s.label };
    });
  }
  /* true only for a link this module would build (scheme https, an allowlisted search host) */
  function allowedHref(href) {
    var m = /^https:\/\/([^/?#]+)\//.exec(String(href || ""));
    return Boolean(m) && SEARCH_HOSTS.indexOf(m[1].toLowerCase()) >= 0;
  }
  /* The collapsed "Further reading & viewing" fold (null when there is nothing). doc: the document. */
  function renderReading(doc, list) {
    var items = cleanReading(list);
    if (!items.length) return null;
    var d = doc.createElement("details"); d.className = "further";
    var sm = doc.createElement("summary"); sm.textContent = "Further reading & viewing"; d.appendChild(sm);
    var ul = doc.createElement("ul");
    items.forEach(function (it) {
      var li = doc.createElement("li");
      var t = doc.createElement("span"); t.className = "fr-title"; t.textContent = it.title + (it.kind === "watch" ? " (to watch)" : ""); li.appendChild(t);
      var row = doc.createElement("span"); row.className = "fr-links";
      searchLinks(it).forEach(function (l, i) {
        if (!allowedHref(l.href)) return;
        if (i) row.appendChild(doc.createTextNode(" · "));
        var a = doc.createElement("a");
        a.href = l.href; a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
        a.textContent = l.label;
        a.setAttribute("aria-label", l.label + " for \u201c" + it.q + "\u201d (opens a search in a new tab)");
        row.appendChild(a);
      });
      li.appendChild(row);
      ul.appendChild(li);
    });
    d.appendChild(ul);
    var fine = doc.createElement("p"); fine.className = "fine"; fine.textContent = "These open searches on other sites, not pages we chose.";
    d.appendChild(fine);
    return d;
  }

  var api = { parse: parse, usable: usable, render: render, segments: segments, inline: inline, codeBlock: codeBlock, richText: richText, FENCE: FENCE, SEARCH: SEARCH, SEARCH_HOSTS: SEARCH_HOSTS, cleanReading: cleanReading, searchLinks: searchLinks, allowedHref: allowedHref, renderReading: renderReading };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoLesson = api;
})(typeof window !== "undefined" ? window : this);
