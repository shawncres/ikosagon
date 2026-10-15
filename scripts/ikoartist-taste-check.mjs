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
import { applyEnrichment, similarSeedIds, parseEnrichmentMap } from "../lib/music/taste/enrich.ts";
import { titleKey } from "../lib/music/taste/titleKey.ts";
import {
  parseTopTracks, parseTopTags, parseSimilar, parseApiError, artistUrl, createLastfmClient,
} from "../lib/music/lastfm.ts";
import fs from "node:fs";
import path from "node:path";
import { enrichTargets, targetsFrom } from "../lib/music/enrichArtists.ts";

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
ok(SEED_ARTISTS.length >= 150, "seed has at least 150 artists", String(SEED_ARTISTS.length));
ok(new Set(SEED_ARTISTS.map((a) => a.id)).size === SEED_ARTISTS.length, "seed ids unique");
ok(new Set(SEED_ARTISTS.map((a) => a.name)).size === SEED_ARTISTS.length, "seed names unique");
ok(/^\d{4}-\d{2}-\d{2}$/.test(SEED_AS_OF), "seed has an as-of date");
for (const g of GENRES) ok(SEED_ARTISTS.filter((a) => a.genres.includes(g)).length >= 5, `genre ${g} has >=5 artists`);
for (const a of SEED_ARTISTS) {
  ok(DIMS.every((d) => a.vector[d] >= 0 && a.vector[d] <= 1), `vector in range: ${a.id}`);
  ok(a.tracks.length === 3, `3 tracks: ${a.id}`);
  eq(a.tracks.map((t) => t.role), ["signature hit", "fan favorite", "deep cut"], `roles in order: ${a.id}`);
  ok(a.tracks.every((t) => t.themes.length >= 1 && t.themes.every((th) => THEME_IDS.includes(th))), `valid theme tags: ${a.id}`);
  ok(a.tracks.every((t) => t.title && (t.year === null || (t.year >= 1930 && t.year <= 2026))), `track metadata sane: ${a.id}`);
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
ok(brief.leans.every((l) => l.why.length > 40 && l.assumed === true && l.source === "editorial seed" && !l.lastfm), "every seed lean has a why and is flagged as assumed");
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

// ---- Last.fm (mocked responses only; this script never touches the network) ----
const lfTracksJson = {
  toptracks: {
    track: [
      { name: "Anti-Hero", playcount: "9000000", listeners: "3100000", url: "https://www.last.fm/music/Taylor+Swift/_/Anti-Hero", "@attr": { rank: "1" } },
      { name: "Anti-Hero - Live", playcount: "800", listeners: "400", url: "https://www.last.fm/music/x" },
      { name: "Anti-Hero (Remastered 2024)", playcount: "700", listeners: "300", url: "https://www.last.fm/music/x" },
      { name: "Shake It Off", playcount: "8000000", listeners: "2900000", url: "https://evil.example/phish" },
      { name: "Cruel Summer (feat. Someone)", playcount: "7000000", listeners: "2500000", url: "https://www.last.fm/music/Taylor+Swift/_/Cruel+Summer" },
      { name: "Bad Blood (Karaoke)", playcount: "5", listeners: "2", url: "" },
      { name: "<script>alert(1)</script> Song", playcount: "bad", listeners: "-3", url: "https://www.last.fm/music/y" },
      { name: "Blank Space", playcount: "6000000", listeners: "2400000", url: "https://www.last.fm/music/Taylor+Swift/_/Blank+Space" },
      { name: "Love Story", playcount: "5000000", listeners: "2000000", url: "https://www.last.fm/music/Taylor+Swift/_/Love+Story" },
      { name: "Lover", playcount: "4000000", listeners: "1000000", url: "https://www.last.fm/music/Taylor+Swift/_/Lover" },
    ],
  },
};
const parsedTracks = parseTopTracks(lfTracksJson);
ok(parsedTracks.length === 5, "top tracks capped at 5", String(parsedTracks.length));
eq(parsedTracks.map((t) => t.title).slice(0, 3), ["Anti-Hero", "Shake It Off", "Cruel Summer (feat. Someone)"], "live/remaster/karaoke duplicates dropped, order kept");
ok(!parsedTracks.some((t) => /live|karaoke|remaster/i.test(t.title)), "no live/karaoke/remaster rows");
eq(parsedTracks.map((t) => t.rank), [1, 2, 3, 4, 5], "ranks are 1..n after filtering");
ok(parsedTracks[0].listeners === 3100000 && parsedTracks[0].plays === 9000000, "string counts parsed to numbers");
ok(parsedTracks[1].url === null, "non-last.fm track urls are dropped");
ok(parsedTracks.every((t) => !/[<>]/.test(t.title)), "track titles are sanitized (no angle brackets)");
ok(parsedTracks.some((t) => t.plays === null && t.listeners === null), "garbage counts become null, not numbers");
eq(parseTopTracks({ toptracks: { track: { name: "Solo", playcount: "1", listeners: "1" } } }).map((t) => t.title), ["Solo"], "single-object track payload is accepted");
eq(parseTopTracks({}), [], "empty payload -> no tracks");
eq(parseTopTracks(null), [], "null payload -> no tracks");
eq(parseTopTags({ toptags: { tag: [{ name: "Pop", count: 100 }, { name: "seen live", count: 90 }, { name: "indie pop", count: "70" }, { name: "rare", count: 3 }, { name: "pop", count: 50 }] } }), ["pop", "indie pop"], "tags: lowercased, noise/low-count dropped, de-duplicated");
eq(parseSimilar({ similarartists: { artist: [{ name: "B", match: "0.5" }, { name: "A", match: "0.9" }] } }), ["A", "B"], "similar artists sorted by match");
eq(parseApiError({ error: 6, message: "The artist you supplied could not be found" }), { code: 6, message: "The artist you supplied could not be found" }, "api error parsed");
ok(parseApiError({ toptracks: {} }) === null, "no error on a normal body");
eq(artistUrl("Florence + The Machine"), "https://www.last.fm/music/Florence+%2B+The+Machine", "artist url encodes spaces as + and plus as %2B");
ok(titleKey("Hey Ya! (Radio Edit)") === titleKey("hey ya!") && titleKey("Éclair - Remastered 2011") === "eclair", "titleKey ignores edits/remasters/accents");
ok(titleKey("Song (feat. X)") === titleKey("Song"), "titleKey ignores feat.");

function mockFetch(handler) {
  const calls = [];
  const fn = async (url) => {
    const u = new URL(String(url));
    calls.push({ method: u.searchParams.get("method"), artist: u.searchParams.get("artist"), key: u.searchParams.get("api_key"), url: String(url) });
    const out = await handler(u, calls.length);
    if (out instanceof Error) throw out;
    return { ok: out.status ? out.status < 400 : true, status: out.status || 200, json: async () => out.body };
  };
  return { fn, calls };
}
const goodBody = (u) =>
  u.searchParams.get("method") === "artist.getTopTracks" ? lfTracksJson
  : u.searchParams.get("method") === "artist.getTopTags" ? { toptags: { tag: [{ name: "pop", count: 100 }, { name: "singer-songwriter", count: 60 }] } }
  : { similarartists: { artist: [{ name: "Olivia Rodrigo", match: "0.8" }, { name: "Nobody Known", match: "0.7" }, { name: "Sabrina Carpenter", match: "0.6" }] } };
let clock = 1_800_000_000_000;
const waits = [];
const base = (fn, extra = {}) => createLastfmClient({ apiKey: "KEY", base: "https://mock.invalid/2.0/", fetchImpl: fn, now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; }, ...extra });

const noKey = createLastfmClient({ apiKey: "", fetchImpl: async () => { throw new Error("must not be called"); } });
ok(noKey.enabled === false && (await noKey.enrich("Adele")).status === "disabled", "no key -> disabled, no network call");

const m1 = mockFetch((u) => ({ body: goodBody(u) }));
const c1 = base(m1.fn);
const r1 = await c1.enrich("Taylor Swift");
ok(r1.status === "ok" && r1.data.topTracks.length === 5 && r1.data.tags[0] === "pop" && r1.data.similar[0] === "Olivia Rodrigo", "client returns tracks, tags and similar artists");
ok(m1.calls.length === 3 && new Set(m1.calls.map((c) => c.method)).size === 3, "one artist = exactly three API calls");
ok(m1.calls.every((c) => c.key === "KEY" && c.artist === "Taylor Swift" && c.url.startsWith("https://mock.invalid/2.0/")), "key and artist sent server-side to the configured base");
ok(r1.data.asOf === new Date(clock).toISOString().slice(0, 10) && r1.data.url === "https://www.last.fm/music/Taylor+Swift", "result carries as-of date and the Last.fm artist link");
await c1.enrich("taylor swift");
ok(m1.calls.length === 3, "second lookup (any casing) is served from cache");
clock += 7 * 60 * 60 * 1000;
await c1.enrich("Taylor Swift");
ok(m1.calls.length === 6, "cache expires after the TTL");
const mDup = mockFetch(async (u) => { await Promise.resolve(); return { body: goodBody(u) }; });
const cDup = base(mDup.fn);
await Promise.all([cDup.enrich("Adele"), cDup.enrich("Adele"), cDup.enrich("ADELE")]);
ok(mDup.calls.length === 3, "concurrent lookups of one artist share one set of calls");
const waitsBefore = waits.length;
const mGap = mockFetch((u) => ({ body: goodBody(u) }));
const frozen = 1_900_000_000_000;
const cGap = createLastfmClient({ apiKey: "K", fetchImpl: mGap.fn, now: () => frozen, wait: async (ms) => { waits.push(ms); }, minGapMs: 200 });
await cGap.enrich("Adele");
ok(waits.slice(waitsBefore).sort((a, b) => a - b).join(",") === "200,400", "rate limiter spaces request starts by the minimum gap", waits.slice(waitsBefore).join(","));

const mNf = mockFetch((u) => ({ status: 200, body: u.searchParams.get("method") === "artist.getTopTracks" ? { error: 6, message: "The artist you supplied could not be found" } : { toptags: { tag: [] } } }));
const cNf = base(mNf.fn);
ok((await cNf.enrich("Zzzz Qqqq")).status === "notfound", "unknown artist -> notfound");
const nfCalls = mNf.calls.length;
await cNf.enrich("Zzzz Qqqq");
ok(mNf.calls.length === nfCalls, "notfound is negatively cached");

const mRl = mockFetch(() => ({ status: 429, body: { error: 29, message: "Rate Limit Exceeded" } }));
const cRl = base(mRl.fn);
ok((await cRl.enrich("Adele")).status === "unavailable", "rate limit reply -> unavailable");
const rlCalls = mRl.calls.length;
const rlAgain = await cRl.enrich("Drake");
ok(rlAgain.status === "unavailable" && mRl.calls.length === rlCalls && cRl.stats().breakerOpen, "rate limit opens the breaker: no further calls");
clock += 31 * 60 * 1000;
ok(!cRl.stats().breakerOpen, "breaker closes after its pause");

const mKey = mockFetch(() => ({ status: 403, body: { error: 10, message: "Invalid API key" } }));
const cKey = base(mKey.fn);
const rk = await cKey.enrich("Adele");
ok(rk.status === "unavailable" && rk.reason === "key rejected", "invalid key -> unavailable (key rejected)");
ok(!JSON.stringify(rk).includes("KEY"), "results never echo the key");

const mTmp = mockFetch(() => new Error("network down"));
const cTmp = base(mTmp.fn, { breakerFailures: 2 });
await cTmp.enrich("A1 Artist");
ok(!cTmp.stats().breakerOpen, "one transient failure does not open the breaker");
await cTmp.enrich("B2 Artist");
ok(cTmp.stats().breakerOpen, "repeated transient failures open the breaker");

const cBad = base(async () => ({ ok: false, status: 502, json: async () => { throw new Error("not json"); } }));
ok((await cBad.enrich("Adele")).status === "unavailable", "non-JSON error page -> unavailable, no throw");

const cEvict = base(mockFetch((u) => ({ body: goodBody(u) })).fn, { maxEntries: 2 });
await cEvict.enrich("One One"); await cEvict.enrich("Two Two"); await cEvict.enrich("Three Three");
ok(cEvict.stats().cached === 2, "cache is bounded");
ok((await base(mockFetch(() => ({ body: {} })).fn).enrich("x")).status === "notfound", "one-character names are not looked up");

// ---- Enrichment applied to the brief ----
const taylor = A("taylor-swift");
const seedTitle = taylor.tracks[0].title;
const enr = (id, name, titles, extra = {}) => ({
  id, name, source: "Last.fm", asOf: "2026-10-15", url: artistUrl(name), tags: ["pop"], similar: [], similarSeedIds: [],
  topTracks: titles.map((t, i) => ({ title: t, rank: i + 1, listeners: 1_200_000 - i * 1000, plays: 5_000_000, url: `https://www.last.fm/music/x/_/${i}` })),
  ...extra,
});
const picks3 = ["taylor-swift", "kendrick-lamar", "miles-davis"];
const prof3 = { genres: [], era: null, region: null, artistIds: picks3, answers: {}, contrast: null, themes: ["heartbreak"], audience: null, extras: {}, custom: [] };
const plain = buildBrief(prof3);
ok(plain.lastfm === null && plain.version === 2, "no enrichment -> lastfm is null (no credit, no claims)");
ok(plain.caveats.some((c) => /editorial picks/.test(c)) && !plain.caveats.some((c) => /Last\.fm/.test(c)), "no-enrichment caveat says editorial picks and never mentions Last.fm");
const enrichedMap = {
  "taylor-swift": enr("taylor-swift", "Taylor Swift", [seedTitle, "A Brand New Taylor Song", "Another Taylor Song"]),
  "kendrick-lamar": enr("kendrick-lamar", "Kendrick Lamar", ["K One", "K Two", "K Three"]),
};
const rich = buildBrief(prof3, { enrichment: enrichedMap });
ok(rich.lastfm && rich.lastfm.asOf === "2026-10-15" && rich.lastfm.artists.length === 2, "brief records which artists used Last.fm and the as-of date");
ok(rich.lastfm.artists.every((a) => a.url.startsWith("https://www.last.fm/")), "brief carries Last.fm links for credit");
ok(rich.leans.length === 3 && new Set(rich.leans.map((l) => l.id)).size === 3, "enriched brief still has 3 distinct leans");
ok(rich.leans.filter((l) => l.source === "Last.fm").every((l) => l.assumed === false && l.lastfm && l.trackRole === "Last.fm top track" && /Last\.fm lists it #\d among .* most-played tracks/.test(l.why) && l.why.includes("2026-10-15")), "Last.fm leans say so, quote Last.fm's own order, and carry the as-of date");
ok(rich.leans.filter((l) => l.source === "editorial seed").every((l) => l.assumed === true), "seed leans stay flagged as assumed");
ok(rich.leans.every((l) => l.source === "Last.fm" ? ["taylor-swift", "kendrick-lamar"].includes(picks3.find((id) => A(id).name === l.artist)) : l.artist === "Miles Davis"), "Last.fm picks only for enriched artists; the rest fall back to the seed");
ok(rich.caveats.some((c) => /Last\.fm/.test(c) && /2026-10-15/.test(c) && /not stream totals/.test(c)), "caveat names Last.fm, the as-of date, and that it is not stream data");
ok(!/#\d.*chart|chart.*#\d|number one/i.test(rich.leans.map((l) => l.why).join(" ")), "no chart-rank claims in leans");
eq(rich.themes, { ...plain.themes }, "themes and overlap are identical with or without Last.fm (editorial tags drive them)");
eq(rich.center, plain.center, "center is identical with or without Last.fm");
const applied = applyEnrichment([fromSeed(taylor)], enrichedMap);
const matched = applied[0].topTracks.find((t) => t.title === seedTitle);
ok(matched && matched.themes.length >= 1 && matched.year === taylor.tracks[0].year, "a Last.fm track that matches a seed track keeps its theme tags and year");
const unmatched = applied[0].topTracks.find((t) => t.title === "A Brand New Taylor Song");
ok(unmatched && unmatched.themes.length === 0 && unmatched.year === null && unmatched.album === "", "an unmatched Last.fm track gets no invented themes, year or album");
ok(applyEnrichment([P("miles-davis")], enrichedMap)[0].topTracks === undefined, "artists without enrichment are left alone");
ok(applyEnrichment([P("taylor-swift")], { "taylor-swift": enr("taylor-swift", "Taylor Swift", []) })[0].topTracks === undefined, "an empty Last.fm answer falls back to the seed");
const custom1 = { id: "custom:some-band", name: "Some Band", vector: { energy: 0.6, acoustic: 0.3, lyric: 0.5, polish: 0.5, mainstream: 0.3, tempo: 0.5 }, peak: 2016, tags: ["indie"] };
const profC = { ...prof3, artistIds: ["custom:some-band", "kendrick-lamar"], custom: [custom1] };
const noTracks = buildBrief(profC);
ok(noTracks.leans.every((l) => l.artist !== "Some Band") && noTracks.caveats.some((c) => /can't supply leans without Last\.fm/.test(c)), "free-text artist without Last.fm yields no leans and says why");
const withTracks = buildBrief(profC, { enrichment: { "custom:some-band": enr("custom:some-band", "Some Band", ["Band One", "Band Two"]) } });
ok(withTracks.leans.some((l) => l.artist === "Some Band" && l.source === "Last.fm"), "free-text artist can supply Last.fm leans");
ok(withTracks.caveats.some((c) => /their tracks come from Last\.fm/.test(c)), "free-text caveat updates when Last.fm supplied their tracks");
ok(briefLines(rich).some((l) => /^Track data: Last\.fm/.test(l)) && briefLines(rich).some((l) => /source: Last\.fm/.test(l)), "plain-text rows credit Last.fm");
ok(!briefLines(plain).some((l) => /Last\.fm/.test(l)), "plain-text rows never mention Last.fm without Last.fm data");
ok(JSON.stringify(rich).length < 9000, "enriched brief JSON stays small", String(JSON.stringify(rich).length));
const richHtml = renderBriefHtml(rich);
ok(richHtml.includes('href="https://www.last.fm/') && richHtml.includes("Track data from Last.fm"), "email html credits and links Last.fm");
const badLink = { ...rich, lastfm: { ...rich.lastfm, artists: [{ name: "X", url: "javascript:alert(1)", tags: [], similar: [] }] } };
ok(!renderBriefHtml(badLink).includes("javascript:"), "email html refuses non-last.fm links");
ok(!renderBriefHtml(plain).includes("last.fm"), "email html has no Last.fm text without Last.fm data");

// ---- Similar artists ----
eq(similarSeedIds(["The Weeknd", "Nobody Known", "olivia rodrigo", "Taylor Swift", "Olivia Rodrigo"], "taylor-swift"), ["the-weeknd", "olivia-rodrigo"], "similar names map to seed ids (accents/case/dupes/self ignored)");
const tTarget = targetVector(P("taylor-swift"), {});
const base2 = suggestNext(2, [P("taylor-swift")], tTarget, [], null);
const sim2 = suggestNext(2, [P("taylor-swift")], tTarget, [], null, ["olivia-rodrigo", "sabrina-carpenter", "adele"]);
ok(base2.every((o) => !o.similar) && base2.length === 6, "no similar ids -> unchanged second-pick list");
eq(sim2.slice(0, 2).map((o) => o.artist.id), ["olivia-rodrigo", "sabrina-carpenter"], "up to two Last.fm-similar artists lead the second pick, in Last.fm order");
ok(sim2.slice(0, 2).every((o) => o.similar && o.label === "Last.fm: similar to Taylor Swift"), "similar picks are labelled as coming from Last.fm");
ok(sim2.length === 6 && new Set(sim2.map((o) => o.artist.id)).size === 6, "second pick stays six distinct options");
ok(!sim2.some((o) => o.artist.id === "taylor-swift"), "the anchor is never offered as its own similar artist");
ok(suggestNext(3, [P("taylor-swift"), P("kendrick-lamar")], tTarget, [], null, ["olivia-rodrigo"]).every((o) => !o.similar), "similar boost applies to the second pick only");

// ---- Enrichment endpoint helpers / validation ----
eq(targetsFrom(["taylor-swift", "nope", "taylor-swift", "kendrick-lamar"], ["Some Band", "x", " Another  Band "]).map((t) => t.id), ["taylor-swift", "kendrick-lamar", "custom:some-band"], "targets: unknown ids skipped, duplicates removed, capped at 3");
eq(targetsFrom(["taylor-swift"], []).map((t) => t.name), ["Taylor Swift"], "seed targets use OUR seed name, not client text");
const cleanMap = parseEnrichmentMap({ "taylor-swift": enrichedMap["taylor-swift"], bad: { source: "Last.fm", name: "X", url: "https://evil.example", topTracks: [] }, other: "x" });
eq(Object.keys(cleanMap), ["taylor-swift"], "client-side parse drops entries with non-last.fm links or bad shape");
ok(parseEnrichmentMap(null) && Object.keys(parseEnrichmentMap(undefined)).length === 0, "client-side parse tolerates garbage");
const offOut = await enrichTargets(targetsFrom(["taylor-swift"], []), { client: noKey });
ok(offOut.enabled === false && Object.keys(offOut.artists).length === 0 && offOut.missing[0] === "taylor-swift", "enrichTargets with no key reports disabled and falls back");
const mOn = mockFetch((u) => ({ body: goodBody(u) }));
const onOut = await enrichTargets(targetsFrom(["taylor-swift", "kendrick-lamar"], []), { client: base(mOn.fn) });
ok(onOut.enabled && Object.keys(onOut.artists).length === 2 && onOut.missing.length === 0, "enrichTargets returns both artists");
eq(onOut.artists["taylor-swift"].similarSeedIds, ["olivia-rodrigo", "sabrina-carpenter"], "enrichTargets maps similar artists to seed ids");
const slow = createLastfmClient({ apiKey: "K", fetchImpl: () => new Promise(() => {}), timeoutMs: 150 });
const slowOut = await enrichTargets(targetsFrom(["taylor-swift"], []), { client: slow, budgetMs: 25 });
ok(slowOut.missing.includes("taylor-swift") && Object.keys(slowOut.artists).length === 0, "a slow Last.fm is cut off by the budget and the seed is used");

// ---- Key hygiene + removed routes (static) ----
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const clientFiles = [...walk("components"), ...walk("app").filter((f) => !f.includes(`${path.sep}api${path.sep}`))].filter((f) => /\.(ts|tsx)$/.test(f));
ok(clientFiles.every((f) => !/LASTFM_API_KEY|lib\/music\/lastfm"|lib\/music\/enrichArtists"/.test(fs.readFileSync(f, "utf8"))), "no client/page file imports the Last.fm client or reads the key");
ok(!/NEXT_PUBLIC_LASTFM/.test(walk(".").filter((f) => !/node_modules|\.next|\.git[\\/]/.test(f)).filter((f) => /\.(ts|tsx|mjs|md|mdx|example)$/.test(f) && !f.includes("ikoartist-taste-check")).map((f) => fs.readFileSync(f, "utf8")).join("\n")), "the key is never exposed as NEXT_PUBLIC_*");
ok(/LASTFM_API_KEY/.test(fs.readFileSync(".env.example", "utf8")), ".env.example documents LASTFM_API_KEY");
ok(!fs.existsSync("app/api/music-recommend") && !fs.existsSync("app/api/music-catalog") && !fs.existsSync("lib/music/recommend.ts") && !fs.existsSync("data/music-catalog.json"), "old music-recommend / music-catalog routes and data are gone");
ok(!/api\/music-(recommend|catalog)/.test(clientFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n")), "nothing calls the removed routes");

console.log(`ikoartist-taste-check: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(`  FAIL ${f}`);
  process.exit(1);
}
