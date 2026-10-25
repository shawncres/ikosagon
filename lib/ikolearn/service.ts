/**
 * IkoLearn server logic: request checks, per-IP rate limits, a daily call budget, and the handlers
 * (streamed chat/notice and lesson, card, adjacent, path, test). Every handler is one model call (provider chosen in llm.ts) and counts against the budget. Nothing about the learner is stored server-side: every request carries
 * the few recent messages and a compact cloud summary from the browser, and the response is not cached.
 * The one exception is the examples set (examplesFor): generic, the same for everyone, cached for the day.
 */
import { createRateLimiter } from "../ikoreadtube/service";
import { originOk } from "../ikoreadtube/summarize";
import { MODEL_LIMITS, generateJson, llmReady, streamJson, streamText, type Content, type Env, type FailCode } from "./llm";
import {
  ADJACENT_SCHEMA,
  CARD_SCHEMA,
  LEARN_LIMITS,
  PATH_CLOSE,
  PATH_OPEN,
  PATH_SCHEMA,
  TEST_SCHEMA,
  CREATE_SCHEMA,
  EXAMPLES_SCHEMA,
  examplesSystem,
  parseExampleSet,
  type ExampleSet,
  createSystem,
  parseCreate,
  createItems,
  completeItems,
  type CreateItem,
  type CreateResult,
  adjacentSystem,
  describeSystem,
  DESCRIBE_SCHEMA,
  parseDescribe,
  parseTest,
  testSystem,
  type TestQuestion,
  lessonContents,
  lessonSystem,
  parsePath,
  parseLessonBlock,
  pathSystem,
  type LearnPath,
  type LessonBlock,
  buildContents,
  cardSystem,
  companionSystem,
  createBlockSplitter,
  noticeSystem,
  clarifySystem,
  parseAdjacent,
  parseCard,
  parseCloudBlock,
  parseLearnInput,
  type Card,
  type CloudBlock,
  type Ghost,
  type LearnInput,
} from "./prompts";

export type Out = { status: number; body: unknown; headers: Record<string, string> };
export const NO_STORE = { "Cache-Control": "no-store" };
const json = (status: number, body: unknown, extra: Record<string, string> = {}): Out => ({ status, body, headers: { ...NO_STORE, ...extra } });

export const LEARN_GUARDS = {
  perIpPerMinute: 8,
  perIpPerHour: 90,
  globalPerMinute: 30,
  dailyCalls: 400, // our own cap (all IkoLearn calls, per server instance), well under the free-tier daily request limit
  examplesPerDay: 3, // model calls for the examples set, per server instance per day (normally 1; retries after a failure)
};

/**
 * Examples: browsers keep them an hour; Vercel's CDN shares one successful list for a day across every instance and
 * region, and serves it stale while it refreshes, so new instances rarely call the model. Vercel-CDN-Cache-Control has
 * top priority on Vercel's CDN (and isn't passed on); Cache-Control keeps s-maxage for any other cache in between.
 * Failures are never cached (EXAMPLES_NO_STORE).
 */
export const EXAMPLES_CACHE = {
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
  "Vercel-CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400",
};
/** An older list served after a failed refresh: a short cache, so the next good list replaces it soon. */
export const EXAMPLES_STALE = { "Cache-Control": "public, max-age=600, s-maxage=600", "Vercel-CDN-Cache-Control": "max-age=600" };
/** A failure: never kept by the browser or any CDN. */
export const EXAMPLES_NO_STORE = { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", "CDN-Cache-Control": "no-store" };
/**
 * One retry for the examples call, on a 5xx or a network error only (never a 4xx, a 429, a timeout or an unusable
 * reply), after a jittered 400-800 ms, and only while the instance's daily attempt cap allows and enough of the
 * route's 30 s limit is left (budgetMs from the first request, minCallMs for the retry itself).
 */
export const EXAMPLES_RETRY = { backoffMinMs: 400, backoffMaxMs: 800, budgetMs: 26_000, minCallMs: 6_000 };

export type ExamplesState = { day: string; list: string[]; growth: string[]; tries: { day: string; n: number }; pending: Promise<Out> | null };

export type LearnState = {
  limiter: ReturnType<typeof createRateLimiter>;
  budget: { day: string; calls: number };
  examples: ExamplesState;
  now: () => number;
  /** waits ms (the examples retry backoff); injectable so the checks don't sleep */
  sleep: (ms: number) => Promise<void>;
  /** 0..1, for the backoff jitter */
  random: () => number;
};

export function createLearnState(now: () => number = () => Date.now(), sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), random: () => number = Math.random): LearnState {
  return {
    limiter: createRateLimiter({ perIpPerMinute: LEARN_GUARDS.perIpPerMinute, perIpPerHour: LEARN_GUARDS.perIpPerHour, globalPerMinute: LEARN_GUARDS.globalPerMinute }, now),
    budget: { day: "", calls: 0 },
    examples: { day: "", list: [], growth: [], tries: { day: "", n: 0 }, pending: null },
    now,
    sleep,
    random,
  };
}

const ptDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

function dailyCap(env: Env) {
  const n = Number(env.IKOLEARN_DAILY_CALLS);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000) : LEARN_GUARDS.dailyCalls;
}

/** Streams' options from the route: spend reserves one extra call (a hedged fallback) from the day's budget. */
export type StreamRun = { spend?: () => boolean };

/** One call from the instance's daily budget, for a hedged fallback; false when the day's budget is spent. */
export function budgetSpend(state: LearnState, env: Env): () => boolean {
  return () => {
    const day = ptDay(state.now());
    if (state.budget.day !== day) state.budget = { day, calls: 0 };
    if (state.budget.calls >= dailyCap(env)) return false;
    state.budget.calls += 1;
    return true;
  };
}

export type Prepared = { ok: true; input: LearnInput } | { ok: false; out: Out };

/** Shared checks for every route: origin, size, JSON, input, key, rate limit, daily budget (reserves one call). */
export function prepare(opts: { rawBody: string; origin: string | null; host: string | null; ip: string; env: Env; state: LearnState; requireFocus?: boolean }): Prepared {
  const { env, state } = opts;
  if (!originOk(opts.origin, opts.host, env)) return { ok: false, out: json(403, { error: "origin" }) };
  if (Buffer.byteLength(opts.rawBody || "", "utf8") > LEARN_LIMITS.bodyBytes) return { ok: false, out: json(413, { error: "too_large" }) };
  let raw: unknown;
  try {
    raw = JSON.parse(opts.rawBody || "");
  } catch {
    return { ok: false, out: json(400, { error: "bad_json" }) };
  }
  // card / adjacent requests may end on a model turn; validate them like a notice
  const input = parseLearnInput(opts.requireFocus && raw && typeof raw === "object" ? { ...(raw as object), mode: "notice" } : raw);
  if ("error" in input) return { ok: false, out: json(422, { error: input.error }) };
  if (opts.requireFocus && !input.focus) return { ok: false, out: json(422, { error: "focus" }) };
  if (!llmReady(env)) return { ok: false, out: json(503, { error: "off" }) };
  const rl = state.limiter.check(opts.ip);
  if (!rl.ok) return { ok: false, out: json(429, { error: rl.code, retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) }) };
  const day = ptDay(state.now());
  if (state.budget.day !== day) state.budget = { day, calls: 0 };
  if (state.budget.calls >= dailyCap(env)) return { ok: false, out: json(429, { error: "budget" }) };
  state.budget.calls += 1;
  return { ok: true, input };
}

export type ChatEvent =
  | { t: "start"; model: string }
  | { t: "delta"; text: string }
  | { t: "cloud"; topics: CloudBlock["topics"]; ghosts: CloudBlock["ghosts"] }
  | ({ t: "path" } & LessonBlock)
  | { t: "done" }
  | { t: "error"; reason: FailCode | "cut" };

type StreamSpec = {
  system: string;
  contents: Content[];
  open?: string;
  close?: string;
  maxChars: number;
  maxTokens?: number;
  /** the route name in failure log lines */
  route: string;
  /** Turns the hidden trailing block into the event sent before "done" (or null for none). */
  tail: (block: string, found: boolean) => ChatEvent | null;
};

/** One streamed reply as events. The trailing structured block is held back and never sent as text. */
async function* streamEvents(spec: StreamSpec, env: Env, fetchImpl: typeof fetch, run: StreamRun = {}): AsyncGenerator<ChatEvent> {
  const started = await streamText(spec.system, spec.contents, env, fetchImpl, { maxTokens: spec.maxTokens, route: spec.route, spend: run.spend });
  if (!started.ok) {
    yield { t: "error", reason: started.code };
    return;
  }
  /* the learner left (the device aborted, so the stream was cancelled): stop the model's reply too */
  try {
    yield { t: "start", model: started.model };
    yield* replyEvents(spec, started.pieces);
  } finally {
    started.abort();
  }
}

async function* replyEvents(spec: StreamSpec, pieces: AsyncGenerator<string>): AsyncGenerator<ChatEvent> {
  const started = { pieces };
  const split = createBlockSplitter(spec.open, spec.close);
  let shown = 0;
  try {
    for await (const piece of started.pieces) {
      const visible = split.push(piece);
      if (visible) {
        const text = visible.replace(/\*\*|__|`+/g, "");
        shown += text.length;
        if (shown > spec.maxChars) break;
        yield { t: "delta", text };
      }
    }
  } catch {
    const end = split.finish();
    if (end.tail) yield { t: "delta", text: end.tail };
    yield { t: shown ? "done" : "error", ...(shown ? {} : { reason: "cut" as const }) } as ChatEvent;
    return;
  }
  const end = split.finish();
  if (end.tail.trim()) yield { t: "delta", text: end.tail.replace(/\s+$/, "") };
  if (!shown && !end.tail.trim()) {
    yield { t: "error", reason: "empty" };
    return;
  }
  const last = spec.tail(end.block, end.found);
  if (last) yield last;
  yield { t: "done" };
}

/** Streams one companion or notice reply. Ends with a "cloud" event (empty arrays when the block was missing or bad). */
export function chatEvents(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch, run: StreamRun = {}): AsyncGenerator<ChatEvent> {
  return streamEvents(
    {
      system: input.mode === "notice" ? noticeSystem(input) : input.mode === "clarify" ? clarifySystem(input) : companionSystem(input),
      contents: buildContents(input),
      route: input.mode,
      maxChars: LEARN_LIMITS.replyChars,
      tail: (block) => {
        if (input.mode === "clarify") return null; /* inline help only: nothing lands on the cloud */
        const b = parseCloudBlock(block, input.name, input.mode === "chat" ? { focusId: input.focusId, cloud: input.cloud, parents: input.parents } : undefined);
        return { t: "cloud", topics: b.topics, ghosts: b.ghosts };
      },
    },
    env,
    fetchImpl,
    run,
  );
}

/** Streams one lesson (tagged lines). The hidden trailing block (path steps when asked, fork choices, 1-2 questions, the card line, branch end) becomes one "path" event. */
export function lessonEvents(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch, run: StreamRun = {}): AsyncGenerator<ChatEvent> {
  return streamEvents(
    {
      system: lessonSystem(input),
      contents: lessonContents(input),
      open: PATH_OPEN,
      close: PATH_CLOSE,
      route: "lesson",
      maxChars: LEARN_LIMITS.lessonChars,
      maxTokens: MODEL_LIMITS.lessonMaxTokens,
      tail: (block, found) => {
        if (!found) return null;
        const b = parseLessonBlock(block, input.name, input.focus, input.wantPath);
        return b ? { t: "path", ...b } : null;
      },
    },
    env,
    fetchImpl,
    run,
  );
}

/** NDJSON stream for the route. */
export function eventStream<E = ChatEvent>(events: AsyncGenerator<E>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(enc.encode(JSON.stringify(value) + "\n"));
      } catch {
        controller.enqueue(enc.encode(JSON.stringify({ t: "error", reason: "upstream" }) + "\n"));
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });
}

const reasonStatus = (code: FailCode) => (code === "busy" ? 429 : code === "no_key" ? 503 : 502);

export async function cardFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const recent = input.messages.map((m) => `${m.role === "user" ? input.name : "IkoLearn"}: ${m.text}`).join("\n");
  const user = `Focus topic: ${input.focus}${input.focusParent ? ` (in ${input.focusParent})` : ""}\nRecent conversation:\n${recent || "(none)"}`;
  const r = await generateJson<Card>(cardSystem(input), user, CARD_SCHEMA, parseCard, env, fetchImpl, { route: "card" });
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, card: r.value });
}

export async function adjacentFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const user = `Focus topic: ${input.focus}${input.focusParent ? ` (in ${input.focusParent})` : ""}`;
  const r = await generateJson<Ghost[]>(adjacentSystem(input), user, ADJACENT_SCHEMA, (t) => {
    const g = parseAdjacent(t, input.name);
    return g.length ? g : null;
  }, env, fetchImpl, { route: "adjacent" });
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, ghosts: r.value });
}

/**
 * Describe (the backfill): one call for up to 8 topics that have no description yet (input.material: label + trail).
 * Nothing to describe is 422 with no call. -> { ok, items: [{ name, blurb }] } (only the asked names).
 */
export async function describeFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const asked = input.material.map((m) => m.label);
  if (!asked.length) return json(422, { ok: false, reason: "nothing_to_describe" });
  const user = `Describe these ${asked.length} topics: ${asked.join("; ")}`;
  const r = await generateJson<{ name: string; blurb: string }[]>(describeSystem(input), user, DESCRIBE_SCHEMA, (t) => {
    const d = parseDescribe(t, asked, input.name);
    return d.length ? d : null;
  }, env, fetchImpl, { route: "describe" });
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, items: r.value });
}

export async function pathFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const user = `Map the learning path for: ${input.focus}${input.trail ? ` (${input.trail})` : ""}`;
  const r = await generateJson<LearnPath>(pathSystem(input), user, PATH_SCHEMA, (t) => parsePath(t, input.name, input.focus), env, fetchImpl, { route: "path" });
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, path: r.value });
}

/** A test for one parent: 3-5 questions from the completed material only (each names the topic it checks). One call. */
/**
 * The creation call (one structured call): new parents for a new learner (start), a new interest (more), or what comes
 * next inside one parent (next). Strictly validated (parseCreate); an unusable answer is 502 "bad_output" and the app
 * falls back locally.
 */
/** The learner's question that brought the topic up, so the bridge follows it ("sets in Python" sits under Python). Content, not instructions. */
function bridgeAsk(input: LearnInput): string {
  const q = [...input.messages].reverse().find((m) => m.role === "user");
  return q ? ` The learner asked: "${q.text.slice(0, 300)}"` : "";
}

/** A creation request that can't be made (422), or null when it can. */
export function createCheck(input: LearnInput): Out | null {
  if ((input.kind === "next" || input.kind === "bridge") && !input.focus) return json(422, { ok: false, reason: "focus" });
  /* the learner's path starts only from what they offer: a start or more with nothing in their own words makes no call */
  if ((input.kind === "start" || input.kind === "more") && !input.about && !input.interests.length && !(input.kind === "start" && input.grow)) return json(422, { ok: false, reason: "about" });
  return null;
}

function createUser(input: LearnInput): string {
  return (
    input.kind === "bridge"
      ? input.repair
        ? `Check the chain for ${input.focus}: ${input.trail || input.focusParent}. Was a level skipped? Give the corrected chain.${bridgeAsk(input)}`
        : `Where does ${input.focus} fit under ${input.focusParent || "its subject"}? Give the steps in between.${bridgeAsk(input)}`
      : input.kind === "next"
      ? `What should come next in ${input.focus}?`
      : `Build my ${input.kind === "start" ? "first" : "new"} learning topics.` +
        (input.about ? ` In my own words: "${input.about}"` : input.interests.length ? ` I enjoy: ${input.interests.join(", ")}.` : "") +
        (input.kind === "start" && input.grow ? ` Something I'd like to grow in myself: "${input.grow}"` : "")
  );
}

export async function createFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const bad = createCheck(input);
  if (bad) return bad;
  const user = createUser(input);
  const r = await generateJson<CreateResult>(createSystem(input), user, CREATE_SCHEMA, (t) => parseCreate(t, input.kind, input.name, input.focus, input.known), env, fetchImpl, { maxTokens: MODEL_LIMITS.createMaxTokens, route: "create" });
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, kind: input.kind, items: r.value.items });
}

export type CreateEvent = { t: "item"; item: CreateItem } | { t: "done"; kind: LearnInput["kind"]; items: CreateItem[] } | { t: "error"; reason: FailCode | "cut" | "bad_output" };

/**
 * The creation call, streamed (start and more): the model's JSON arrives in pieces and each item is sent ("item") as
 * soon as it is complete and valid, so the learner sees the first parent while the rest is still being written. The
 * same validation as createFor (createItems on the items so far: a prefix of the items gives a prefix of the result).
 * Ends with "done" and the full list, or "error" when nothing usable came (the app shows Try again, as before).
 * A provider that answers in one piece just sends every item at the end. Call createCheck first.
 */
export async function* createEvents(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch, run: StreamRun = {}): AsyncGenerator<CreateEvent> {
  const started = await streamJson(createSystem(input), createUser(input), CREATE_SCHEMA, env, fetchImpl, { maxTokens: MODEL_LIMITS.createMaxTokens, route: "create", spend: run.spend });
  if (!started.ok) {
    yield { t: "error", reason: started.code };
    return;
  }
  try {
    yield* createItemEvents(input, started.pieces);
  } finally {
    started.abort(); /* the learner left: stop the model too */
  }
}

async function* createItemEvents(input: LearnInput, pieces: AsyncGenerator<string>): AsyncGenerator<CreateEvent> {
  const started = { pieces };
  let text = "", sent: CreateItem[] = [], cut = false;
  const fresh = (): CreateItem[] => createItems(completeItems(text), input.kind, input.name, input.focus, input.known);
  try {
    for await (const piece of started.pieces) {
      text += piece;
      if (text.length > 40_000) break;
      const now = fresh();
      for (let i = sent.length; i < now.length; i++) yield { t: "item", item: now[i] };
      if (now.length > sent.length) sent = now;
    }
  } catch {
    cut = true;
  }
  /* the whole answer, parsed the usual way; when it ends cut short, the items already sent are what was made */
  const full = cut ? null : parseCreate(text, input.kind, input.name, input.focus, input.known);
  const items = full ? full.items : sent;
  for (let i = sent.length; i < items.length; i++) yield { t: "item", item: items[i] };
  if (items.length && (full || sent.length)) yield { t: "done", kind: input.kind, items };
  else yield { t: "error", reason: cut ? "cut" : "bad_output" };
}

export async function testFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const allowed = input.material.map((m) => m.label);
  if (allowed.length < 2) return json(422, { ok: false, reason: "material" });
  const user = `Make my test on ${input.focus}. Topics I have finished: ${allowed.join(", ")}.`;
  const r = await generateJson<TestQuestion[]>(testSystem(input), user, TEST_SCHEMA, (t) => parseTest(t, allowed), env, fetchImpl, { route: "test" });
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, questions: r.value });
}

/*
 * The easy-click examples for the first question: one generic set (nothing about any learner goes in or comes back),
 * so it is made once and shared. Per server instance it is kept for the Pacific day; the CDN keeps the answer a day
 * (EXAMPLES_CACHE), so a normal day costs about one model call. Concurrent misses share one call; at most
 * LEARN_GUARDS.examplesPerDay calls per instance per day, each one counted in the daily budget. When a new set can't be
 * made, yesterday's set is served (briefly cached); with none, the error is not cached and the app shows Try again.
 */
export async function examplesFor(env: Env, state: LearnState, fetchImpl: typeof fetch = fetch): Promise<Out> {
  if (!llmReady(env)) return json(503, { ok: false, reason: "off" }, EXAMPLES_NO_STORE);
  const ex = state.examples, day = ptDay(state.now());
  /* the first question's list and the second question's (growth), from the same call */
  const serve = (list: string[], fresh: boolean): Out => ({ status: 200, body: { ok: true, examples: list, growth: ex.growth || [] }, headers: fresh ? EXAMPLES_CACHE : EXAMPLES_STALE });
  const fail = (code: FailCode): Out => (ex.list.length ? serve(ex.list, false) : json(reasonStatus(code), { ok: false, reason: code }, EXAMPLES_NO_STORE));
  if (ex.day === day && ex.list.length) return serve(ex.list, true);
  if (ex.pending) return ex.pending;
  if (ex.tries.day !== day) ex.tries = { day, n: 0 };
  if (state.budget.day !== day) state.budget = { day, calls: 0 };
  const canTry = () => ex.tries.n < LEARN_GUARDS.examplesPerDay && state.budget.calls < dailyCap(env);
  if (!canTry()) return ex.list.length ? serve(ex.list, false) : json(429, { ok: false, reason: "busy" }, EXAMPLES_NO_STORE);
  const t0 = state.now();
  const attempt = async (n: number, timeoutMs?: number) => {
    ex.tries.n += 1;
    state.budget.calls += 1;
    return generateJson<ExampleSet>(examplesSystem(), "Today's examples, please.", EXAMPLES_SCHEMA, parseExampleSet, env, fetchImpl, { maxTokens: 900, route: "examples", attempt: n, timeoutMs });
  };
  ex.pending = (async () => {
    try {
      let r = await attempt(1, EXAMPLES_RETRY.budgetMs);
      if (!r.ok && retryable(r) && canTry()) {
        const wait = EXAMPLES_RETRY.backoffMinMs + Math.round(state.random() * (EXAMPLES_RETRY.backoffMaxMs - EXAMPLES_RETRY.backoffMinMs));
        const left = EXAMPLES_RETRY.budgetMs - (state.now() - t0) - wait;
        if (left >= EXAMPLES_RETRY.minCallMs) {
          await state.sleep(wait);
          r = await attempt(2, left);
        }
      }
      if (r.ok) {
        ex.day = day;
        ex.list = r.value.examples;
        ex.growth = r.value.growth;
        return serve(ex.list, true);
      }
      return fail(r.code);
    } finally {
      ex.pending = null;
    }
  })();
  return ex.pending;
}

/** Worth one more try: a provider 5xx or a network error. Never a 4xx (refused), a 429 (busy), a timeout or an unusable reply. */
export function retryable(f: { code: FailCode; status?: number }): boolean {
  return f.code === "upstream" && (f.status === undefined || f.status >= 500);
}
