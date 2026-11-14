/**
 * Functions whose source is sent into the browser (addInitScript / page.evaluate /
 * page.waitForFunction). They must stay free of imports, closures over Node values,
 * and syntax that would need a TypeScript helper. Keep them in this plain module.
 */

/** Wraps IkoCloudView.create so a test can read the camera after a round trip. */
export function captureCloudViews() {
  var real;
  Object.defineProperty(window, "IkoCloudView", {
    configurable: true,
    get: function () {
      return real;
    },
    set: function (v) {
      real = Object.assign({}, v, {
        create: function (c, o) {
          var view = v.create(c, o);
          var bag = window.__views || (window.__views = []);
          bag.push({ id: c.id, view: view });
          return view;
        },
      });
    },
  });
}

/**
 * Maya already has a cloud: three subjects, two touched topics, a deck, and the
 * hints marked seen. Same shape as scripts/ikolearn-home-e2e.mjs. Run only after
 * the app scripts have set window.IkoCloud.
 */
export function seedReturningLearner() {
  var C = window.IkoCloud;
  var T = Date.now() - 3 * 864e5;
  var c = C.create("Maya", T);
  function kids(names) {
    return names.map(function (name, i) {
      return {
        name: name,
        order: i + 1,
        score: 0.9 - i * 0.1,
        why: "",
        role: "core",
        blurb: name + " explained in plain words, step by step, for anyone.",
      };
    });
  }
  C.applyCreate(
    c,
    {
      items: [
        {
          node: { name: "Volcanoes", chain: ["Earth Science"] },
          card: {
            title: "Volcanoes",
            blurb: "Mountains that let out melted rock.",
            goal: "",
          },
          children: kids(["Magma", "Eruptions", "Lava Types"]),
        },
        {
          node: { name: "Sourdough Bread", chain: ["Baking"] },
          card: {
            title: "Sourdough Bread",
            blurb: "Bread raised by a living starter.",
            goal: "",
          },
          children: kids(["Starter Basics", "Kneading", "Proofing"]),
        },
        {
          node: { name: "Stargazing", chain: ["Astronomy"] },
          card: { title: "Stargazing", blurb: "The night sky.", goal: "" },
          children: kids(["Constellations", "Planets"]),
        },
      ],
    },
    { t: T },
  );
  function id(label) {
    return c.order.find(function (x) {
      return c.nodes[x].label === label;
    });
  }
  function touch(label, at) {
    var n = c.nodes[id(label)];
    n.ghost = false;
    n.opened = true;
    n.engaged = 2;
    n.touched = at;
    n.mastery = Math.max(n.mastery, 0.2);
  }
  touch("Kneading", T + 1000);
  touch("Constellations", T + 2000);
  C.joinDeck(c, T + 4000);
  c.active = id("Magma");
  localStorage.setItem("ikolearn.v1.name", "Maya");
  localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem(
    "ikolearn.v1.seen",
    JSON.stringify({
      c: {},
      ev: 0,
      h: {
        aboutCloud: 1,
        aboutLesson: 1,
        aboutDeck: 1,
        cloud: 1,
        card: 1,
        chat: 1,
        draw: 1,
      },
    }),
  );
  localStorage.setItem(
    "ikolearn.v1.thread",
    JSON.stringify([
      {
        id: "m1",
        at: T,
        role: "model",
        local: true,
        text: "Welcome back, Maya.",
      },
    ]),
  );
}

export function readScreen() {
  function shown(sel) {
    var el = document.querySelector(sel);
    return Boolean(el && !el.hidden);
  }
  var panel = document.querySelector("#panel");
  var title = document.querySelector("#p-title");
  return {
    cloud: shown("#cloud"),
    lesson: shown("#lesson"),
    deck: shown("#deck"),
    hub: shown("#hub"),
    card: panel && !panel.hidden && title ? title.textContent || "" : "",
    start: shown("#cloud-start"),
    flow: shown(".cloud-flow"),
  };
}

export function readCamera() {
  var views = window.__views || [];
  var i;
  for (i = views.length - 1; i >= 0; i--) {
    if (views[i].id === "cloud-canvas" && views[i].view && views[i].view.state)
      return views[i].view.state();
  }
  return null;
}

/** True once Begin has finished: two subjects on the cloud, the start column gone, no build caption. */
export function cloudSettled(minSubjects) {
  var C = window.IkoCloud;
  var raw = localStorage.getItem("ikolearn.v1.cloud");
  var c = raw && C && C.deserialize(raw);
  var start = document.querySelector("#cloud-start");
  var caption = document.querySelector(".cloud-caption:not([hidden])");
  return Boolean(
    c &&
    C.subjects(c).length >= minSubjects &&
    start &&
    start.hidden &&
    !caption,
  );
}
