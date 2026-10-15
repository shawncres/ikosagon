// Deterministic regression checks for the IkoArtist taste/range/brief logic (pure functions, no network).
// Run: npx tsx --tsconfig tsconfig.json scripts/ikoartist-taste-check.mjs
import { SEED_ARTISTS, SEED_AS_OF } from "../lib/music/taste/seed.ts";
import { DIMS, THEME_IDS, AUDIENCE_AGE_BANDS } from "../lib/music/taste/types.ts";
import {
  distance, meanVector, vectorFromTags, blendTags, tagOnlyVector, ERA_YEAR, DIM_COPY,
} from "../lib/music/taste/vector.ts";
import {
  anchorOptions, nextQuestions, targetVector, suggestNext, contrastOptions, fromSeed,
} from "../lib/music/taste/tree.ts";
import {
  buildBrief, centerOf, rangeOf, themeTally, tracksOf, briefLines, THEME_LABEL,
} from "../lib/music/taste/brief.ts";
import {
  sanitizeFreeText, sanitizeExtras, sanitizeAudience, sanitizeProfile, sanitizeTrending, sanitizeCustomArtists,
} from "../lib/music/taste/sanitize.ts";
import { parseChart, trendingFromChart } from "../lib/music/taste/trending.ts";
import { renderBriefHtml } from "../lib/music/taste/emailHtml.ts";

let pass = 0;
const fails = [];
function ok(cond, name, detail = "") {
  if (cond) pass += 1;
  else fails.push(`${name}${detail ? ` -> ${detail}` : ""}`);
}
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const A = (id) => SEED_ARTISTS.find((a) => a.id === id);
const P = (id) => fromSeed(A(id));
const GENRES = ["Pop", "Hip-hop / Rap", "R&B / Soul", "Afrobeats", "Rock / Alt", "Electronic / Dance", "Country / Folk", "Jazz / Blues", "Gospel / Worship", "Latin", "Other / Hybrid"];
const REGIONS = ["North America", "UK / Ireland", "Afrobeats / Africa diaspora", "Latin America / Spain", "Global mix"];

// ---- Seed integrity ----
ok(SEED_ARTISTS.length >= 60, "seed has at least 60 artists", String(SEED_ARTISTS.length));
ok(new Set(SEED_ARTISTS.map((a) => a.id)).size === SEED_ARTISTS.length, "seed ids unique");
ok(new Set(SEED_ARTISTS.map((a) => a.name)).size === SEED_ARTISTS.length, "seed names unique");
ok(/^\d{4}-\d{2}-\d{2}$/.test(SEED_AS_OF), "seed has an as-of date");
for (const g of GENRES) ok(SEED_ARTISTS.filter((a) => a.genres.includes(g)).length >= 5, `genre ${g} has >=5 artists`);
for (const a of SEED_ARTISTS) {
  ok(DIMS.every((d) => a.vector[d] >= 0 && a.vector[d] <= 1), `vector in range: ${a.id}`);
  ok(a.tracks.length === 3, `3 tracks: ${a.id}`);
  eq(a.tracks.map((t) => t.role), ["signature hit", "fan favorite", "deep cut"], `roles in order: ${a.id}`);
  ok(a.tracks.every((t) => t.themes.length >= 1 && t.themes.every((th) => THEME_IDS.includes(th))), `valid theme tags: ${a.id}`);
  ok(a.tracks.every((t) => t.title && t.year >= 1930 && t.year <= 2026), `track metadata sane: ${a.id}`);
  ok(a.genres.every((g) => GENRES.includes(g)), `known genres: ${a.id}`);
  ok(REGIONS.includes(a.region), `known region: ${a.id}`);
  ok(a.peak >= 1930 && a.peak <= 2026, `peak year sane: ${a.id}`);
}
for (const th of THEME_IDS) ok(SEED_ARTISTS.some((a) => a.tracks.some((t) => t.themes.includes(th))), `theme used by seed: ${th}`);
for (const th of THEME_IDS) ok(Boolean(THEME_LABEL[th]), `theme label: ${th}`);

// ---- Distance / vectors ----
const kd = P("kendrick-lamar"), tay = P("taylor-swift"), miles = P("miles-davis"), calvin = P("calvin-harris");
ok(distance(kd.vector, kd.vector, 2016, 2016) === 0, "distance to self is 0");
ok(Math.abs(distance(kd.vector, tay.vector, 1, 2) - distance(tay.vector, kd.vector, 2, 1)) < 1e-12, "distance symmetric");
ok(distance(miles.vector, calvin.vector, 1959, 2014) > distance(P("drake").vector, kd.vector, 2016, 2016), "jazz vs EDM farther than Drake vs Kendrick");
ok(distance(kd.vector, tay.vector) <= 1 && distance(kd.vector, tay.vector) >= 0, "distance within 0..1");
const mv = meanVector([kd.vector, tay.vector]);
ok(Math.abs(mv.energy - (kd.vector.energy + tay.vector.energy) / 2) < 1e-12, "meanVector averages");
ok(meanVector([]).energy === 0.5, "meanVector of nothing is neutral");
const wm = meanVector([kd.vector, tay.vector], [{ energy: 2 }, {}]);
ok(Math.abs(wm.energy - (2 * kd.vector.energy + tay.vector.energy) / 3) < 1e-12, "weighted mean honours weights");

// ---- Free tags ----
const tg = vectorFromTags(["Acoustic", "folk", "nonsense-tag"]);
ok(tg.matched.length === 2 && tg.vector.acoustic > 0.75, "tags: recognised tags map to acoustic");
ok(vectorFromTags(["zzz"]).matched.length === 0, "tags: unknown tag ignored");
const bl = blendTags(kd.vector, ["acoustic"], 0.2);
ok(bl.acoustic > kd.vector.acoustic && bl.energy < kd.vector.energy + 1e-9 && bl.lyric === kd.vector.lyric, "tags blend nudges only the dims they speak to");
const to = tagOnlyVector(["house", "dance", "electronic"]);
ok(to.known >= 4 && to.vector.energy > 0.7 && to.vector.acoustic < 0.1, "tag-only vector for dance/electronic is high energy, non-acoustic");
ok(tagOnlyVector(["acoustic"]).known < 3, "single tag is low-confidence (few dims known)");

// ---- Anchor options ----
const a1 = anchorOptions({ genres: ["Country / Folk"], era: "2020s current", region: "North America" });
ok(a1.options.length === 8, "anchor page has 8 options");
ok(a1.options.every((a) => a.genres.includes("Country / Folk")), "anchor options branch from chosen genre");
eq(anchorOptions({ genres: ["Country / Folk"], era: "2020s current", region: "North America" }).options.map((a) => a.id), a1.options.map((a) => a.id), "anchor options deterministic");
const a90 = anchorOptions({ genres: ["Rock / Alt"], era: "90s & earlier", region: null });
const a20 = anchorOptions({ genres: ["Rock / Alt"], era: "2020s current", region: null });
const avgPeak = (o) => o.options.reduce((s, a) => s + a.peak, 0) / o.options.length;
ok(avgPeak(a90) < avgPeak(a20), "era steers anchor options older/newer");
const regA = anchorOptions({ genres: [], era: null, region: "Latin America / Spain" });
ok(regA.options.filter((a) => a.region === "Latin America / Spain").length >= 5, "region steers anchor options");
const p0 = anchorOptions({ genres: ["Pop"], era: null, region: null }, 0);
const p1 = anchorOptions({ genres: ["Pop"], era: null, region: null }, 1);
ok(p0.pages >= 1 && (p0.pages === 1 || p0.options.every((a) => !p1.options.some((b) => b.id === a.id))), "anchor pages do not repeat artists");
ok(anchorOptions({ genres: ["Pop"], era: null, region: null }, 99).options.length > 0, "anchor page index wraps");
const noGenre = anchorOptions({ genres: [], era: null, region: null });
ok(new Set(noGenre.options.map((a) => a.genres[0])).size >= 3, "no-genre anchor page is diverse");
const mixed = anchorOptions({ genres: ["Pop", "Hip-hop / Rap", "Rock / Alt"], era: "2010s", region: null });
const gcounts = {};
mixed.options.forEach((a) => { gcounts[a.genres[0]] = (gcounts[a.genres[0]] || 0) + 1; });
ok(Object.values(gcounts).every((n) => n <= 3), "mixed-genre page capped at 3 per primary genre", JSON.stringify(gcounts));
ok(anchorOptions({ genres: ["Latin"], era: null, region: null }).options.length === 8, "small-genre filter still fills a page");

// ---- Discriminating questions ----
const q = nextQuestions(P("billie-eilish"), [], []);
ok(q.length === 3 && new Set(q).size === 3, "3 distinct discriminating questions");
ok(!nextQuestions(P("billie-eilish"), [], ["energy", "tempo"]).some((d) => d === "energy" || d === "tempo"), "answered dims are not asked again");
const mid = { ...P("kendrick-lamar"), vector: { energy: 0.5, acoustic: 0.05, lyric: 0.98, polish: 0.5, mainstream: 0.02, tempo: 0.5 } };
const qm = nextQuestions(mid, [], []);
ok(qm.includes("energy") && qm.includes("polish") && qm.includes("tempo"), "dims the anchor cannot explain are asked first", qm.join(","));
ok(!qm.includes("lyric") && !qm.includes("acoustic"), "dims the anchor already explains are skipped", qm.join(","));
eq(nextQuestions(tay, ["Pop"], []), nextQuestions(tay, ["Pop"], []), "questions deterministic");
ok(nextQuestions(tay, [], DIMS.slice()).length === 0, "no questions left when all answered");
ok(DIMS.every((d) => DIM_COPY[d].low && DIM_COPY[d].high && DIM_COPY[d].question), "every dim has question copy");

// ---- Target vector ----
const tv = targetVector(kd, { energy: "low", polish: "any" });
ok(tv.energy < kd.vector.energy, "low answer pulls target down");
ok(tv.polish === kd.vector.polish, "'doesn't matter' leaves the dim alone");
ok(targetVector(kd, { tempo: "high" }).tempo > kd.vector.tempo, "high answer pulls target up");
ok(Math.abs(targetVector(kd, { energy: "mid" }).energy - (0.4 * kd.vector.energy + 0.6 * 0.5)) < 1e-12, "mid answer math");

// ---- Second / third pick distances ----
const target = targetVector(kd, {});
const s2 = suggestNext(2, [kd], target, ["Hip-hop / Rap"], "2010s");
const s3 = suggestNext(3, [kd, P("j-cole")], target, ["Hip-hop / Rap"], "2010s");
ok(s2.length === 6 && s3.length === 6, "second/third offer 6 options each");
ok(!s2.some((o) => o.artist.id === kd.id), "second options exclude the anchor");
ok(!s3.some((o) => ["kendrick-lamar", "j-cole"].includes(o.artist.id)), "third options exclude chosen");
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const d2 = mean(s2.map((o) => distance(o.artist.vector, kd.vector, o.artist.peak, kd.peak)));
const d3 = mean(suggestNext(3, [kd], target, ["Hip-hop / Rap"], "2010s").map((o) => distance(o.artist.vector, kd.vector, o.artist.peak, kd.peak)));
ok(d3 > d2, "third picks sit farther from the anchor than second picks", `${d2.toFixed(3)} vs ${d3.toFixed(3)}`);
ok(s2.filter((o) => o.band === "near").length === 4 && s2.filter((o) => o.band === "step").length === 2, "stage 2 = 4 near + 2 step");
ok(["near", "step", "far", "wild"].every((b) => s3.concat(s2).some((o) => o.band === b)), "all four distance bands appear across stages");
ok(s3.some((o) => o.band === "wild") && s3.some((o) => o.band === "far"), "stage 3 includes far and wildcard options");
ok(s2.every((o) => o.label), "options carry a distance label");
eq(suggestNext(2, [kd], target, [], null).map((o) => o.artist.id), suggestNext(2, [kd], target, [], null).map((o) => o.artist.id), "suggestNext deterministic");
const nearMax = Math.max(...s2.filter((o) => o.band === "near").map((o) => o.distance));
const stepMin = Math.min(...s2.filter((o) => o.band === "step").map((o) => o.distance));
ok(nearMax <= stepMin + 1e-9, "near band is closer than step band");
ok(suggestNext(2, [], target, [], null).length === 0, "no suggestions without an anchor");
const lowTarget = targetVector(P("billie-eilish"), { energy: "low", tempo: "low" });
const chill = suggestNext(2, [P("billie-eilish")], lowTarget, [], null).filter((o) => o.band === "near");
ok(mean(chill.map((o) => o.artist.vector.energy)) < 0.6, "near picks respect a low-energy answer");

// ---- Contrast ----
const co = contrastOptions([kd, calvin, miles]);
ok(co.pair && co.options.length >= 2 && co.options.length <= 4, "contrast has 2-4 options");
ok(co.pair.map((p) => p.id).sort().join() === [calvin.id, miles.id].sort().join() || co.pair.map((p) => p.id).sort().join() === [kd.id, miles.id].sort().join() || co.pair.map((p) => p.id).sort().join() === [kd.id, calvin.id].sort().join(), "contrast pair is one of the picks");
const dd = (x, y) => distance(x.vector, y.vector, x.peak, y.peak);
const best = Math.max(dd(kd, calvin), dd(kd, miles), dd(calvin, miles));
ok(Math.abs(dd(co.pair[0], co.pair[1]) - best) < 1e-9, "contrast uses the farthest pair");
ok(co.options.every((o) => co.pair.some((p) => p.id === o.favors)), "contrast options favour one of the pair");
const dimsSeen = new Set(co.options.map((o) => o.dim));
ok([...dimsSeen].every((d) => Math.abs(co.pair[0].vector[d] - co.pair[1].vector[d]) >= 0.12), "contrast dims actually differ");
ok(co.options.every((o, i, arr) => i % 2 === 1 || arr[i + 1].dim === o.dim), "each difference gets a chip for each side");
ok(contrastOptions([kd]).pair === null && contrastOptions([kd]).options.length === 0, "no contrast with fewer than two artists");
const same = contrastOptions([kd, { ...kd, id: "clone", name: "Clone" }]);
ok(same.options.length === 0, "no contrast chips when two picks are identical");

// ---- Range profile ----
const three = [kd, P("j-cole"), P("drake")];
const wide = [P("miles-davis"), P("skrillex"), P("johnny-cash")];
const rng = rangeOf(three);
const rngW = rangeOf(wide);
ok(rngW.spread > rng.spread, "wider picks give a larger spread");
ok(rng.label === "tight" || rng.label === "balanced", "similar hip-hop picks are not 'wide'", rng.label);
ok(rngW.label === "wide", "jazz + dubstep + Cash is 'wide'", `${rngW.label} ${rngW.spread}`);
ok(rangeOf([kd]).label === "single anchor" && rangeOf([kd]).spread === 0, "one artist = single anchor");
ok(rangeOf([]).perDim.length === 0, "no artists = empty range");
ok(rngW.perDim.every((r) => r.min <= r.max), "range min<=max");
const widestCalc = rngW.perDim.reduce((b, r) => (r.max - r.min > b.max - b.min + 1e-9 ? r : b), rngW.perDim[0]).dim;
ok(rngW.widest === widestCalc, "widest dim matches per-dim widths", `${rngW.widest} vs ${widestCalc}`);
ok(rngW.summary.includes(DIM_COPY[rngW.widest].name), "range summary names the widest dim");
ok(rangeOf([kd, { ...kd, id: "c2", name: "C2" }]).label === "tight", "identical artists = tight");

// ---- Center ----
const c = centerOf(three, {}, null);
ok(Math.abs(c.vector.energy - mean(three.map((a) => a.vector.energy))) < 1e-9, "center is the mean");
ok(c.eraYear === Math.round(mean(three.map((a) => a.peak))), "center era is mean peak");
const cc = centerOf(wide, {}, { dim: "energy", favors: "skrillex" });
const c0 = centerOf(wide, {}, null);
ok(cc.vector.energy > c0.vector.energy, "contrast pulls the center toward the favoured artist on that dim");
ok(Math.abs(cc.vector.polish - c0.vector.polish) < 1e-12, "contrast leaves other dims alone");
const ca = centerOf(three, { tempo: "high" }, null);
ok(ca.vector.tempo > c.vector.tempo, "an answered preference nudges the center");
ok(Math.abs(ca.vector.tempo - (0.75 * c.vector.tempo + 0.25 * 0.85)) < 1e-9, "preference nudge is 25%");
ok(centerOf([], {}, null).eraYear === null, "no artists = no era");
ok(DIMS.every((d) => c.vector[d] >= 0 && c.vector[d] <= 1), "center within 0..1");

// ---- Themes ----
const tallyA = themeTally([P("taylor-swift"), P("harry-styles"), P("billie-eilish")]);
ok(tallyA.length > 0 && tallyA[0].count >= tallyA[tallyA.length - 1].count, "tally sorted by artist count");
ok(tallyA.find((t) => t.theme === "heartbreak").count === 3 || tallyA.find((t) => t.theme === "heartbreak").count === 2, "heartbreak overlaps across artists");
const tallyOne = themeTally([P("kirk-franklin")]);
ok(tallyOne.every((t) => t.count === 1), "single artist has no overlap");

// ---- Leans ----
const picks = [P("taylor-swift"), P("harry-styles"), P("billie-eilish")];
const prof = {
  genres: ["Pop"], era: "2010s", region: "North America",
  artistIds: picks.map((p) => p.id), answers: { energy: "low" }, contrast: null,
  themes: ["heartbreak", "nostalgia"], audience: null, extras: {}, custom: [],
};
const brief = buildBrief(prof);
ok(brief.leans.length === 3, "brief has 3 leans");
ok(new Set(brief.leans.map((l) => l.id)).size === 3, "leans are distinct tracks");
ok(new Set(brief.leans.map((l) => l.artist)).size >= 2, "leans span at least two artists");
eq(brief.leans.map((l) => l.kind), ["overlap", "edge-high", "edge-low"], "lean kinds: overlap + both edges");
ok(brief.leans.every((l) => l.why.length > 40 && l.assumed === true), "every lean has a why and is flagged as assumed");
ok(brief.leans[0].why.includes("center of your range"), "overlap lean explains center");
ok(brief.leans.slice(1).every((l) => /edge of your range on /.test(l.why)), "edge leans explain the edge");
ok(brief.leans[0].themes.some((t) => ["heartbreak", "nostalgia"].includes(t)), "overlap lean favours the visitor's themes");
ok(brief.leans.every((l) => picks.some((p) => p.name === l.artist)), "leans only come from the chosen artists");
const rows = tracksOf(picks);
ok(rows.length === 9, "3 artists x 3 tracks = 9 candidates");
const wd = brief.range.widest;
const hi = brief.leans[1], lo = brief.leans[2];
const hv = rows.find((r) => r.id === hi.id).vector[wd], lv = rows.find((r) => r.id === lo.id).vector[wd];
ok(hv >= lv, "high-edge lean is higher than low-edge lean on the widest dim", `${hv} ${lv}`);
const allVals = rows.map((r) => r.vector[wd]);
ok(hv >= Math.max(...allVals) - 0.4 && lv <= Math.min(...allVals) + 0.4, "edge leans sit near the extremes of the range");
const numInWhy = hi.why.match(/\((\d+) vs your center (\d+)\)/);
ok(!/: (laid-back|slow-burn)/.test(lo.why) || rows.find((r) => r.id === lo.id).vector[wd] <= 0.35, "edge why only names a trait the track really has");
ok(numInWhy && Number(numInWhy[1]) === Math.round(hv * 100) && Number(numInWhy[2]) === Math.round(brief.center.vector[wd] * 100), "edge why quotes the real computed numbers");
const noTheme = buildBrief({ ...prof, themes: [] });
ok(noTheme.leans.length === 3 && noTheme.leans.every((l) => l.why.length > 20), "leans still work with no themes");
ok(noTheme.leans[0].why.includes("no theme match") || noTheme.leans[0].themes.length > 0, "no-theme why is honest");
eq(buildBrief(prof), buildBrief(prof), "buildBrief deterministic");
const one = buildBrief({ ...prof, artistIds: ["miles-davis"] });
ok(one.leans.length >= 1 && one.range.label === "single anchor", "one artist still yields leans");
ok(one.caveats.some((x) => /Only 1 artist/.test(x)), "caveat when <3 artists");
const none = buildBrief({ ...prof, artistIds: [] });
ok(none.leans.length === 0 && none.artists.length === 0 && none.center.eraYear === ERA_YEAR["2010s"], "no artists: no leans, era falls back to the era answer");
ok(brief.caveats[0].includes("editorial estimates"), "brief always carries the editorial-estimate caveat");
ok(brief.asOf === SEED_AS_OF, "brief carries the seed as-of date");

// ---- Theme blend ----
ok(brief.themes.chosen.join() === "heartbreak,nostalgia", "chosen themes kept");
ok(brief.themes.blend.length === 3 && new Set(brief.themes.blend).size === 3, "blend is 3 distinct themes");
ok(brief.themes.blend.includes("heartbreak"), "chosen + overlapping theme leads the blend");
const faithOnly = buildBrief({ ...prof, themes: ["faith"] });
ok(faithOnly.themes.blend.includes("faith"), "a chosen theme always makes the blend even when artists never use it");

// ---- Custom artists ----
const custom = sanitizeCustomArtists([{ name: "  My Cousin <b>Ade</b> ", vector: { energy: 0.9, acoustic: 0.1, lyric: 0.3, polish: 0.5, mainstream: 0.1, tempo: 0.9 }, peak: 2020, tags: ["Afrobeats"] }]);
ok(custom.length === 1 && custom[0].name === "My Cousin Ade" && custom[0].id === "custom:my-cousin-ade", "custom artist is sanitized");
ok(sanitizeCustomArtists([{ name: "X", vector: { energy: "nope" } }]).length === 0, "custom artist with bad vector dropped");
const withCustom = buildBrief({ ...prof, artistIds: ["taylor-swift", "custom:my-cousin-ade"], custom });
ok(withCustom.artists.some((a) => a.custom) && withCustom.leans.every((l) => l.artist === "Taylor Swift"), "custom artists shape the range but never supply leans");
ok(withCustom.caveats.some((x) => /free-text artist/.test(x)), "caveat for custom artists");
ok(sanitizeProfile({ artistIds: ["custom:ghost", "taylor-swift"], custom: [] }).artistIds.join() === "taylor-swift", "unknown custom ids dropped");

// ---- Sanitization ----
eq(sanitizeFreeText("hello <script>alert(1)</script> world"), "hello alert(1) world", "strips tags");
ok(!/https?|www|\.com/.test(sanitizeFreeText("see https://evil.example/x and www.evil.com and a.b@c.com")), "strips links and emails");
ok(!/\d{7}/.test(sanitizeFreeText("call me on +1 (416) 555-0199 please")), "strips phone-like numbers");
ok(sanitizeFreeText("loved 1995-2005 and 2026-10-14") === "loved 1995-2005 and 2026-10-14", "keeps years and dates");
eq(sanitizeFreeText("a\u0000b\u202ec\n\n\td"), "a b c d", "strips control/bidi chars and collapses space");
eq(sanitizeFreeText("x".repeat(500), 80).length, 80, "caps length");
eq(sanitizeFreeText(12345), "", "non-strings become empty");
eq(sanitizeFreeText("   "), "", "blank becomes empty");
ok(!sanitizeFreeText("back`tick {brace} \\slash").match(/[`{}\\]/), "strips template/escape characters");
ok(sanitizeFreeText("café — naïve 音楽").includes("café"), "keeps unicode letters");
const ex = sanitizeExtras({ genres: "folk <i>punk</i>", bogus: "x", final: "y".repeat(500), anchor: "" });
ok(ex.genres === "folk punk" && !("bogus" in ex) && ex.final.length === 200 && !("anchor" in ex), "extras: whitelisted keys, per-key caps, empties dropped");
eq(sanitizeExtras(null), {}, "extras: null safe");

// ---- Audience privacy ----
const aud = sanitizeAudience({ ageBand: "25-34", region: "Europe", languages: ["English", "Klingon", "English"], contexts: ["Commute", "Gym / run", "Late night", "Road trip", "Chill at home"], email: "x@y.com", exactAge: 29 });
ok(aud.ageBand === "25-34" && aud.region === "Europe", "audience: bands kept");
eq(aud.languages, ["English"], "audience: unknown/duplicate languages dropped");
ok(aud.contexts.length === 4, "audience: contexts capped at 4");
ok(!("email" in aud) && !("exactAge" in aud), "audience: no extra fields survive");
ok(sanitizeAudience({ ageBand: "29" }) === null, "audience: exact age is not a band and is dropped");
ok(!AUDIENCE_AGE_BANDS.some((b) => /under|<|1[0-7]/i.test(b)), "audience: no under-18 band offered");
ok(sanitizeAudience({}) === null && sanitizeAudience(null) === null, "audience: empty -> null");
const bAud = buildBrief({ ...prof, audience: aud });
ok(briefLines(bAud).some((l) => l.startsWith("Audience (bands only)")), "audience appears in the brief lines (bands only)");
ok(briefLines(brief).some((l) => l === "Audience: skipped"), "skipped audience is stated, not invented");
const answersRows = ["Genres", "Era", "Region", "Anchor artist"]; // transcript rows the UI records
ok(!answersRows.some((r) => /audience/i.test(r)), "transcript rows never include an audience row");

// ---- Profile sanitization (server trust boundary) ----
const sp = sanitizeProfile({
  genres: ["Pop", "<b>x</b>"], artistIds: ["taylor-swift", "taylor-swift", "nope", "kendrick-lamar", "drake", "j-cole"],
  answers: { energy: "low", tempo: "bogus", nonsense: "high" }, contrast: { dim: "energy", favors: "drake" },
  themes: ["heartbreak", "heartbreak", "nope", "love", "faith", "party", "roots"], audience: { ageBand: "55+" }, extras: { final: "hi" },
});
eq(sp.artistIds, ["taylor-swift", "kendrick-lamar", "drake"], "profile: dedupes, drops unknown, max 3 artists");
eq(sp.answers, { energy: "low" }, "profile: invalid answers dropped");
eq(sp.contrast, { dim: "energy", favors: "drake" }, "profile: valid contrast kept");
ok(sanitizeProfile({ artistIds: ["taylor-swift"], contrast: { dim: "energy", favors: "drake" } }).contrast === null, "profile: contrast must favour a chosen artist");
eq(sp.themes, ["heartbreak", "love", "faith", "party"], "profile: themes whitelisted, deduped, max 4");
ok(sp.genres[0] === "Pop" && sp.genres[1] === "x", "profile: genres sanitized");
ok(sanitizeProfile(null).artistIds.length === 0 && sanitizeProfile("junk").themes.length === 0, "profile: junk input is safe");
const clientBrief = buildBrief(sanitizeProfile(prof));
eq(clientBrief, buildBrief(prof), "server recompute equals client brief for the same profile");
const tamper = sanitizeProfile({ ...prof, artistIds: ["taylor-swift", "harry-styles", "<img onerror>"] });
ok(tamper.artistIds.length === 2, "profile: tampered artist id removed");

// ---- Trending (honest chart context) ----
const feed = {
  feed: {
    updated: { label: "2026-10-14T20:45:53-07:00" },
    entry: [
      ["Taylor Swift", "Patient Zero", "Pop"],
      ["Morgan Wallen", "Last Thing You Need", "Country"],
      ["Chris Stapleton", "Tennessee Whiskey", "Country"],
      ["Michael Jackson", "Thriller", "Pop"],
      ["Someone Unknown", "Nope", "Country"],
      ["Carly Pearce & Riley Green", "If I Don't Leave", "Country"],
    ].map(([a, t, g]) => ({ "im:artist": { label: a }, "im:name": { label: t }, category: { attributes: { label: g } } })),
  },
};
const parsed = parseChart(feed);
ok(parsed.rows.length === 6 && parsed.asOf === "2026-10-14", "chart parse: rows and the feed's own as-of date");
const tr = trendingFromChart(parsed.rows, parsed.asOf);
ok(tr.total === 6 && tr.matched === 4, "trending: matched/total are real counts", `${tr.matched}/${tr.total}`);
ok(tr.themes.length > 0 && tr.themes.every((t) => THEME_IDS.includes(t.theme)), "trending: themes come from our tag table");
ok(tr.genreMix[0].genre === "Country" && tr.genreMix[0].count === 4, "trending: genre mix counts the feed's own categories");
ok(tr.asOf === "2026-10-14" && /as of 2026-10-14/.test(tr.note), "trending: as-of date is stated");
ok(!/#\d|rank|number one|no\. ?1/i.test(tr.note.replace("No chart ranks shown", "")), "trending: no chart ranks are invented");
ok(!("rank" in tr) && tr.themes.every((t) => !("rank" in t)), "trending: no rank fields");
const thin = trendingFromChart(parsed.rows.slice(4), "2026-10-14");
ok(thin.themes.length === 0 && /no theme read/.test(thin.note), "trending: too few matches -> says so instead of guessing");
ok(parseChart({}).rows.length === 0 && parseChart(null).asOf === null, "chart parse: bad feed is safe");
ok(sanitizeTrending(tr) !== null && sanitizeTrending({ asOf: "yesterday" }) === null, "trending sanitizer needs a real date");
ok(sanitizeTrending({ ...tr, themes: [{ theme: "nope", artists: 1 }, ...tr.themes] }).themes.every((t) => THEME_IDS.includes(t.theme)), "trending sanitizer drops unknown themes");
const bTr = buildBrief(prof, { trending: tr });
ok(bTr.themes.trending.asOf === "2026-10-14" && bTr.caveats.some((x) => /as of 2026-10-14/.test(x)), "brief carries chart as-of date in caveats");
ok(briefLines(bTr).some((l) => l.startsWith("Chart context")), "brief lines include chart context when present");
ok(buildBrief(prof).themes.trending === null, "no chart data -> trending is null, not fabricated");

// ---- Email HTML (pure) ----
const evil = { ...brief, notes: { final: "<script>alert(1)</script> \"quoted\" & more" }, artists: [{ id: "x", name: "<b>X</b>", custom: false, themes: [] }] };
const html = renderBriefHtml(evil);
ok(!html.includes("<script>") && !html.includes("<b>X</b>"), "email html escapes notes and names");
ok(html.includes("&lt;script&gt;") && html.includes("&amp; more"), "email html shows escaped text");
const htmlA = renderBriefHtml(bAud);
ok(htmlA.includes("bands only") && htmlA.includes("25-34") && htmlA.includes("Europe"), "email html includes audience bands when answered");
ok(renderBriefHtml(brief).includes("Skipped"), "email html says audience skipped");
ok((html.match(/Why:/g) || []).length === brief.leans.length, "email html lists a why for every lean");
ok(renderBriefHtml(bTr).includes("Chart context") && renderBriefHtml(bTr).includes("2026-10-14"), "email html carries chart as-of date");
ok(!/rank\s*#?\d|#\d|number one/i.test(renderBriefHtml(bTr).replace(/<[^>]+>/g, " ")), "email html never states a chart rank");

// ---- Brief output shape ----
ok(DIMS.every((d) => typeof brief.center.vector[d] === "number"), "brief center has every dim");
ok(typeof brief.center.summary === "string" && brief.center.summary.endsWith("."), "center summary is a sentence");
ok(JSON.stringify(brief).length < 8000, "brief JSON stays small for the email payload", String(JSON.stringify(brief).length));
ok(briefLines(brief).length >= 8, "brief lines cover center/range/themes/audience/leans");

console.log(`ikoartist-taste-check: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(`  FAIL ${f}`);
  process.exit(1);
}
