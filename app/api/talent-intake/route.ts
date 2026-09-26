import { NextResponse } from "next/server";
import { Resend } from "resend";

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

type TastePath = {
  genres?: string[];
  mood?: string | null;
  era?: string | null;
  region?: string | null;
  artists?: string[];
  albums?: string[];
};

type RecommendationInput = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: string | null;
  genre?: string;
  why?: string;
};

type IntakePayload = {
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  answers?: Array<{ question: string; answer: string }>;
  tastePath?: TastePath;
  recommendations?: RecommendationInput[];
  catalogAsOf?: string;
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

  const tastePath = body.tastePath || {};
  const pathGenres = Array.isArray(tastePath.genres) ? tastePath.genres.map((v) => clip(v, 80)).filter(Boolean).slice(0, 12) : [];
  const pathArtists = Array.isArray(tastePath.artists) ? tastePath.artists.map((v) => clip(v, 120)).filter(Boolean).slice(0, 16) : [];
  const pathAlbums = Array.isArray(tastePath.albums) ? tastePath.albums.map((v) => clip(v, 160)).filter(Boolean).slice(0, 16) : [];
  const pathMood = clip(tastePath.mood, 80);
  const pathEra = clip(tastePath.era, 80);
  const pathRegion = clip(tastePath.region, 80);
  const catalogAsOf = clip(body.catalogAsOf, 40);
  const recommendations = Array.isArray(body.recommendations)
    ? body.recommendations.slice(0, 5).map((item) => ({
        title: clip(item?.title, 160),
        artist: clip(item?.artist, 160),
        album: clip(item?.album, 160),
        year: clip(item?.year, 12),
        genre: clip(item?.genre, 80),
        why: clip(item?.why, 400),
      }))
    : [];

  if (!email && !name && !phone && answers.length === 0 && recommendations.length === 0) {
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

  const recsHtml = recommendations.length
    ? recommendations
        .map(
          (item, index) =>
            `<tr><td style="padding:8px 12px;border-bottom:1px solid #222;color:#9ca3af;vertical-align:top;">${index + 1}</td><td style="padding:8px 12px;border-bottom:1px solid #222;color:#fafafa;"><strong>${escapeHtml(item.title || "-")}</strong> - ${escapeHtml(item.artist || "-")}${item.album ? ` <span style="color:#9ca3af;">(${escapeHtml(item.album)}${item.year ? ` | ${escapeHtml(item.year)}` : ""})</span>` : ""}<br/><span style="color:#2bffe8;font-size:12px;">Why: ${escapeHtml(item.why || "from click path")}</span></td></tr>`,
        )
        .join("")
    : `<tr><td style="padding:12px;color:#9ca3af;">No track picks generated (user skipped early).</td></tr>`;

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
    <h2 style="font-size:16px;margin:24px 0 8px;color:#2bffe8;">Taste path</h2>
    <table style="width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:8px 12px;color:#9ca3af;width:140px;">Genres</td><td style="padding:8px 12px;">${escapeHtml(pathGenres.join(", ") || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Mood</td><td style="padding:8px 12px;">${escapeHtml(pathMood || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Era</td><td style="padding:8px 12px;">${escapeHtml(pathEra || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Region</td><td style="padding:8px 12px;">${escapeHtml(pathRegion || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Artists</td><td style="padding:8px 12px;">${escapeHtml(pathArtists.join(", ") || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Albums</td><td style="padding:8px 12px;">${escapeHtml(pathAlbums.join(", ") || "-")}</td></tr>
      <tr><td style="padding:8px 12px;color:#9ca3af;">Catalog as of</td><td style="padding:8px 12px;">${escapeHtml(catalogAsOf || "-")}</td></tr>
    </table>
    <h2 style="font-size:16px;margin:24px 0 8px;color:#2bffe8;">3 suggested tracks</h2>
    <table style="width:100%;border-collapse:collapse;background:#111;border-radius:12px;overflow:hidden;">${recsHtml}</table>
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
    `Genres: ${pathGenres.join(", ") || "-"}`,
    `Mood: ${pathMood || "-"}`,
    `Era: ${pathEra || "-"}`,
    `Region: ${pathRegion || "-"}`,
    `Artists: ${pathArtists.join(", ") || "-"}`,
    `Albums: ${pathAlbums.join(", ") || "-"}`,
    `Catalog as of: ${catalogAsOf || "-"}`,
    "",
    "3 suggested tracks:",
    ...(recommendations.length
      ? recommendations.map(
          (item, index) =>
            `${index + 1}. ${item.title || "-"} - ${item.artist || "-"}${item.why ? ` | Why: ${item.why}` : ""}`,
        )
      : ["None"]),
    "",
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
