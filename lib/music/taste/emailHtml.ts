import { THEME_LABEL } from "./brief";
import { DIMS, type SongBrief } from "./types";
import { DIM_COPY, pct } from "./vector";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** HTML block for the Resend summary. Everything interpolated is escaped. Pure, so it is covered by the check script. */
export function renderBriefHtml(b: SongBrief): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:8px 12px;color:#9ca3af;width:140px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px 12px;color:#fafafa;">${v}</td></tr>`;
  const dims = DIMS.map((d) => {
    const r = b.range.perDim.find((x) => x.dim === d);
    return `${escapeHtml(DIM_COPY[d].name)} ${pct(b.center.vector[d])}${r ? ` <span style="color:#9ca3af;">(${pct(r.min)}–${pct(r.max)})</span>` : ""}`;
  }).join(" · ");
  const leans = b.leans.length
    ? b.leans
        .map(
          (l, i) =>
            `${i + 1}. <strong>${escapeHtml(l.title)}</strong> - ${escapeHtml(l.artist)} <span style="color:#9ca3af;">(${escapeHtml(l.kind)}, ${escapeHtml(l.trackRole)})</span><br/><span style="color:#2bffe8;font-size:12px;">Why: ${escapeHtml(l.why)}</span>`,
        )
        .join("<br/><br/>")
    : "No leans (not enough artists picked).";
  const a = b.audience;
  const audience = a
    ? escapeHtml(
        `age ${a.ageBand || "-"}; region ${a.region || "-"}; languages ${a.languages.join(", ") || "-"}; contexts ${a.contexts.join(", ") || "-"} (bands only)`,
      )
    : "Skipped";
  const t = b.themes.trending;
  const notes = Object.entries(b.notes)
    .map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(String(v))}`)
    .join("<br/>");
  return `<h2 style="font-size:16px;margin:24px 0 8px;color:#2bffe8;">Song brief</h2>
    <table style="width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden;">
      ${row("Artists", escapeHtml(b.artists.map((x) => x.name).join(" | ") || "-"))}
      ${row("Center", `${escapeHtml(b.center.summary)}<br/><span style="color:#9ca3af;font-size:12px;">${dims}</span>`)}
      ${row("Range", `${escapeHtml(b.range.label)} (spread ${pct(b.range.spread)}) - ${escapeHtml(b.range.summary)}`)}
      ${row("Themes", escapeHtml(b.themes.blend.map((x) => THEME_LABEL[x]).join(", ") || "-"))}
      ${row("Theme overlap", escapeHtml(b.themes.overlap.map((x) => THEME_LABEL[x]).join(", ") || "none"))}
      ${t ? row("Chart context", escapeHtml(`${t.source}, as of ${t.asOf}: ${t.themes.map((x) => THEME_LABEL[x.theme]).join(", ") || "no theme read"} (${t.matched}/${t.total} rows matched)`)) : ""}
      ${row("Audience", audience)}
      ${row("3 leans", leans)}
      ${notes ? row("Notes", notes) : ""}
      ${row("Caveats", escapeHtml(b.caveats.join(" ")))}
    </table>`;
}
