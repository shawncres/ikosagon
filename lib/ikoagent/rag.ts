import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type IkoAgentChunk = {
  id: string;
  title: string;
  source: string;
  heading: string;
  /** Agent-facing guidance (instructions, codes, scripts). Never read to the caller. */
  text: string;
  /**
   * Caller-safe policy line authored as `<!-- caller: … -->` under a heading.
   * Sections without one are agent-only: the scripted fallback never surfaces them.
   */
  callerLine?: string;
  /** Frontmatter `skipWhenVerified: true` — drop once the account is verified/created */
  skipWhenVerified?: boolean;
};

export type IkoAgentHit = IkoAgentChunk & { score: number };

const CORPUS_ROOT = path.join(process.cwd(), "content", "ikoagent", "corpus");
const TOKEN = /[a-z0-9]{2,}/g;

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(TOKEN) ?? []).filter((token) => token.length > 1);
}

const CALLER_LINE = /<!--\s*caller:\s*([\s\S]*?)-->/i;

function chunkMarkdown(
  source: string,
  title: string,
  filePath: string,
  meta: { skipWhenVerified?: boolean } = {},
): IkoAgentChunk[] {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  const sections = normalized.split(/\n(?=##\s+)/);
  const chunks: IkoAgentChunk[] = [];

  sections.forEach((section, index) => {
    const headingMatch = section.match(/^##\s+(.+)$/m);
    const heading = headingMatch?.[1]?.trim() || title;
    const rawBody = section.replace(/^---[\s\S]*?---\n/, "");
    const callerLine = rawBody.match(CALLER_LINE)?.[1]?.replace(/\s+/g, " ").trim() || undefined;
    const body = rawBody.replace(/<!--[\s\S]*?-->\n?/g, "").trim();
    if (body.length < 30) return;

    chunks.push({
      id: `${filePath}#${index}`,
      title,
      source: filePath,
      heading,
      text: body.slice(0, 1200).trim(),
      callerLine,
      skipWhenVerified: meta.skipWhenVerified,
    });
  });

  return chunks;
}

async function readCorpusDir(corpus: string): Promise<IkoAgentChunk[]> {
  const dir = path.join(CORPUS_ROOT, corpus);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = entries.filter(
    (entry) => entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")),
  );

  const loaded = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dir, file.name);
      const raw = await fs.readFile(filePath, "utf8");
      const { data, content } = matter(raw);
      const title = String(data.title ?? file.name.replace(/\.mdx?$/, ""));
      const source = `ikoagent/corpus/${corpus}/${file.name}`;
      return chunkMarkdown(`# ${title}\n\n${content}`, title, source, {
        skipWhenVerified: data.skipWhenVerified === true,
      });
    }),
  );

  return loaded.flat();
}

const cache = new Map<string, IkoAgentChunk[]>();

export async function retrieveIkoAgent(
  corpus: string | undefined,
  query: string,
  k = 3,
  opts: { accountVerified?: boolean } = {},
): Promise<IkoAgentHit[]> {
  if (!corpus) return [];
  let chunks = cache.get(corpus);
  if (!chunks) {
    chunks = await readCorpusDir(corpus);
    cache.set(corpus, chunks);
  }
  // Account-failure / verification guidance is noise once the account is on file
  if (opts.accountVerified) chunks = chunks.filter((c) => !c.skipWhenVerified);

  const terms = tokenize(query);
  if (!terms.length) return chunks.slice(0, k).map((c) => ({ ...c, score: 0 }));

  const phrase = query.toLowerCase().replace(/\s+/g, " ").trim();
  const scored = chunks.map((chunk) => {
    const hay = `${chunk.title} ${chunk.heading} ${chunk.text}`.toLowerCase();
    const tokens = tokenize(hay);
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of terms) {
      const count = tf.get(term) ?? 0;
      if (count) score += 1 + Math.log(1 + count);
    }
    if (phrase.length > 6 && hay.includes(phrase)) score += 3;
    if (tokenize(chunk.heading).some((t) => terms.includes(t))) score += 1.4;
    return { ...chunk, score };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * LLM context: caller-safe facts are marked as quotable; everything else is
 * labelled agent-only guidance (follow it, never say it).
 */
export function formatIkoAgentContext(hits: IkoAgentHit[]): string {
  if (!hits.length) return "(no matching policy notes)";
  return hits
    .map((h, i) => {
      const body = h.text
        .replace(/^#+\s*/gm, "")
        .replace(/##\s*/g, "")
        .slice(0, 400)
        .trim();
      const fact = h.callerLine ? `\n  CALLER-SAFE FACT (ok to paraphrase): ${h.callerLine}` : "";
      return `[${i + 1}] ${h.title} (${h.heading})${fact}\n  AGENT-ONLY GUIDANCE (follow silently; never quote or read aloud): ${body}`;
    })
    .join("\n\n");
}

/** Caller-safe policy lines only (scripted fallback). Agent-only chunks are dropped. */
export function callerPolicyLines(hits: IkoAgentHit[]): string[] {
  return hits.map((h) => h.callerLine).filter((l): l is string => Boolean(l));
}

/** Agent-only text from hits, used to scrub accidental leaks from spoken replies. */
export function agentOnlyTexts(hits: IkoAgentHit[]): string[] {
  return hits.map((h) => h.text);
}
