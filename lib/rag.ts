import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export type RagChunk = {
  id: string;
  title: string;
  source: string;
  heading: string;
  text: string;
};

export type RetrievedChunk = RagChunk & { score: number };

const KNOWLEDGE_DIR = path.join(process.cwd(), "content", "knowledge");
const PROJECTS_DIR = path.join(process.cwd(), "content", "projects");

const TOKEN = /[a-z0-9]{2,}/g;

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(TOKEN) ?? []).filter((token) => token.length > 1);
}

function chunkMarkdown(source: string, title: string, filePath: string): RagChunk[] {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  const sections = normalized.split(/\n(?=##\s+)/);
  const chunks: RagChunk[] = [];

  sections.forEach((section, index) => {
    const headingMatch = section.match(/^##\s+(.+)$/m);
    const heading = headingMatch?.[1]?.trim() || title;
    const body = section.replace(/^---[\s\S]*?---\n/, "").trim();
    if (body.length < 40) return;

    const pieces = body.length > 900 ? splitSoft(body, 800) : [body];
    pieces.forEach((piece, pieceIndex) => {
      chunks.push({
        id: `${filePath}#${index}-${pieceIndex}`,
        title,
        source: filePath,
        heading,
        text: piece.trim(),
      });
    });
  });

  return chunks;
}

function splitSoft(text: string, size: number): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > size) {
    const window = remaining.slice(0, size);
    const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
    const cut = breakAt > size * 0.4 ? breakAt + 1 : size;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function readDirMarkdown(dir: string, prefix: string): Promise<RagChunk[]> {
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
      const source = `${prefix}/${file.name}`;
      return chunkMarkdown(`# ${title}\n\n${content}`, title, source);
    }),
  );

  return loaded.flat();
}

let cache: RagChunk[] | null = null;

export async function loadCorpus(): Promise<RagChunk[]> {
  if (cache) return cache;
  const [knowledge, projects] = await Promise.all([
    readDirMarkdown(KNOWLEDGE_DIR, "knowledge"),
    readDirMarkdown(PROJECTS_DIR, "projects"),
  ]);
  cache = [...knowledge, ...projects];
  return cache;
}

export async function retrieve(query: string, k = 5): Promise<RetrievedChunk[]> {
  const corpus = await loadCorpus();
  const terms = tokenize(query);
  if (!terms.length) return corpus.slice(0, k).map((chunk) => ({ ...chunk, score: 0 }));

  const phrase = query.toLowerCase().replace(/\s+/g, " ").trim();

  const scored = corpus.map((chunk) => {
    const hay = `${chunk.title} ${chunk.heading} ${chunk.text}`.toLowerCase();
    const tokens = tokenize(hay);
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of terms) {
      const count = tf.get(term) ?? 0;
      if (count) score += 1 + Math.log(1 + count);
    }
    if (phrase.length > 8 && hay.includes(phrase)) score += 3;
    if (tokenize(chunk.heading).some((token) => terms.includes(token))) score += 1.4;
    if (tokenize(chunk.title).some((token) => terms.includes(token))) score += 1.1;
    return { ...chunk, score };
  });

  return scored
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function formatContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "(no matching notes)";
  return chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.title} — ${chunk.heading} (${chunk.source})\n${chunk.text}`,
    )
    .join("\n\n");
}
