// Regenerates the public IkoAgent eval report from the offline regression suite.
// Run: npm run eval:ikoagent
// Writes content/ikoagent/evals/latest.json and upserts one row in history.json.
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const outDir = "content/ikoagent/evals";
const raw = join(tmpdir(), `ikoagent-eval-${process.pid}.json`);
const started = Date.now();
const run = spawnSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/ikoagent-lang-check.mjs"], {
  env: { ...process.env, EVAL_REPORT: raw, GROQ_API_KEY: "", DATABASE_URL: "" },
  stdio: ["ignore", "ignore", "inherit"],
});
const durationMs = Date.now() - started;
if (!existsSync(raw)) {
  console.error("lang-check produced no report");
  process.exit(1);
}
const { results, exitCode } = JSON.parse(readFileSync(raw, "utf8"));

function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
function tally(key) {
  const out = {};
  for (const r of results) {
    const k = r[key];
    out[k] ??= { total: 0, passed: 0 };
    out[k].total += 1;
    if (r.pass) out[k].passed += 1;
  }
  return out;
}
const passed = results.filter((r) => r.pass).length;
const baseCommit = git("merge-base", "HEAD", "origin/main") ?? git("rev-parse", "HEAD");
const report = {
  generatedAt: new Date().toISOString(),
  suite: "scripts/ikoagent-lang-check.mjs",
  mode: "offline: mocked model outputs, in-memory CRM, deterministic flow graph",
  baseCommit: baseCommit?.slice(0, 7) ?? null,
  completed: exitCode === 0,
  durationMs,
  total: results.length,
  passed,
  failed: results.length - passed,
  byFlow: tally("flow"),
  byCategory: tally("category"),
  results,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "latest.json"), JSON.stringify(report, null, 2) + "\n");

const histPath = join(outDir, "history.json");
const history = existsSync(histPath) ? JSON.parse(readFileSync(histPath, "utf8")) : [];
const label = process.env.EVAL_LABEL ?? `main @ ${report.baseCommit} + working tree`;
const row = { label, baseCommit: report.baseCommit, date: report.generatedAt.slice(0, 10), total: report.total, passed, failed: report.failed };
const i = history.findIndex((h) => h.label === label);
if (i >= 0) history[i] = row;
else history.push(row);
writeFileSync(histPath, JSON.stringify(history, null, 2) + "\n");

console.log(`IkoAgent evals: ${passed}/${results.length} passed${exitCode === 0 ? "" : " (suite stopped on first failure)"}`);
process.exit(run.status ?? 1);
