import type { Page, Route } from "@playwright/test";

export type ApiCall = { path: string; method: string };

export type ApiLog = {
  /** Learner calls. GET /examples is omitted: the app fetches it on open, and offline it stays off. */
  calls: ApiCall[];
  paths: () => string[];
  /** Requests that tried to reach a live model host. Must stay empty. */
  blocked: string[];
};

const nd = (rows: unknown[]) =>
  rows.map((row) => JSON.stringify(row)).join("\n") + "\n";

const LESSON = nd([
  { t: "start", model: "m" },
  {
    t: "delta",
    text: "INTRO: Magma is hot melted rock deep underground.\nEXPLAIN: When it comes out of a volcano, we call it lava.\nSTEP: It gathers in chambers under the volcano.\nEXAMPLE: Like thick soup bubbling in a pot.",
  },
  { t: "path", steps: [], next: "", choices: [], questions: [] },
  { t: "done" },
]);

function kids(names: string[]) {
  return names.map((name, i) => ({
    name,
    order: i + 1,
    score: 0.9 - i * 0.1,
    why: "A good first step",
    role: "core",
    blurb: `${name} in plain words, one step at a time, for anyone.`,
  }));
}

const START_ITEMS = [
  {
    node: { name: "Ocean Life", chain: ["Nature"] },
    card: {
      title: "Ocean Life",
      blurb: "Living things of the sea.",
      goal: "Name five sea creatures.",
    },
    children: kids(["Coral Reefs", "Whales", "Tides"]),
  },
  {
    node: { name: "Drawing", chain: ["Art"] },
    card: {
      title: "Drawing",
      blurb: "Making pictures with lines.",
      goal: "Draw a simple scene.",
    },
    children: kids(["Shapes", "Shading", "Perspective"]),
  },
];

const CREATE = nd([
  { t: "item", item: START_ITEMS[0] },
  { t: "item", item: START_ITEMS[1] },
  { t: "done", items: START_ITEMS },
]);

const OFF = JSON.stringify({ ok: false, reason: "off" });

function relPath(url: string) {
  const pathname = new URL(url).pathname.replace(/\/$/, "");
  return pathname.replace(/^.*\/api\/ikolearn/, "") || "/";
}

/**
 * Offline stand-in for every `/api/ikolearn/**` call.
 * Lesson and the first-cloud create return the same NDJSON the legacy home script used.
 * Anything else, including chat and examples, answers 503 `{ ok: false, reason: "off" }`,
 * which the app already treats as "the model is not available".
 * Create is held briefly so "Growing your cloud" is visible before the stream arrives.
 */
export async function installApiMocks(page: Page): Promise<ApiLog> {
  const calls: ApiCall[] = [];
  const blocked: string[] = [];

  await page.route("**/api/ikolearn/**", async (route: Route) => {
    const request = route.request();
    const rel = relPath(request.url());
    if (!rel.endsWith("/examples"))
      calls.push({ path: rel, method: request.method() });
    if (rel.endsWith("/lesson")) {
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: LESSON,
      });
      return;
    }
    if (rel.endsWith("/create")) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: CREATE,
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: OFF,
    });
  });

  await page.route(/generativelanguage\.googleapis\.com/, async (route) => {
    blocked.push(route.request().url());
    await route.abort();
  });

  return { calls, paths: () => calls.map((call) => call.path), blocked };
}
