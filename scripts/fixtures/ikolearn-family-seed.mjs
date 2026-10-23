// A neutral learner for the parents & teachers view (checks, e2e, screenshots): "Sam", with Ocean Life, Astronomy and
// Music, built only through the real model functions (applyCreate, engage, track, confirm, recordTest), so every number
// on the page is something the app itself would have stored. No model calls.
export const DAY = 86400000;
export function seedFamily(C, P, now) {
  const T = now - 12 * DAY, c = C.create("Sam", T);
  const kids = (names) => names.map((n, i) => ({ name: n, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core" }));
  C.applyCreate(c, { items: [
    { node: { name: "Coral Reefs", chain: ["Ocean Life"], motif: "wave" }, card: { title: "Coral Reefs", blurb: "Living reefs built by tiny animals.", goal: "" }, children: kids(["Coral Polyps", "Reef Fish", "Reef Bleaching"]) },
    { node: { name: "Whales", chain: ["Ocean Life"], motif: "fish" }, card: { title: "Whales", blurb: "The ocean's largest animals.", goal: "" }, children: kids(["Baleen Whales", "Whale Song"]) },
    { node: { name: "The Solar System", chain: ["Astronomy"], motif: "planet" }, card: { title: "The Solar System", blurb: "The Sun and everything that circles it.", goal: "" }, children: kids(["The Sun", "Planets", "Moons"]) },
    { node: { name: "Stargazing", chain: ["Astronomy"], motif: "star" }, card: { title: "Stargazing", blurb: "Finding your way around the night sky.", goal: "" }, children: kids(["Constellations", "Star Maps"]) },
    { node: { name: "Rhythm", chain: ["Music"], motif: "drum" }, card: { title: "Rhythm", blurb: "How music moves through time.", goal: "" }, children: kids(["Steady Beat", "Tempo", "Time Signatures"]) },
  ] }, { t: T });
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  /* a lesson: opened, some minutes with it open, and right answers (2 = covered) */
  const learn = (l, day, minutes, right) => {
    const x = id(l), t = T + day * DAY;
    C.engage(c, x, "open", t); C.track(c, x, minutes * 60, t);
    for (let i = 0; i < right; i++) C.confirm(c, x, true, t + 1000 + i);
    c.nodes[x].touched = Math.max(c.nodes[x].touched || 0, t + 5000);
    C.joinDeck(c, t + 6000); /* the app saves (and stamps completion) after every lesson */
  };
  learn("Coral Reefs", 0, 6, 1); learn("Coral Polyps", 1, 9, 2); learn("Reef Fish", 2, 7, 3); learn("The Sun", 3, 8, 2);
  learn("Reef Bleaching", 4, 5, 1); /* clear of the 7-day line, so "the last 7 days" is stable whenever the test runs */
  /* a test on Coral Reefs (2 of 3 core steps covered), passed 4 of 5 */
  const reef = id("Coral Reefs"), done = [id("Coral Polyps"), id("Reef Fish")];
  C.recordTest(c, reef, [{ id: done[0], right: true }, { id: done[1], right: true }, { id: reef, right: true }, { id: done[0], right: true }, { id: done[1], right: false }], T + 6 * DAY);
  C.joinDeck(c, T + 6 * DAY + 1000);
  learn("Planets", 7, 11, 2); learn("Steady Beat", 8, 5, 2); learn("Constellations", 9, 6, 1); learn("Moons", 10, 4, 0); learn("Tempo", 11, 3, 0);
  P.settleMerges(c, T + 11 * DAY);
  c.active = id("Constellations");
  c.profile.visits = 9;
  return c;
}
