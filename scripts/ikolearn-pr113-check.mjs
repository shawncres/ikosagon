import { callModel, stripFences } from "../lib/ikolearn/llm.ts";
import { parseLessonBlock, parseKeyIdea, parseLearnInput } from "../lib/ikolearn/prompts.ts";
let pass=0, fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.log("x",m))};
const ENV={GEMINI_API_KEY:"test"}; 
const reply=(t)=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:t}]}}]}),{status:200,headers:{"content-type":"application/json"}});
let calls=[]; const f=(outs)=>{calls=[];return async(u,i)=>{calls.push(JSON.parse(i.body));return reply(outs.shift())}};
const v=(t)=>{const o=JSON.parse(t);return o.title&&o.title.length<40?o:null};
let r=await callModel(s=>({system:s?"short":"long",user:"u"}),{},v,ENV,f(["```json\n{\"title\":\"Hi\"}\n```"]));
ok(r.ok&&r.value.title==="Hi","fences stripped");
r=await callModel(s=>({system:"s",user:"u"}),{},v,ENV,f(["not json","{\"title\":\"ok\"}"]));
ok(r.ok&&calls.length>=2,"retry after malformed");
ok(JSON.stringify(calls.at(-1)).includes("JSON object only"),"retry is stricter");
r=await callModel(s=>({system:"s",user:"u"}),{},v,ENV,f(["bad","bad","bad","bad"]));
ok(!r.ok,"malformed never returned as value");
const blk={key_idea:"Volcanoes erupt when pressure from melted rock pushes up through weak spots in the crust.",questions:[
{kind:"recall",q:"What makes a volcano erupt?",options:["Pressure from magma","The moon pulling","Cold rain"],answer:0,why:["","Tides are pulled by the moon","Rain cools things"]},
{kind:"apply",q:"A soda bottle is shaken then opened. Why does it spray?",options:["Built-up gas pressure","It got colder","The cap was sticky"],answer:0,why:["","Cold feels like it matters","Sticky things pop"]},
{kind:"mistake",q:"Sam says lava is hottest when it is black. What went wrong?",options:["Black lava has cooled","Nothing","Lava is never hot"],answer:0,why:["","It sounds plausible","Some rocks are cool"]}],choices:[{name:"Magma",kind:"deeper",why:"go deeper"}]};
const b=parseLessonBlock(JSON.stringify(blk),"Shawn","Volcanoes",false);
ok(b&&b.key&&b.key.split(" ").length<=25,"key_idea kept");
ok(b.questions.length===3&&["recall","apply","mistake"].every(k=>b.questions.some(q=>q.kind===k)),"one of each kind");
ok(b.questions.every(q=>q.why&&q.why[q.answer]===""&&q.why.filter(Boolean).length===2),"why aligned after rotation");
ok(b.questions.every(q=>q.why.every((w,i)=>i===q.answer|| (blk.questions.find(x=>x.q===q.q).why[blk.questions.find(x=>x.q===q.q).options.indexOf(q.options[i])]===w))),"why matches its option");
ok(parseKeyIdea("For example, a soda bottle sprays when shaken and opened quickly.")==="","example rejected as key idea");
ok(parseKeyIdea(Array(30).fill("word").join(" "))==="","over 25 words rejected");
ok(parseLearnInput({name:"A",strict:true,mode:"notice"}).strict===true,"strict flag accepted");
console.log(`pr113 mocked: ${pass} passed, ${fail} failed`);

/* PR 118: the check block and the weekly recap */
{
  const { checkFor } = await import("../lib/ikolearn/service.ts");
  const { createRequire } = await import("node:module");
  const P = createRequire(import.meta.url)("../public/ikolearn/orchestrator.js");
  const IN = parseLearnInput({ mode: "notice", name: "Sam", focus: "Compound Interest", messages: [], lesson: "INTRO: Compound interest means interest earns interest. EXPLAIN: Each year the interest joins the total, so the next year's interest is a little bigger than before." });
  const Q = (kind) => ({ kind, q: `A ${kind} question about compound interest?`, options: ["Interest joins the total", "It stays flat", "It shrinks"], answer: 0, why: ["", "Flat sounds simple", "Fees feel likely"] });
  const good = JSON.stringify({ key_idea: "Compound interest adds earned interest to the total, so later interest grows.", questions: [Q("recall"), Q("apply"), Q("mistake")], retry: [] });
  const partial = JSON.stringify({ key_idea: "x", questions: [Q("recall")] });
  let o = await checkFor(IN, ENV, f([partial, good]));
  ok(o.status === 200 && o.body.questions.length === 3 && calls.length === 2, "check: a partial check is retried, then the full one is used");
  o = await checkFor(IN, ENV, f([partial, "not json", "x", "y"]));
  ok(o.status !== 200 && !o.body.questions, "check: a partial check never reaches the screen");
  ok(parseLessonBlock(JSON.stringify({ questions: [{ ...Q("recall"), options: ["The original fifty dollars plus the five dollars you just earned on it in year one", "b", "c"] }], choices: [{ name: "Next", kind: "deeper", why: "go" }] }), "Sam", "CI").questions.length === 1, "an option up to 110 chars is kept whole");
  ok((parseLessonBlock(JSON.stringify({ questions: [{ ...Q("recall"), options: ["x".repeat(140), "b", "c"] }], choices: [{ name: "Next", kind: "deeper", why: "go" }] }), "Sam", "CI")?.questions || []).length === 0, "an over-long option drops the question (never cut mid-word)");
  const r = P.weekRecap([{ label: "Volcanoes", passed: false }, { label: "Compound Interest", passed: true, key: "Interest earns interest over time." }], "Monthly Compounding");
  const sentences = r.match(/[^.!?]+[.!?]/g) || [];
  ok(sentences.length === 4 && /^This week you explored Volcanoes and Compound Interest\./.test(r) && /passed the check on Compound Interest/.test(r) && /Monthly Compounding/.test(r), "recap: four sentences, both topics, a real check, the next step");
  ok(!/\b(best|amazing|brilliant|perfect|genius|smart|excellent|incredible|outstanding)\b/i.test(r), "recap: no superlatives or ability claims");
  ok(P.weekRecap([], "") === "", "recap: nothing this week, no recap");
  console.log(`pr118 mocked: ${pass} passed, ${fail} failed`);
}
