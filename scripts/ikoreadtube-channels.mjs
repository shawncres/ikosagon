// One-off helper: resolves @handles in lib/ikoreadtube/channels.json to channel IDs with the YouTube Data API
// (channels.list?forHandle, 1 quota unit per handle) and writes the IDs back. Needs YOUTUBE_API_KEY in the environment.
// Only the handle -> channel ID mapping is stored (identifiers we curate), never titles or other API content.
// Run: YOUTUBE_API_KEY=... node scripts/ikoreadtube-channels.mjs
import fs from "node:fs";

const file = new URL("../lib/ikoreadtube/channels.json", import.meta.url);
const key = process.env.YOUTUBE_API_KEY;
if (!key) {
  console.error("YOUTUBE_API_KEY is not set.");
  process.exit(1);
}
const list = JSON.parse(fs.readFileSync(file, "utf8"));
let units = 0;
for (const c of list) {
  if (c.id) continue;
  const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(c.handle)}`;
  const res = await fetch(url, { headers: { "x-goog-api-key": key } });
  units += 1;
  if (!res.ok) {
    console.log(`${c.handle}: HTTP ${res.status}`);
    continue;
  }
  const data = await res.json();
  const id = data.items?.[0]?.id;
  console.log(`${c.handle}: ${id ? "ok" : "not found"}`);
  if (id) c.id = id;
}
fs.writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
console.log(`resolved ${list.filter((c) => c.id).length}/${list.length}; quota units used: ${units}`);
