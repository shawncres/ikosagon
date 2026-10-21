/*
 * IkoLearn build-time minify: shrinks the static app in public/ikolearn/ (JS and CSS) for what is served, with no
 * runtime change. The repo keeps the readable sources; only a build tree is ever rewritten.
 *
 *   npm run build      runs this first ("prebuild"). On Vercel (VERCEL=1) the build tree is a throwaway clone, so the
 *                      files are minified in place and served as is. Locally it does nothing unless asked
 *                      (IKOLEARN_MINIFY=1), so `next dev`, the checks and your editor keep the readable files.
 *   node scripts/ikolearn-minify.mjs --out <dir>   writes the minified files to <dir> (for a look or a local test)
 *
 * esbuild, per file (no bundling: each file is its own <script>, and they share window.Iko* globals):
 *   - whitespace, comments and syntax are minified; local names inside each IIFE are shortened. Top-level names and
 *     every property name are left alone (no property mangling), so window.IkoCloud, IkoDeck, … and the stored keys
 *     of the v8 cloud are byte-for-byte the same strings.
 *   - target es2019 / modern CSS: it never rewrites into newer syntax than the sources use.
 *   - a source map (with the readable source inside) sits beside each file, linked by a sourceMappingURL comment, so
 *     the browser's devtools show the original code. Maps only load when devtools are open.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIR = path.join(ROOT, "public/ikolearn");
export const JS_TARGET = "es2019";
export const CSS_TARGET = ["chrome105", "safari16", "firefox110"];

/* The minified text of one file, exactly as it is served (with its sourceMappingURL comment), and its map. */
export function minifyFile(name, source) {
  const css = name.endsWith(".css");
  const r = transformSync(source, {
    loader: css ? "css" : "js",
    minify: true,
    target: css ? CSS_TARGET : JS_TARGET,
    sourcemap: "external",
    sourcefile: name,
    sourcesContent: true,
    legalComments: "none",
    charset: "utf8",
  });
  const code = r.code.replace(/\n+$/, "") + (css ? `\n/*# sourceMappingURL=${name}.map */\n` : `\n//# sourceMappingURL=${name}.map\n`);
  return { code, map: r.map };
}

/* The files that get minified: every .js and .css in the app folder (HTML, SVG and the privacy page are left as is). */
export function targets(dir = DIR) {
  return fs.readdirSync(dir).filter((f) => /\.(js|css)$/.test(f) && !/\.min\.|\.map$/.test(f)).sort();
}

/* Reads the readable sources from `from` and writes minified files (and maps) to `to`. -> [{ name, before, after }] */
export function minifyDir(from = DIR, to = DIR) {
  fs.mkdirSync(to, { recursive: true });
  return targets(from).map((name) => {
    const src = fs.readFileSync(path.join(from, name), "utf8");
    if (/sourceMappingURL=/.test(src)) throw new Error(`${name} already looks minified; refusing to minify it twice`);
    const { code, map } = minifyFile(name, src);
    fs.writeFileSync(path.join(to, name), code);
    fs.writeFileSync(path.join(to, name + ".map"), map);
    return { name, before: Buffer.byteLength(src), after: Buffer.byteLength(code) };
  });
}

function report(rows) {
  const b = rows.reduce((n, r) => n + r.before, 0), a = rows.reduce((n, r) => n + r.after, 0);
  rows.forEach((r) => console.log(`  ${r.name.padEnd(16)} ${String(r.before).padStart(7)} -> ${String(r.after).padStart(7)}`));
  console.log(`ikolearn minify: ${b} -> ${a} bytes (${Math.round((1 - a / b) * 100)}% smaller)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--out");
  if (i > 0) {
    const out = path.resolve(process.argv[i + 1] || "");
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(DIR)) if (!targets().includes(f)) fs.copyFileSync(path.join(DIR, f), path.join(out, f));
    report(minifyDir(DIR, out));
  } else if (process.env.VERCEL === "1" || process.env.IKOLEARN_MINIFY === "1") {
    report(minifyDir(DIR, DIR));
  } else {
    console.log("ikolearn minify: skipped (local build keeps the readable sources; set IKOLEARN_MINIFY=1 to minify in place)");
  }
}
