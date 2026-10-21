import { createLearnState, type LearnState, type Out } from "@/lib/ikolearn/service";

type G = typeof globalThis & { __ikoLearn?: LearnState };
const g = globalThis as G;
export const state = (g.__ikoLearn ??= createLearnState());

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

export const reqMeta = (request: Request) => ({
  origin: request.headers.get("origin"),
  host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
  ip: clientIp(request),
});

export function reply(out: Out): Response {
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { "Content-Type": "application/json; charset=utf-8", ...out.headers } });
}
