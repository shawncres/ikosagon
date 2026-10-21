/**
 * IkoLearn server logic: request checks, per-IP rate limits, a daily call budget, and the handlers
 * (streamed chat/notice and lesson, card, adjacent, path, test). Every handler is one model call (provider chosen in llm.ts) and counts against the budget. Nothing about the learner is stored server-side: every request carries
 * the few recent messages and a compact cloud summary from the browser, and the response is not cached.
 */
import { createRateLimiter } from "../ikoreadtube/service";
import { originOk } from "../ikoreadtube/summarize";
import { MODEL_LIMITS, generateJson, llmReady, streamText, type Content, type Env, type FailCode } from "./llm";
import {
  ADJACENT_SCHEMA,
  CARD_SCHEMA,
  LEARN_LIMITS,
  PATH_CLOSE,
  PATH_OPEN,
  PATH_SCHEMA,
  TEST_SCHEMA,
  adjacentSystem,
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
};

export type LearnState = {
  limiter: ReturnType<typeof createRateLimiter>;
  budget: { day: string; calls: number };
  now: () => number;
};

export function createLearnState(now: () => number = () => Date.now()): LearnState {
  return {
    limiter: createRateLimiter({ perIpPerMinute: LEARN_GUARDS.perIpPerMinute, perIpPerHour: LEARN_GUARDS.perIpPerHour, globalPerMinute: LEARN_GUARDS.globalPerMinute }, now),
    budget: { day: "", calls: 0 },
    now,
  };
}

const ptDay = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

function dailyCap(env: Env) {
  const n = Number(env.IKOLEARN_DAILY_CALLS);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000) : LEARN_GUARDS.dailyCalls;
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
  /** Turns the hidden trailing block into the event sent before "done" (or null for none). */
  tail: (block: string, found: boolean) => ChatEvent | null;
};

/** One streamed reply as events. The trailing structured block is held back and never sent as text. */
async function* streamEvents(spec: StreamSpec, env: Env, fetchImpl: typeof fetch): AsyncGenerator<ChatEvent> {
  const started = await streamText(spec.system, spec.contents, env, fetchImpl, { maxTokens: spec.maxTokens });
  if (!started.ok) {
    yield { t: "error", reason: started.code };
    return;
  }
  yield { t: "start", model: started.model };
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
export function chatEvents(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): AsyncGenerator<ChatEvent> {
  return streamEvents(
    {
      system: input.mode === "notice" ? noticeSystem(input) : companionSystem(input),
      contents: buildContents(input),
      maxChars: LEARN_LIMITS.replyChars,
      tail: (block) => {
        const said = input.messages.filter((m) => m.role === "user").slice(-1).map((m) => m.text).join(" ");
        const b = parseCloudBlock(block, input.name, said);
        return { t: "cloud", topics: b.topics, ghosts: b.ghosts };
      },
    },
    env,
    fetchImpl,
  );
}

/** Streams one lesson (tagged lines). The hidden trailing block (path steps when asked, fork choices, 1-2 questions, the card line, branch end) becomes one "path" event. */
export function lessonEvents(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): AsyncGenerator<ChatEvent> {
  return streamEvents(
    {
      system: lessonSystem(input),
      contents: lessonContents(input),
      open: PATH_OPEN,
      close: PATH_CLOSE,
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
  );
}

/** NDJSON stream for the route. */
export function eventStream(events: AsyncGenerator<ChatEvent>): ReadableStream<Uint8Array> {
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
  const r = await generateJson<Card>(cardSystem(input), user, CARD_SCHEMA, parseCard, env, fetchImpl);
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, card: r.value });
}

export async function adjacentFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const user = `Focus topic: ${input.focus}${input.focusParent ? ` (in ${input.focusParent})` : ""}`;
  const r = await generateJson<Ghost[]>(adjacentSystem(input), user, ADJACENT_SCHEMA, (t) => {
    const g = parseAdjacent(t, input.name);
    return g.length ? g : null;
  }, env, fetchImpl);
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, ghosts: r.value });
}

export async function pathFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const user = `Map the learning path for: ${input.focus}${input.trail ? ` (${input.trail})` : ""}`;
  const r = await generateJson<LearnPath>(pathSystem(input), user, PATH_SCHEMA, (t) => parsePath(t, input.name, input.focus), env, fetchImpl);
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, path: r.value });
}

/** A test for one parent: 3-5 questions from the completed material only (each names the topic it checks). One call. */
export async function testFor(input: LearnInput, env: Env, fetchImpl: typeof fetch = fetch): Promise<Out> {
  const allowed = input.material.map((m) => m.label);
  if (allowed.length < 2) return json(422, { ok: false, reason: "material" });
  const user = `Make my test on ${input.focus}. Topics I have finished: ${allowed.join(", ")}.`;
  const r = await generateJson<TestQuestion[]>(testSystem(input), user, TEST_SCHEMA, (t) => parseTest(t, allowed), env, fetchImpl);
  if (!r.ok) return json(reasonStatus(r.code), { ok: false, reason: r.code });
  return json(200, { ok: true, questions: r.value });
}
