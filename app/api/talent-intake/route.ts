import { NextResponse } from "next/server";
import { Resend } from "resend";
import { briefLines, buildBrief } from "@/lib/music/taste/brief";
import { renderBriefHtml } from "@/lib/music/taste/emailHtml";
import { sanitizeProfile, sanitizeTrending } from "@/lib/music/taste/sanitize";
import { enrichTargets, targetsFrom } from "@/lib/music/enrichArtists";
import type { SongBrief } from "@/lib/music/taste/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const contactToEmail = process.env.CONTACT_TO_EMAIL || "shawn@ikosagon.com";

/** Vercel Hobby request body ~4.5MB; keep attachments comfortably under that. */
const MAX_VOICE_BYTES = 1_800_000;
const MAX_PHOTO_BYTES = 1_200_000;
const MAX_FIELD = 2_000;
const MAX_TRANSCRIPT_ITEMS = 40;

type AttachmentInput = {
  filename?: string;
  mimeType?: string;
  base64?: string;
  sizeBytes?: number;
  durationSeconds?: number;
};

type IntakePayload = {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  answers?: Array<{ question: string; answer: string }>;
  /** Raw visitor choices. The brief is rebuilt here with the same pure functions; client text is never trusted. */
  profile?: unknown;
  trending?: unknown;
  voice?: AttachmentInput | null;
  photo?: AttachmentInput | null;
};

function clip(value: unknown, max = MAX_FIELD): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function decodeBase64(raw: string): Buffer | null {
  try {
    const cleaned = raw.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    if (!cleaned) return null;
    const buf = Buffer.from(cleaned, "base64");
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(request: Request) {
  let body: IntakePayload;
  try {
    body = (await request.json()) as IntakePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const name = clip(body.contact?.name, 200);
  const email = clip(body.contact?.email, 320);
  const phone = clip(body.contact?.phone, 80);
  const answers = Array.isArray(body.answers)
    ? body.answers.slice(0, MAX_TRANSCRIPT_ITEMS).map((item) => ({
        question: clip(item?.question, 300),
        answer: clip(item?.answer, MAX_FIELD),
      }))
    : [];

  let brief: SongBrief | null = null;
  const profile = body.profile ? sanitizeProfile(body.profile) : null;
  if (profile && (profile.artistIds.length || profile.themes.length || profile.audience)) {
    // Track data is fetched here on the server (free Last.fm key, cached, rate-limited) and never taken from the client.
    // If Last.fm is off, slow or down, the brief falls back to our editorial seed picks.
    const targets = targetsFrom(
      profile.artistIds,
      profile.custom.filter((c) => profile.artistIds.includes(c.id)).map((c) => c.name),
    );
    const enrichment = await enrichTargets(targets, { budgetMs: 3500 });
    brief = buildBrief(profile, { trending: sanitizeTrending(body.trending), enrichment: enrichment.artists });
  }

  if (!email && !name && !phone && answers.length === 0 && !brief) {
    return NextResponse.json(
      { ok: false, error: "Share at least contact info or a few answers before submitting." },
      { status: 400 },
    );
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "That email does not look valid." }, { status: 400 });
  }

  if (!resend || !process.env.CONTACT_FROM_EMAIL) {
    return NextResponse.json(
      {
        ok: false,
        error: "Intake route not configured yet. Add RESEND_API_KEY and CONTACT_FROM_EMAIL.",
      },
      { status: 500 },
    );
  }

  const attachments: Array<{ filename: string; content: Buffer }> = [];
  const mediaNotes: string[] = [];

  const voice = body.voice;
  if (voice?.base64) {
    const buf = decodeBase64(voice.base64);
    const size = buf?.length ?? Number(voice.sizeBytes) ?? 0;
    const duration = Number(voice.durationSeconds);
    const durationLabel = Number.isFinite(duration) && duration > 0 ? ` (~${Math.round(duration)}s)` : "";

    if (buf && buf.length <= MAX_VOICE_BYTES) {
      const ext = (voice.mimeType || "").includes("mp4")
        ? "mp4"
        : (voice.mimeType || "").includes("ogg")
          ? "ogg"
          : "webm";
      attachments.push({
        filename: clip(voice.filename || `voice-sample.${ext}`, 120),
        content: buf,
      });
      mediaNotes.push(`Voice sample attached${durationLabel} (${Math.round(buf.length / 1024)} KB).`);
    } else {
      mediaNotes.push(
        `Voice captured${durationLabel}${size ? ` - ${Math.round(size / 1024)} KB` : ""} - download not included (over ~${Math.round(MAX_VOICE_BYTES / 1_000_000)} MB Hobby email limit). Contact the user for the file.`,
      );
    }
  } else if (voice?.durationSeconds) {
    mediaNotes.push(
      `Voice captured length ~${Math.round(Number(voice.durationSeconds))}s - download not included.`,
    );
  }

  const photo = body.photo;
  if (photo?.base64) {
    const buf = decodeBase64(photo.base64);
    const size = buf?.length ?? Number(photo.sizeBytes) ?? 0;
    if (buf && buf.length <= MAX_PHOTO_BYTES) {
      const mime = photo.mimeType || "image/jpeg";
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      attachments.push({
        filename: clip(photo.filename || `artist-photo.${ext}`, 120),
        content: buf,
      });
      mediaNotes.push(`Photo attached (${Math.round(buf.length / 1024)} KB).`);
    } else {
      mediaNotes.push(
        `Photo captured${size ? ` - ${Math.round(size / 1024)} KB` : ""} - not attached (over size cap). Contact the user for the file.`,
      );
    }
  }

  if (brief) {
    attachments.push({ filename: "song-brief.json", content: Buffer.from(JSON.stringify(brief, null, 2), "utf8") });
    mediaNotes.push("Structured song brief attached as song-brief.json.");
  }

  const displayName = name || (email ? email : "Anonymous participant");
  const subject = `IkoArtist song path - ${displayName}`;

  const transcriptHtml = answers.length
    ? answers
        .map(
          (item, index) =>
            `<tr><td style="padding:8px 12px;border-bottom:1px solid #222;color:#9ca3af;vertical-align:top;">${index + 1}. ${escapeHtml(item.question)}</td><td style="padding:8px 12px;border-bottom:1px solid #222;color:#fafafa;">${escapeHtml(item.answer).replaceAll("\n", "<br/>")}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" style="padding:12px;color:#9ca3af;">No answers recorded (user skipped most steps).</td></tr>`;

  const mediaHtml = mediaNotes.length
    ? `<ul>${mediaNotes.map((note) => `<li style="margin-bottom:6px;">${escapeHtml(note)}</li>`).join("")}</ul>`
    : `<p style="color:#9ca3af;">No voice or photo submitted.</p>`;

  const briefHtml = brief ? renderBriefHtml(brief) : "";

  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#0a0a0a;color:#fafafa;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <p style="font-family:ui-monospace,monospace;font-size:12px;color:#2bffe8;margin:0 0 8px;">Ikosagon | IkoArtist</p>
    <h1 style="font-size:22px;margin:0 0 16px;">Song participation | taste path</h1>
    <p style="color:#9ca3af;line-height:1.5;">Almost-anonymous song participation: click-path taste + three track leans for the Ikosagon song workflow. Visitor email is optional (opportunity follow-up only). No auto Suno spend.</p>
    <h2 style="font-size:16px;margin:24px 0 8px;color:#2bffe8;">Contact</h2>
    <table style="width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:8px 12px;color:#9ca3af;width:120px;">Name</td><td style="padding:8px 12px;">${escapeHtml(name || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Email</td><td style="padding:8px 12px;">${escapeHtml(email || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Phone</td><td style="padding:8px 12px;">${escapeHtml(phone || "-")}</td></tr>
    </table>
    <h2 style="font-size:16px;margin:24px 0 8px;color:#2bffe8;">Transcript</h2>
    <table style="width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden;">${transcriptHtml}</table>
${briefHtml}
    <h2 style="font-size:16px;margin:24px 0 8px;color:#2bffe8;">Taste path</h2>
    <table style="width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:8px 12px;color:#9ca3af;width:140px;">Genres</td><td style="padding:8px 12px;">${escapeHtml(profile?.genres.join(", ") || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Era</td><td style="padding:8px 12px;">${escapeHtml(profile?.era || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Region</td><td style="padding:8px 12px;">${escapeHtml(profile?.region || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Seed as of</td><td style="padding:8px 12px;">${escapeHtml(brief?.asOf || "-")}${brief?.lastfm ? ` · Last.fm as of ${escapeHtml(brief.lastfm.asOf)}` : ""}</td></tr>
    </table>
    <h2 style="font-size:16px;margin:24px 0 8px;color:#2bffe8;">Media</h2>
    <div style="background:#111;border-radius:12px;padding:12px 16px;">${mediaHtml}</div>
    <p style="margin-top:24px;font-size:12px;color:#6b7280;">Reply only if the visitor left email for opportunity follow-up. Anonymous paths are expected and valid.</p>
  </div>
</body></html>`;

  const textLines = [
    `IkoArtist intake - ${displayName}`,
    "",
    `Name: ${name || "-"}`,
    `Email: ${email || "-"}`,
    `Phone: ${phone || "-"}`,
    "",
    "Taste path:",
    `Genres: ${profile?.genres.join(", ") || "-"}`,
    `Era: ${profile?.era || "-"}`,
    `Region: ${profile?.region || "-"}`,
    `Seed as of: ${brief?.asOf || "-"}${brief?.lastfm ? ` | Last.fm as of ${brief.lastfm.asOf}` : ""}`,
    "",
    ...(brief ? ["Song brief:", ...briefLines(brief), ""] : []),
    "Transcript:",
    ...answers.map((item, index) => `${index + 1}. ${item.question}\n   ${item.answer}`),
    "",
    "Media:",
    ...(mediaNotes.length ? mediaNotes : ["None"]),
  ];

  await resend.emails.send({
    to: contactToEmail,
    from: process.env.CONTACT_FROM_EMAIL,
    replyTo: email || undefined,
    subject,
    html,
    text: textLines.join("\n"),
    attachments: attachments.length ? attachments : undefined,
  });

  return NextResponse.json({
    ok: true,
    attached: attachments.map((item) => item.filename),
    mediaNotes,
  });
}
