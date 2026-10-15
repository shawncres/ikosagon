import { NextResponse } from "next/server";
import { CHART_URL, parseChart, trendingFromChart } from "@/lib/music/taste/trending";

export const runtime = "nodejs";
export const maxDuration = 8;

const FETCH_MS = 4000;
const CACHE_MS = 60 * 60 * 1000;
const g = globalThis as typeof globalThis & { __ikoTrending?: { at: number; value: ReturnType<typeof trendingFromChart> } };

/** Free, keyless public chart (iTunes RSS). Cached for an hour per instance; falls back to null honestly. */
export async function GET() {
  const cached = g.__ikoTrending;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ ok: true, trending: cached.value, cached: true });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(CHART_URL, { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: true, trending: null, note: "Chart feed unavailable right now." });
    const { rows, asOf } = parseChart(await res.json());
    if (!rows.length || !asOf) return NextResponse.json({ ok: true, trending: null, note: "Chart feed returned no usable rows." });
    const value = trendingFromChart(rows, asOf);
    g.__ikoTrending = { at: Date.now(), value };
    return NextResponse.json({ ok: true, trending: value });
  } catch {
    return NextResponse.json({ ok: true, trending: null, note: "Chart feed unavailable right now." });
  } finally {
    clearTimeout(timer);
  }
}
