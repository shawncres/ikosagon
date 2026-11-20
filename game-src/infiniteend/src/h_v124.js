// v1.24: vertex budget first. Quest (LV >= 1, one eye, home gate) aims for
// <= 1_000_000 vertices and <= 80 draws. Desktop high (LV 0) may spend more.
const QUEST = LV >= 1;
const IE_BUDGET = { questVerts: 1000000, questDraws: 80 };

const packV = pack;
pack = function (L, s, hue, hv, w) {
  if (!L || L.per <= 8) return packV(L, s, hue, hv, w);
  const old = L.per;
  L.per = Math.max(QUEST ? 3 : 6, old * (QUEST ? .38 : .7) | 0);
  packV(L, s, hue, hv, w);
  L.per = old;
};
const growV = grow;
grow = function (L, n, v, sx, sy, sz, s, w) {
  growV(L, QUEST ? Math.max(1, n * .45 | 0) : n, v, sx, sy, sz, s, w);
};

function v124Hooks() {
  const E = window.ES;
  E.budget = () => ({ questVerts: IE_BUDGET.questVerts, questDraws: IE_BUDGET.questDraws, quest: QUEST, lv: LV, perf: E.perf() });
}
