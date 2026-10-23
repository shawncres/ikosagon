/*
 * The Learners page (/ikolearn/learners): who's learning now, add a learner, and learning for yourself <-> guiding.
 * Everything goes through IkoProfiles (additive storage). Text nodes only; 0 calls. After a switch it goes back to the app,
 * which loads the chosen learner's own cloud, Deck and progress.
 */
(function () {
  "use strict";
  var PR = window.IkoProfiles, doc = document, host = doc.getElementById("lrn"), S = window.localStorage;
  if (!PR || !host) return;
  try { PR.reconcile(S); } catch { /* keep going */ }
  var APP = "/ikolearn/";
  function el(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function go() { window.location.href = APP; }

  function addForm(label, note) {
    var f = el("form", "lrn-add"); f.setAttribute("autocomplete", "off");
    var l = el("label", "", label); l.setAttribute("for", "lrn-name");
    var row = el("div", "row"), i = el("input"); i.id = "lrn-name"; i.maxLength = 30; i.required = true; i.autocomplete = "off";
    var b = el("button", "btn", "Add"); b.type = "submit";
    row.appendChild(i); row.appendChild(b);
    var msg = el("p", "fine"); msg.setAttribute("role", "status");
    f.appendChild(l); f.appendChild(row); if (note) f.appendChild(el("p", "fine", note)); f.appendChild(msg);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var r;
      try { r = PR.add(S, i.value); } catch { r = { ok: false, why: "full-store" }; }
      if (r.ok) return go();
      msg.textContent = r.why === "taken" ? "There's already a learner with that name. Try adding an initial." : r.why === "full" ? "That's the most learners for one device (" + PR.MAX + ")." : r.why === "full-store" ? "This device's storage is full, so no learner was added." : "Please write a first name.";
      i.focus();
    });
    return f;
  }

  function draw() {
    while (host.firstChild) host.removeChild(host.firstChild);
    var ix = PR.current(S);
    var head = el("header", "fam-head");
    head.appendChild(el("p", "fam-kicker", "Learners"));
    host.appendChild(head);
    if (!ix) {
      head.appendChild(el("h1", "", "Nobody here yet"));
      head.appendChild(el("p", "fam-lede", "Open IkoLearn to begin, for yourself or as a guide."));
      var a = el("a", "", "Open IkoLearn"); a.href = APP; host.appendChild(a);
      return;
    }
    var list = PR.learners(S), now = list.filter(function (p) { return p.active; })[0];
    if (ix.mode === "guide") {
      head.appendChild(el("h1", "", "Who's learning now?"));
      head.appendChild(el("p", "fam-lede", "Each learner has their own cloud, Deck and progress. Tap a name to switch."));
      var sec = el("section", "fam-sec"); sec.setAttribute("aria-label", "Learners");
      var ul = el("ul", "fam-list lrn-list");
      list.forEach(function (p) {
        var li = el("li"), b = el("button", "link lrn-pick", p.name); b.type = "button"; b.dataset.id = p.id;
        if (p.active) { b.setAttribute("aria-current", "true"); li.appendChild(b); li.appendChild(el("span", "fam-why", "learning now")); }
        else { b.addEventListener("click", function () { PR.switchTo(S, p.id); go(); }); li.appendChild(b); li.appendChild(el("span", "fam-why", "switch")); }
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      host.appendChild(sec);
      var add = el("section", "fam-sec"); add.appendChild(addForm("Add a learner", "First name only. They start with their own first questions.")); host.appendChild(add);
      var more = el("section", "fam-sec");
      var p1 = el("p"), dash = el("a", "", "See everyone's progress"); dash.href = "/ikolearn/family"; p1.appendChild(dash); more.appendChild(p1);
      var p2 = el("p", "fine"), solo = el("button", "link", "Switch to learning for yourself" + (now ? " (as " + now.name + ")" : "")); solo.type = "button"; solo.id = "lrn-self";
      solo.addEventListener("click", function () { PR.setMode(S, "self"); go(); });
      p2.appendChild(solo); p2.appendChild(doc.createTextNode(". Other learners stay saved on this device and come back if you switch again."));
      more.appendChild(p2);
      host.appendChild(more);
    } else {
      head.appendChild(el("h1", "", "Learning for yourself"));
      head.appendChild(el("p", "fam-lede", "IkoLearn is set up for one learner" + (now ? ", " + now.name : "") + ". Guiding other learners? Add them here: each gets their own cloud, Deck and progress, and you can switch between them."));
      var add2 = el("section", "fam-sec"); add2.appendChild(addForm("Add a learner", "First name only. " + (now ? now.name + "'s learning stays as it is." : ""))); host.appendChild(add2);
      if (list.length > 1) {
        var back = el("section", "fam-sec"), p3 = el("p"), g = el("button", "link", "Switch to guiding other learners"); g.type = "button"; g.id = "lrn-guide";
        g.addEventListener("click", function () { PR.setMode(S, "guide"); draw(); });
        p3.appendChild(g); p3.appendChild(doc.createTextNode(" (" + (list.length - 1) + " more saved on this device)")); back.appendChild(p3); host.appendChild(back);
      }
    }
  }
  draw();
})();
