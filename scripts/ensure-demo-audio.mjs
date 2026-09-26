#!/usr/bin/env node
/**
 * Writes tiny demo MP3 placeholders from scripts/demo-audio/*.mp3.b64
 * into public/projects/ai-recording-artist/. Text-only so GitHub MCP can push.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const b64Dir = path.join(__dirname, "demo-audio");
const outDir = path.join(__dirname, "..", "public", "projects", "ai-recording-artist");
fs.mkdirSync(outDir, { recursive: true });
for (const name of fs.readdirSync(b64Dir).filter((f) => f.endsWith(".mp3.b64"))) {
  const destName = name.replace(/\.b64$/, "");
  const buf = Buffer.from(fs.readFileSync(path.join(b64Dir, name), "utf8").trim(), "base64");
  const dest = path.join(outDir, destName);
  fs.writeFileSync(dest, buf);
  console.log("wrote", path.relative(process.cwd(), dest), buf.length, "bytes");
}
