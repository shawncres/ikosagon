import { readFileSync } from "fs";
for (const k of ["GROQ_API_KEY","DATABASE_URL","POSTGRES_URL"]) delete process.env[k];
const { POST } = await import("../app/api/ikoagent/turn/route.ts");
let ip=0;
async function call(flowId, lines) {
  const f=JSON.parse(readFileSync(`./content/ikoagent/flows/${flowId}.json`,"utf8"));
  let nodeId=f.start, slots={}, history=[{role:"agent",content:f.nodes[f.start].agentSay[0]}];
  for (const [i,userText] of lines.entries()) {
    const j=await (await POST(new Request("http://l/x",{method:"POST",headers:{"content-type":"application/json","x-forwarded-for":`10.7.${Math.floor(++ip/250)}.${ip%250}`},body:JSON.stringify({flowId,nodeId,slots,history,userText,turnCount:i,sessionId:"x"})}))).json();
    console.log(`  ${userText} => ${j.nodeId}${j.exit?"!"+j.exit.type+"("+j.exit.label+")":""} [${j.debug?.matchedIntent}] tools=${(j.toolResults||[]).map(t=>t.name+(t.ok?"":"✗")).join(",")}\n     :: ${j.agentText.replace(/\n+/g," | ").slice(0,260)}`);
    nodeId=j.nodeId; slots=j.slots; history=[...history,{role:"user",content:userText},{role:"agent",content:j.agentText}];
  }
}
const L=console.log; console.log=(...a)=>typeof a[0]==="string"&&a[0].startsWith('{"demoLog"')?0:L(...a); console.info=console.log;
const S=JSON.parse(readFileSync("/tmp/flows.json","utf8"));
for (const [f,lines] of S) { L("##",f,lines[0]); await call(f,lines); }
