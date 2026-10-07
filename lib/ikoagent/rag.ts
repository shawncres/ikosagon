import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type IkoAgentChunk = {
  id: string;
  title: string;
  source: string;
  heading: string;
  text: string;
};

export type IkoAgentHit = IkoAgentChunk & { score: number };

const CORPUS_ROOT = path.join(process.cwd(), "content", "ikoagent", "corpus");
const TOKEN = /[a-z0-9]{2,}/g;

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(TOKEN) ?? []).filter((token) => token.length > 1);
}

function chunkMarkdown(source: string, title: string, filePath: string): IkoAgentChunk[] {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  const sections = normalized.split(/\n(?=##\s+)/);
  const chunks: IkoAgentChunk[] = [];

  sections.forEach((section, index) => {
    const headingMatch = section.match(/^##\s+(.+)$/m);
    const heading = headingMatch?.[1]?.trim() || title;
    const body = section.replace(/^---[\s\S]*?---\n/, "").trim();
    if (body.length < 30) return;

    chunks.push({
      id: `${filePath}#${index}`,
      title,
      source: filePath,
      heading,
      text: body.slice(0, 1200).trim(),
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
      return chunkMarkdown(`# ${title}\n\n${content}`, title, source);
    }),
  );

  return loaded.flat();
}

const cache = new Map<string, IkoAgentChunk[]>();

export async function retrieveIkoAgent(
  corpus: string | undefined,
  query: string,
  k = 3,
): Promise<IkoAgentHit[]> {
  if (!corpus) return [];
  let chunks = cache.get(corpus);
  if (!chunks) {
    chunks = await readCorpusDir(corpus);
    cache.set(corpus, chunks);
  }

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

export function formatIkoAgentContext(hits: IkoAgentHit[]): string {
  if (!hits.length) return "(no matching policy notes)";
  return hits
    .map((h, i) => {
      const body = h.text
        .replace(/^#+\s*/gm, "")
        .replace(/##\s*/g, "")
        .slice(0, 500)
        .trim();
      return `[${i + 1}] ${h.title} (${h.heading}): ${body}`;
    })
    .join("\n\n");
}
