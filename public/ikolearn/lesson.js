/*
 * IkoLearn lessons: parses the tagged lesson text the server streams (INTRO / EXPLAIN / STEP / EXAMPLE / CHECK / ANSWER / NEXT)
 * and renders the teaching half of a short, calm lesson ("Learn"); the app renders the questions after it ("Check yourself"). Works on partial text while it streams. No DOM needed for parsing, so the
 * check script can test it in Node (module.exports); the browser gets window.IkoLesson.
 */
(function (root) {
  "use strict";

  var TAGS = { intro: "intro", explain: "explain", step: "steps", example: "example", check: "check", answer: "answer", next: "next" };
  var TAG_RE = /^\s*(?:[-*•]\s*)?(?:\d+[.)]\s*)?(intro|explain|step|example|check|answer|next)\s*(?:\d+)?\s*[:.-]\s*/i;

  /* -> { intro: [], explain: [], steps: [], example: [], check: "", answer: "", next: "" }; untagged lines join the section above. */
  function parse(text) {
    var out = { intro: [], explain: [], steps: [], example: [], check: "", answer: "", next: "" };
    var cur = "intro";
    String(text || "").replace(/\r/g, "").split("\n").forEach(function (raw) {
      var line = raw.replace(/\*\*|__|`+/g, "").replace(/^#+\s*/, "").trim();
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
        if (cur === "steps" && out.steps.length) out.steps[out.steps.length - 1] += " " + line;
        else out[cur].push(line);
      } else out[cur] = out[cur] ? out[cur] + " " + line : line;
    });
    return out;
  }

  /* A lesson is usable once it has an intro and some teaching: an explanation or a step (used to decide whether to cache it). */
  function usable(p) { return Boolean(p && p.intro.length && (p.steps.length || (p.explain && p.explain.length))); }

  /* Renders into `el`. opts: { streaming, revealed, onReveal } */
  function render(el, p, opts) {
    opts = opts || {};
    var doc = el.ownerDocument;
    var mk = function (tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    el.textContent = "";
    p.intro.forEach(function (t) { el.appendChild(mk("p", "l-intro", t)); });
    (p.explain || []).forEach(function (t) { el.appendChild(mk("p", "l-explain", t)); });
    if (p.steps.length) {
      el.appendChild(mk("p", "l-head", p.explain && p.explain.length ? "How to do it" : "Step by step"));
      var ol = mk("ol", "l-steps");
      p.steps.forEach(function (t) { ol.appendChild(mk("li", null, t)); });
      el.appendChild(ol);
    }
    if (p.example.length) {
      var ex = mk("div", "l-example");
      ex.appendChild(mk("p", "l-head", "Worked example"));
      p.example.forEach(function (t) { ex.appendChild(mk("p", null, t)); });
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

  var api = { parse: parse, usable: usable, render: render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IkoLesson = api;
})(typeof window !== "undefined" ? window : this);
