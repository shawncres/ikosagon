/**
 * Tiny static server for the Playwright harness.
 * Serves `public/` only, on 127.0.0.1. The Next.js app is not started, so
 * `/api/ikolearn/**` is never a live route. Tests mock those calls in the browser.
 *
 *   node e2e/serve.mjs
 *   PORT=4173 HOST=127.0.0.1
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const HTML_ALIASES = new Set([
  "/ikolearn/learners",
  "/ikolearn/privacy",
  "/ikolearn/family",
]);

function fileFor(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p === "/ikolearn" || p === "/ikolearn/") p = "/ikolearn/index.html";
  if (HTML_ALIASES.has(p)) p = `${p}.html`;
  const rel = p.replace(/^\/+/, "");
  const f = path.resolve(root, rel);
  if (f !== root && !f.startsWith(root + path.sep)) return null;
  return f;
}

const server = http.createServer((req, res) => {
  const f = fileFor(req.url || "/");
  if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(f)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(f).pipe(res);
});

server.listen(port, host, () => {
  console.log(
    `ikolearn e2e static ${root} at http://${host}:${port}/ikolearn/`,
  );
});
