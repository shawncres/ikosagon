import { chromium } from 'playwright';
const b = await chromium.launch({ headless:true, args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport:{ width:+(process.env.VW||800), height:+(process.env.VH||450) } });
p.on('console', m => { if (m.type()==='error') console.log('[console]', m.text().slice(0,1500)); });
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0,1500)));
await p.goto('file://'+process.cwd()+'/src/index.html?test&lv=2'+(process.env.NO?'&no='+process.env.NO:''));
await p.waitForFunction(() => window.ES || document.body.className.includes('e'), null, { timeout: 180000 });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const steps = JSON.parse(process.argv[2]);
for (const [code, wait, shot] of steps) {
  const r = await p.evaluate(async ([c, w]) => { let v; try { v = eval(c); } catch (e) { v = 'ERR ' + e; } await new Promise(r => setTimeout(r, w)); return JSON.stringify([v === undefined ? null : v, ES.sys()]).slice(0, 400); }, [code, wait]);
  console.log(code.slice(0, 40), '=>', r);
  if (shot) await p.screenshot({ path: `shots/g_${shot}.jpg`, quality: 85, timeout: 240000 });
}
console.log('ERRORS', errs.slice(0, 6));
await b.close();
