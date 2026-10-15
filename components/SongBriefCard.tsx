"use client";

import { THEME_LABEL } from "@/lib/music/taste/brief";
import { DIMS, type SongBrief } from "@/lib/music/taste/types";
import { DIM_COPY, pct } from "@/lib/music/taste/vector";

const KIND_LABEL: Record<string, string> = {
  overlap: "Overlap · center of your range",
  "edge-high": "Edge · high end of your range",
  "edge-low": "Edge · low end of your range",
};

/** The finish-screen "your song brief": center, range, themes, audience, three leans with a why each. */
export function SongBriefCard({ brief }: { brief: SongBrief }) {
  const a = brief.audience;
  const t = brief.themes;
  return (
    <div className="space-y-4 rounded-xl border border-accent/30 bg-black/30 p-4" aria-label="Your song brief">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-100">Your song brief</h3>
        <p className="font-mono text-[10px] text-zinc-500">
          Editorial taste map as of {brief.asOf}
          {brief.lastfm ? ` · Last.fm track data as of ${brief.lastfm.asOf}` : ""}
        </p>
      </div>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Sound · your three</p>
        <p className="mt-1 text-sm text-zinc-200">
          {brief.artists.length ? brief.artists.map((x) => x.name).join(" · ") : "No artists picked yet"}
        </p>
        <p className="mt-1 text-xs text-zinc-400">Center: {brief.center.summary}</p>
        {brief.artists.length ? (
          <div className="mt-3 space-y-1.5" role="img" aria-label="Center and range per sound dimension">
            {DIMS.map((d) => {
              const row = brief.range.perDim.find((r) => r.dim === d);
              const c = brief.center.vector[d];
              return (
                <div key={d} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-[11px] text-zinc-400">
                  <span>{DIM_COPY[d].name}</span>
                  <span className="relative block h-2 rounded-full bg-border">
                    {row ? (
                      <span
                        className="absolute top-0 h-2 rounded-full bg-accent/30"
                        style={{ left: `${pct(row.min)}%`, width: `${Math.max(2, pct(row.max) - pct(row.min))}%` }}
                      />
                    ) : null}
                    <span
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent,#2bffe8)]"
                      style={{ left: `${pct(c)}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-zinc-500">{pct(c)}</span>
                </div>
              );
            })}
            <p className="pt-1 font-mono text-[10px] text-zinc-500">Dot = center · band = spread between your picks</p>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-zinc-300">
          <span className="font-mono text-accent">Range: {brief.range.label}</span> — {brief.range.summary}
        </p>
      </section>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Themes</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {t.blend.length ? (
            t.blend.map((x) => (
              <span key={x} className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs text-accent">
                {THEME_LABEL[x]}
              </span>
            ))
          ) : (
            <span className="text-xs text-zinc-500">None picked</span>
          )}
        </div>
        {t.overlap.length ? (
          <p className="mt-1 text-xs text-zinc-400">Shared across your artists: {t.overlap.map((x) => THEME_LABEL[x]).join(", ")}</p>
        ) : null}
        {t.trending ? (
          <p className="mt-1 text-xs text-zinc-400">
            Chart context (as of {t.trending.asOf}):{" "}
            {t.trending.themes.length
              ? `themes among charting artists we could match (${t.trending.matched} of ${t.trending.total} rows): ${t.trending.themes
                  .map((x) => THEME_LABEL[x.theme])
                  .join(", ")}.`
              : `too few rows matched our tag table for a theme read; genre mix: ${t.trending.genreMix.map((g) => `${g.genre} ${g.count}`).join(", ")}.`}{" "}
            <span className="text-zinc-600">Public iTunes chart, our tags, no ranks shown.</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-600">No live chart context available right now.</p>
        )}
      </section>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Audience</p>
        {a ? (
          <p className="mt-1 text-xs text-zinc-300">
            {[a.ageBand && `Age ${a.ageBand}`, a.region, a.languages.join(", "), a.contexts.join(", ")]
              .filter(Boolean)
              .join(" · ")}
            <span className="block text-zinc-600">Bands only, no account, not part of the transcript.</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Skipped — totally fine.</p>
        )}
      </section>

      <section>
        <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Three track leans</p>
        {brief.leans.length ? (
          <ol className="mt-1 space-y-2">
            {brief.leans.map((l, i) => (
              <li key={l.id} className="rounded-xl border border-border/80 bg-black/30 px-3 py-2 text-sm">
                <p className="font-medium text-zinc-100">
                  {i + 1}. {l.title} <span className="text-zinc-400">— {l.artist}</span>
                </p>
                <p className="font-mono text-[10px] text-zinc-500">
                  {KIND_LABEL[l.kind]} · {l.source === "Last.fm" && l.lastfm ? `Last.fm top track #${l.lastfm.rank}` : `${l.trackRole} (our pick)`}
                  {l.album ? ` · ${l.album}` : ""}
                  {l.year ? ` · ${l.year}` : ""}
                  {l.lastfm?.url ? (
                    <>
                      {" · "}
                      <a href={l.lastfm.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
                        Last.fm ↗
                      </a>
                    </>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-accent">Why: {l.why}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Pick at least one artist to get leans.</p>
        )}
      </section>

      {brief.lastfm ? (
        <p className="text-[10px] text-zinc-500">
          Track data from{" "}
          <a href="https://www.last.fm" target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
            Last.fm
          </a>
          , as of {brief.lastfm.asOf}:{" "}
          {brief.lastfm.artists.map((x, i) => (
            <span key={x.url}>
              {i ? ", " : ""}
              <a href={x.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
                {x.name}
              </a>
            </span>
          ))}
        </p>
      ) : null}

      <ul className="space-y-0.5 text-[10px] text-zinc-600">
        {brief.caveats.map((c) => (
          <li key={c}>• {c}</li>
        ))}
      </ul>
    </div>
  );
}
