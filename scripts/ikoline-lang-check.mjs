import {
  collectSlots,
  isGreetingOrAck,
  isWeakTopic,
  matchIntent,
  topicFromText,
  scrubWeakSlots,
  interpolate,
  stripPlaceholders,
  buildAgentTurn,
} from "../lib/ikoline/engine.ts";
import { readFileSync } from "fs";

const flow = JSON.parse(readFileSync("./content/ikoline/flows/customer_service.json", "utf8"));
const greet = flow.nodes.greet;
const verify = flow.nodes.verify;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log("ok:", msg);
}

assert(isGreetingOrAck("hi"), "hi is greeting");
assert(isGreetingOrAck("Hello!"), "Hello is greeting");
assert(!isGreetingOrAck("my package is late"), "package late is not greeting");
assert(isWeakTopic("hi"), "hi is weak topic");
assert(isWeakTopic(""), "empty is weak");
assert(!isWeakTopic("shipping delay"), "shipping delay is real");
assert(topicFromText("hi") === "", "topic hi empty");
assert(topicFromText("it's been 14 days, i haven't received my package") === "lost package", "lost package topic");
assert(topicFromText("refund") === "return or exchange", "refund topic");

const slotsHi = collectSlots("hi", {}, ["reason"]);
assert(!slotsHi.reason, "collectSlots must not set reason from hi");

const slotsPkg = collectSlots("it's been 14 days, i haven't received my package", { reason: "hi" }, []);
assert(slotsPkg.reason === "lost package", "overwrite hi with lost package");

const scrubbed = scrubWeakSlots({ reason: "hi", accountId: "2044" });
assert(!scrubbed.reason && scrubbed.accountId === "2044", "scrub removes hi keeps account");

const { intent } = matchIntent(greet, "hi");
assert(intent === "greeting", `greet+hi => greeting (got ${intent})`);

const { intent: issueIntent } = matchIntent(greet, "my package never came");
assert(issueIntent === "describe_issue", `package => describe_issue (got ${issueIntent})`);

const line = interpolate("I can help with {{reason}}. Account {{accountId}}.", { reason: "hi", accountId: "2044" });
assert(!/help with hi/i.test(line), `interpolate must not say help with hi: ${line}`);
assert(/2044/.test(line), "keeps account");

const cleaned = stripPlaceholders("I can help with {{reason}}. Next.");
assert(!/with\s*\./i.test(cleaned), `strip placeholders cleaned: ${cleaned}`);

const agent = buildAgentTurn({
  node: greet,
  nextNode: null,
  exit: null,
  slots: {},
  toolResults: [],
  ragSnippets: [],
  matchedIntent: "greeting",
});
assert(/what can I take care of/i.test(agent), `greeting re-prompt: ${agent}`);
assert(!/Still need/i.test(agent), "no Still need on greeting");

const verifyLine = interpolate(verify.agentSay[0], { reason: "hi" }, []);
assert(!/help with hi/i.test(verifyLine), `verify script: ${verifyLine}`);

console.log("\nALL CHECKS PASSED");
