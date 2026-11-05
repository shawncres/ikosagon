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
