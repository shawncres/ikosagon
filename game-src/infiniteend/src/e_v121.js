// v1.21: faction kits, dogfighting, charts, reputation, and the split settings menus.
// Generators live in a_core (fillWorld). This file only dresses what those seeds already decided.
if (CFG.vrVig == null) CFG.vrVig = .45;
if (CFG.vrTurn == null) CFG.vrTurn = 1;
if (CFG.vrSeat == null) CFG.vrSeat = 0;
if (CFG.vrIpd == null) CFG.vrIpd = 1;
if (CFG.vrHand == null) CFG.vrHand = 0;
if (CFG.vrHap == null) CFG.vrHap = 1;
if (CFG.vrRs == null) CFG.vrRs = 1;
if (CFG.vrFov == null) CFG.vrFov = .5;
if (CFG.vrHz == null) CFG.vrHz = 72;
if (CFG.padL == null) CFG.padL = 1;
if (!CFG.gp) CFG.gp = { fire: 7, boost: 5 };
if ((CFG.fxMig || 0) < 6) CFG.fxMig = 6;

function dangerCurve() {
  const sec = SYS.sec || [0, 0, 0];
  const d = Math.hypot(sec[0], sec[1], sec[2]);
  const hush = (hs(SYS.id ^ 0xD4) >>> 0) % 2;
  SYS.danger = Math.max(0, Math.min(4, Math.floor(d * .72) + hush + (SYS.dead ? 1 : 0)));
}
function chartOf() {
  if (!ST.chart || typeof ST.chart !== 'object') ST.chart = {};
  let c = ST.chart[SYS.id];
  if (!c) c = ST.chart[SYS.id] = { name: SYS.name, star: SYS.star, worlds: [], pay: 0, welcomed: 0 };
  return c;
}
function chartArrive() {
  const c = chartOf();
  if (c.welcomed) return;
  c.welcomed = 1; c.name = SYS.name; c.star = SYS.star;
  const known = ST.visited[SYS.id] && ST.visited[SYS.id].locs && ST.visited[SYS.id].locs.length;
  if (known) return;
  const pay = 30 + (SYS.danger || 0) * 22 + (SYS.rareSum || 0) * 28 + (SYS.dead ? 40 : 0);
  c.pay = pay; ST.credits += pay;
  tip(`First charts of ${SYS.name} · ${SYS.star} · +${pay} cr`, 6000);
  showCargo();
}
const rpgArrive0 = rpgArrive;
rpgArrive = function () { dangerCurve(); rpgArrive0(); chartArrive(); };

const navTick0 = navTick;
navTick = function (dt, fly) {
  navTick0(dt, fly);
  if (!fly) return;
  const c = navCur();
  if (!c || c.kind !== 'planet' || !scanned[c.id]) return;
  const p = SYS.planets[+c.id[1]];
  if (!p || p.type === 'none') return;
  const ch = chartOf();
  ch.worlds = ch.worlds || [];
  if (ch.worlds.indexOf(p.name) >= 0) return;
  ch.worlds.push(p.name);
  const pay = 18 + (p.rareN || 0) * 45 + (SYS.danger || 0) * 8;
  ST.credits += pay; gain({ xp: 6 + (p.rareN || 0) * 4 });
  tip(`First look at ${p.name} · ${p.rare} ${p.type}${p.anomaly ? ' · ' + p.anomaly : ''} · +${pay} cr`, 5200);
  save(); showCargo();
};

const priceAt0 = priceAt;
priceAt = function (s, loc, g) {
  const p = priceAt0(s, loc, g);
  const rep = (rp().rep && rp().rep[s.fac]) || 0;
  const m = rep >= 60 ? .82 : rep >= 25 ? .9 : rep >= 8 ? .96 : rep <= -40 ? 1.45 : rep <= -8 ? 1.16 : 1;
  return Math.max(2, Math.round(p * m));
};
const tradePanel0 = tradePanel;
tradePanel = function () {
  const rep = (rp().rep && rp().rep[SYS.fac]) || 0;
  if (rep <= -40) return panel('Berth refused', FAC[SYS.fac][0], [{ name: 'They will not have you', desc: 'Your name is posted here. Another faction will still sell to you, or you can earn this one back.' }], xr ? 'B to close' : 'J to close');
  return tradePanel0();
};

const ORECOST = [[3, 8], [4, 4], [5, 2]];
function outfitPanel() {
  const r = rp();
  panel('Outfitter', `${ST.credits} credits · a find can pay instead`, UPS.map(([k, n, d]) => {
    const lv = upLv(k);
    if (lv >= 3) return { name: n + ' III', kind: 'fitted', desc: d };
    const cost = 300 * 3 ** lv, ore = ORECOST[lv], have = cargo[ore[0]] || 0;
    const buyCr = ST.credits >= cost ? () => { ST.credits -= cost; r.up[k] = lv + 1; save(); showCargo(); tip(n + ' fitted', 4000); outfitPanel(); } : undefined;
    const buyOre = have >= ore[1] ? () => { cargo[ore[0]] -= ore[1]; r.up[k] = lv + 1; save(); showCargo(); tip(n + ' fitted from the hold', 4000); outfitPanel(); } : undefined;
    return { name: `${n} ${'I'.repeat(lv + 1)}`, kind: cost + ' cr', desc: d + ` · or ${ore[1]} ${TIERS[ore[0]]} (you hold ${have})`, run: buyCr || buyOre };
  }).concat(UPS.map(([k, n]) => {
    const lv = upLv(k); if (lv >= 3) return null;
    const ore = ORECOST[lv], have = cargo[ore[0]] || 0;
    if (have < ore[1] || ST.credits >= 300 * 3 ** lv) return null;
    return { name: `Fit ${n} with ${TIERS[ore[0]]}`, kind: `${ore[1]} held`, desc: 'Credits are short. The hold covers it.', run: () => { cargo[ore[0]] -= ore[1]; r.up[k] = lv + 1; save(); showCargo(); tip(n + ' fitted from the hold', 4000); outfitPanel(); } };
  }).filter(Boolean)), xr ? 'A to select · B to close' : 'Press a number · J to close');
}

EV.push(
  ['Distress at {p}. A hauler is bleeding air, and the band is full of the Silence.', [['Share oxygen and a tow', 'They make the gate. The Union remembers the favour.', { rep: 8, xp: 24, cr: 40 }], ['Sell them a seal', 'It holds. They pay more than it was worth.', { cr: 120, xp: 10 }], ['Keep going', 'The squawk fades.', { rep: -4 }]]],
  ['A relic tone at {p}: hull-warm metal, older than the Survey, still answering.', [['Log it for the Survey', 'First charts of a thing with no name. The licence pays.', { cr: 160, xp: 40, rep: 6 }], ['Take a shard', 'It sings in the hold.', { min: [5, 1], xp: 20 }], ['Leave it', 'Some doors are better shut.', { xp: 12 }]]],
  ['{p} warns that a rival wing is hunting pilots who draw new charts.', [['Stand and answer', 'They break off when the lance finds them. Word travels.', { cr: 90, xp: 30, rep: 4 }], ['Pay them to look elsewhere', 'Credits change hands. The lane goes quiet.', { cr: -70 }], ['Run dark', 'You are gone before they are sure.', { xp: 16, rep: -2 }]]]
);
function eventPanel() {
  const rep = (rp().rep && rp().rep[SYS.fac]) || 0;
  const R = mulberry32((SYS.salt ^ 0xE7E ^ Math.imul((SYS.danger || 0) + 1, 0x9E3779B1)) >>> 0);
  const f = (s) => s.replace('{p}', SYS.locs[SYS.loc].name).replace('{s}', SYS.name);
  let pool = EV;
  if ((SYS.danger || 0) >= 3) pool = EV.filter((e, i) => i >= EV.length - 3 || i % 2 === 1);
  else if (rep >= 25) pool = EV.filter((e, i) => i < 8 || i === EV.length - 2);
  const e = pool[R() * pool.length | 0];
  panel('Encounter', SYS.locs[SYS.loc].name + ' · ' + FAC[SYS.fac][0], [{ name: 'Contact', desc: f(e[0]) }].concat(e[1].map((o) => ({ name: o[0], desc: '', run: () => { gain(o[2]); panel('Encounter', SYS.locs[SYS.loc].name, [{ name: o[0], desc: f(o[1]) }, { name: 'Carry on', desc: '', run: () => {} }], xr ? 'A to select · B to close' : 'Press a number · J to close'); } }))), xr ? 'A to select · B to close' : 'Press a number to choose');
}

const KITN = ['MC', 'LANTERN', 'HAULER', 'SURVEY'];
function factionDress() {
  for (const a of NPCS) {
    if (a.role === 5 || a.bounty) {
      if (!a._scaled) {
        a._scaled = 1;
        const d = 1 + (SYS.danger || 0) * .2;
        a.hp = a.hpM = (a.hpM || a.hp || 80) * d;
        a.sh = a.shM = (a.shM || a.sh || 40) * d;
        a.sp = (a.sp || 110) * (1 + (SYS.danger || 0) * .05);
      }
      continue;
    }
    if (a.big) continue;
    const kit = a.role === 2 ? SYS.fac : (a.fac == null ? SYS.fac : a.fac % 4);
    a.var = kit === 2 ? 2 : kit === 1 ? 1 : 0;
    a.hue = kit === 0 ? .55 : kit === 1 ? .1 : kit === 2 ? .04 : .46;
    if (!a.cast && !a._named) {
      a._named = 1;
      const R = mulberry32((SYS.salt ^ Math.imul(a.i + 1, 0x85EBCA77)) >>> 0);
      if (kit === 0) a.name = 'MC ' + pickN(R, NM.navy);
      else if (kit === 1) a.name = 'Ring ' + pickN(R, NM.world);
      else if (kit === 2) a.name = pickN(R, NM.ship);
      else a.name = 'DS ' + pickN(R, NM.ship);
    }
  }
}
const npcSpawn0 = npcSpawn;
npcSpawn = function () { npcSpawn0(); factionDress(); };
const navBuild0 = navBuild;
navBuild = function () {
  navBuild0();
  const tag = KITN[SYS.fac] || 'DS';
  for (const n of NAV) if (n.kind === 'station' && n.name.indexOf(tag) !== 0) n.name = tag + ' ' + n.name;
};

function v121Dog(a, dt, qx, qy, qz, qd) {
  if (!a.df) a.df = { mode: 0, t: 1.2, tel: 0, told: 0 };
  const df = a.df;
  const dif = Math.max(.5, Math.min(1.4, .58 + (SYS.danger || 0) * .15 + (a.bounty ? .14 : 0) + (a.rival ? .2 : 0)));
  const pers = a.fac === 1 ? 1 : a.fac === 2 ? 2 : 0;
  if (!a._winged) {
    a._winged = 1;
    if ((a.i & 1) && !a.lead && !a.bounty) {
      for (const b of NPCS) if (b !== a && b.role === 5 && !b.lead && !b.wingUsed && !b.fled) { a.lead = b; a.off = [42, 6, 56]; b.wingUsed = 1; break; }
    }
  }
  df.t -= dt;
  const leadT = Math.min(1.25, qd / (860 + dif * 80));
  let tx = px + vx * leadT, ty = py + vy * leadT * .55, tz = pz + vz * leadT;
  if (df.t <= 0) {
    if (qd < 150) { df.mode = 2; df.t = .8; }
    else if (qd < 400 && pers === 2) { df.mode = 1; df.t = .6; }
    else if (qd < 560 && a.hp < (a.hpM || 1) * .42) { df.mode = 3; df.t = 1.1; }
    else { df.mode = 0; df.t = 1.25; }
  }
  if (df.mode === 1) { const s = 700 / qd; tx = a.x + qz * s; ty = a.y + Math.sin(tm * 2.2 + a.seed * 6) * 150; tz = a.z - qx * s; }
  else if (df.mode === 2) { tx = px + sRx * 620 - sFx * 160; ty = py + 80; tz = pz + sRz * 620 - sFz * 160; }
  else if (df.mode === 3) { tx = a.x + a.fx * 2000; ty = a.y + 180; tz = a.z + a.fz * 2000; a.sp = Math.min(200, (a.sp || 120) + 24); }
  a.wp = [tx, ty, tz]; a.hold = 0;
  const ax = tx - a.x, ay = ty - a.y, az = tz - a.z, ad = Math.hypot(ax, ay, az) || 1;
  const nose = (a.fx * ax + a.fy * ay + a.fz * az) / ad;
  a.cd = (a.cd || 0) - dt;
  if (flying() && !a.fled && qd > 80 && qd < 460 + dif * 120 && nose > .99 - dif * .01) {
    df.tel += dt;
    if (!df.told) { df.told = 1; tip(a.name + ' is lining up a shot', 2200); }
    put(DPa, qx * .22, qy * .22, qz * .22, 3.5 + df.tel * 5, 0, 0, 0, .25, 1.5, .4, .16, 0);
    if (df.tel > (pers === 1 ? .58 : .32) / dif && a.cd <= 0) {
      a.cd = (pers === 2 ? .28 : .42) / dif; df.tel = 0;
      hurtSrc = 'raider'; hurtSrcT = tm; hitFromX = a.x; hitFromY = a.y; hitFromZ = a.z;
      hurt(.8 + dif * .5); trauma = Math.min(1, trauma + (typeof xr !== 'undefined' && xr ? .04 : .1)); thud(.14);
      put(DT, qx, qy, qz, .35, -qx * .08, -qy * .08, -qz * .08, 0, 2.2, .45, .18, 0);
    }
  } else { df.tel = Math.max(0, df.tel - dt * 1.5); if (nose < .85) df.told = 0; }
  return true;
}

let setTab = 0;
function setUi() {
  { const h = HCOL[CFG.hud][1][3], de = document.documentElement.style; de.setProperty('--hc', h); de.setProperty('--hcr', [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ')); }
  hostLv = CFG.host; hudOp = CFG.op; cinOn = !!CFG.cin; keep('ibCfg', JSON.stringify(CFG)); mkIcons(HCOL[CFG.hud][1][2]);
  cinFit();
  if (setP.style.display === 'none') return;
  const headset = !!(xr || isPWA()), touch = mob && !headset;
  const tabs = headset ? ['Comfort', 'Display', 'Audio'] : touch ? ['Display', 'Audio', 'Flight'] : ['Display', 'Audio', 'Flight', 'Controls'];
  if (setTab >= tabs.length) setTab = 0;
  const row = (k, name, val) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid rgb(var(--hcr) / .14);padding:8px 0"><span>${name}</span><button data-k="${k}" style="min-width:168px;padding:7px 14px;background:${rebind === k ? 'var(--hc)' : 'rgb(var(--hcr) / .06)'};color:${rebind === k ? '#041018' : 'var(--hc)'};border:1px solid rgb(var(--hcr) / .5);font:inherit;cursor:pointer">${val}</button></div>`;
  const tabBtn = tabs.map((t, i) => `<button data-k="tab:${i}" style="margin:0 8px 0 0;padding:6px 12px;letter-spacing:.14em;text-transform:uppercase;font:inherit;cursor:pointer;background:${i === setTab ? 'var(--hc)' : 'transparent'};color:${i === setTab ? '#041018' : 'var(--hc)'};border:1px solid var(--hc)">${t}</button>`).join('');
  const turnN = ['smooth', 'snap 30°', 'snap 45°'][CFG.vrTurn || 0];
  const vigN = !CFG.vrVig ? 'off' : CFG.vrVig < .7 ? 'subtle' : 'full';
  const hapN = ['off', 'subtle', 'strong'][CFG.vrHap || 0] || 'off';
  const scaleN = ['90%', '100%', '110%'][Math.round(((CFG.vrIpd || 1) - .9) / .1)] || '100%';
  const rsN = ['0.8', '1', '1.2'][[.8, 1, 1.2].indexOf(CFG.vrRs)] || '1';
  const fovN = ['off', 'medium', 'high'][[0, .5, 1].indexOf(CFG.vrFov)] || 'off';
  const hzN = (CFG.vrHz || 72) + ' Hz';
  let body = '';
  const tab = tabs[setTab];
  if (tab === 'Comfort') {
    body = row('vrTurn', 'Turning', turnN) + row('vrVig', 'Comfort vignette', vigN) + row('vrHz', 'Refresh', hzN) + row('vrSeat', 'Posture', CFG.vrSeat ? 'standing' : 'seated') + row('vrH', 'Seat height', VRH[vrHi()][0]) + row('vrIpd', 'View scale', scaleN) + row('vrHand', 'Throttle hand', CFG.vrHand ? 'left' : 'right') + row('vrHap', 'Touch haptics', hapN) + row('ck', 'Cockpit', cockpit ? 'on' : 'off');
  } else if (tab === 'Display') {
    body = row('hud', 'HUD colour', HCOL[CFG.hud][0]) + row('op', 'HUD brightness', Math.round(CFG.op * 100) + '%') + row('size', 'HUD size', Math.round(CFG.size * 100) + '%');
    if (headset) body += row('vrRs', 'Render scale', rsN + ' · next entry') + row('vrFov', 'Fixed foveation', fovN) + row('ck', 'Cockpit', cockpit ? 'on' : 'off') + `<p style="color:rgb(var(--hcr) / .8);margin:14px 0 0">Quest 3 budget is 13.9 ms at 72 Hz, 11.1 ms at 90, 8.3 ms at 120. A steady 72 is kinder than a 120 that drops frames. Foveation cheapens the edge of each eye. This game draws the world to an offscreen buffer first, so the foveation mostly helps the final pass. Drop the render scale if the frame time slips. Quest 3S has no 120 Hz mode.</p>`;
    else body += row('cin', 'Cinematic bars', CFG.cin ? 'on' : 'off') + row('fs', 'Full screen on launch', CFG.fs === 0 ? 'off' : 'on') + row('fxVisor', 'Curved visor', LV3(CFG.fxVisor)) + row('fxGlass', 'Visor glass', LV3(CFG.fxGlass)) + row('fxBlur', 'Motion blur', LV3(CFG.fxBlur)) + row('fxCA', 'Colour fringing', LV3(CFG.fxCA)) + row('fxGrain', 'Film grain', LV3(CFG.fxGrain)) + row('fxBloom', 'Glow', LV3(CFG.fxBloom)) + row('fxFlare', 'Lens flare', LV3(CFG.fxFlare)) + row('fxScan', 'Scanlines', CFG.fxScan ? 'on' : 'off') + row('fxVig', 'Darkened corners', CFG.fxVig ? 'on' : 'off');
  } else if (tab === 'Audio') {
    body = row('radio', 'Ikosagon radio', CFG.radio ? 'on' : 'off') + row('pl', 'Playlist between songs', CFG.pl ? 'on' : 'off') + row('vEng', 'Engine and boost', pct(CFG.vEng)) + row('vCht', 'Radio chatter', pct(CFG.vCht)) + row('vRad', 'Music', pct(CFG.vRad));
    if (!headset && !touch) body += row('suno', 'Suno playlist', 'open');
  } else if (tab === 'Flight') {
    body = row('host', 'Other pilots', ['peaceful', 'wary', 'hostile'][CFG.host]) + row('inv', 'Invert pitch', CFG.inv ? 'on' : 'off') + row('wipe', 'New universe', 'asks first');
    if (!touch) body += row('ctl', 'Stick model', CFG.ctl ? 'space sim' : 'standard');
    if (touch) body += `<p style="color:rgb(var(--hcr) / .8);margin:14px 0 0">Hold to fly. Slide to steer. A second finger boosts. The FIRE button shoots. The aux display, gate and journal stay on their own controls.</p>`;
  } else {
    body = row('sens', 'Mouse sensitivity', Math.round(CFG.sens * 100) + '%') + row('padL', 'Gamepad', CFG.padL === 0 ? 'match headset' : 'racer') + row('gpFire', 'Fire button', CFG.padL === 0 ? 'right trigger' : ({ 7: 'right trigger', 5: 'right bumper', 0: 'A', 2: 'X' }[CFG.gp.fire] || 'right trigger')) + row('gpBoost', 'Boost button', ({ 7: 'right trigger', 5: 'right bumper', 6: 'left trigger', 4: 'left bumper' }[CFG.gp.boost] || 'right bumper'))
      + `<h3 style="margin:22px 0 6px;font-weight:600;letter-spacing:.22em;font-size:12px;color:var(--hc)">KEYBOARD</h3>`
      + ACTS.map(([k, n]) => row('key:' + k, n, rebind === 'key:' + k ? 'press a key…' : keyName(CFG.keys[k] || k))).join('')
      + row('reset', 'All keys', 'defaults');
  }
  setP.innerHTML = `<div style="max-width:760px;margin:auto"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><h2 style="font-weight:300;letter-spacing:.28em;margin:0">SETTINGS</h2><button data-k="close" style="background:rgb(var(--hcr) / .08);border:1px solid var(--hc);color:var(--hc);padding:6px 18px;font:inherit;cursor:pointer">Done</button></div><div style="margin:18px 0 8px">${tabBtn}</div>${body}<p style="margin-top:18px;color:rgb(var(--hcr) / .65);font-size:13px;letter-spacing:.08em">${BUILD}</p></div>`;
}
setP.onclick = (e) => {
  const k = e.target.dataset && e.target.dataset.k; if (!k) return;
  if (k === 'close') { setP.style.display = 'none'; rebind = null; return; }
  if (k.startsWith('tab:')) { setTab = +k.slice(4); rebind = null; setUi(); return; }
  if (k.startsWith('key:')) { rebind = rebind === k ? null : k; setUi(); return; }
  if (k === 'reset') CFG.keys = {};
  else if (k === 'suno') window.open('https://suno.com/playlist/12f42e02-78a5-4eb2-bf7e-f605817e4c06', '_blank', 'noopener');
  else if (k === 'wipe') { setP.style.display = 'none'; newUniverse(); return; }
  else if (k === 'hud') CFG.hud = (CFG.hud + 1) % HCOL.length;
  else if (k === 'op') CFG.op = cyc(CFG.op, [1, .7, .45, .25]);
  else if (k === 'size') CFG.size = cyc(CFG.size, [1, 1.15, .85]);
  else if (k === 'ctl') CFG.ctl = CFG.ctl ? 0 : 1;
  else if (k === 'vrH') CFG.vrH = VRH[(vrHi() + 1) % VRH.length][1];
  else if (k === 'vrTurn') CFG.vrTurn = ((CFG.vrTurn || 0) + 1) % 3;
  else if (k === 'vrVig') CFG.vrVig = cyc(CFG.vrVig || 0, [0, .45, 1]);
  else if (k === 'vrSeat') CFG.vrSeat = CFG.vrSeat ? 0 : 1;
  else if (k === 'vrIpd') CFG.vrIpd = cyc(CFG.vrIpd || 1, [.9, 1, 1.1]);
  else if (k === 'vrHand') CFG.vrHand = CFG.vrHand ? 0 : 1;
  else if (k === 'vrHap') CFG.vrHap = ((CFG.vrHap || 0) + 1) % 3;
  else if (k === 'vrRs') CFG.vrRs = cyc(CFG.vrRs || 1, [.8, 1, 1.2]);
  else if (k === 'vrFov') { CFG.vrFov = cyc(CFG.vrFov || 0, [0, .5, 1]); if (typeof applyFoveation === 'function') applyFoveation(); }
  else if (k === 'vrHz') { CFG.vrHz = cyc(CFG.vrHz || 72, [72, 90, 120]); if (typeof applyVrRate === 'function') applyVrRate(); }
  else if (k === 'ck') { const b = $('ck'); if (b) b.click(); }
  else if (k === 'vEng' || k === 'vCht' || k === 'vRad') CFG[k] = cyc(CFG[k], [1, .75, .5, .25, 0]);
  else if (k === 'cin') CFG.cin = CFG.cin ? 0 : 1;
  else if (k === 'fs') CFG.fs = CFG.fs === 0 ? 1 : 0;
  else if (k === 'radio') CFG.radio = CFG.radio ? 0 : 1;
  else if (k === 'pl') { CFG.pl = CFG.pl ? 0 : 1; if (!CFG.pl && plA) { plA.pause(); plOn = 0; } }
  else if (['fxBlur', 'fxCA', 'fxGrain', 'fxBloom', 'fxFlare', 'fxVisor', 'fxGlass'].includes(k)) CFG[k] = cyc(CFG[k], [.5, 1, 0]);
  else if (k === 'fxScan' || k === 'fxVig') CFG[k] = CFG[k] ? 0 : 1;
  else if (k === 'inv') CFG.inv = CFG.inv ? 0 : 1;
  else if (k === 'sens') CFG.sens = cyc(CFG.sens, [1, 1.3, 1.7, .5, .75]);
  else if (k === 'host') { CFG.host = (CFG.host + 1) % 3; hostLv = CFG.host; if (SYS) npcSpawn(); }
  else if (k === 'padL') CFG.padL = CFG.padL === 0 ? 1 : 0;
  else if (k === 'gpFire') { const list = [7, 5, 0, 2]; CFG.gp.fire = list[(list.indexOf(CFG.gp.fire) + 1) % list.length]; }
  else if (k === 'gpBoost') { const list = [5, 7, 6, 4]; CFG.gp.boost = list[(list.indexOf(CFG.gp.boost) + 1) % list.length]; }
  setUi();
};

function pausePanel() {
  if (jpOpen) return closePanel();
  if (xr) return vrMenu();
  panel('Paused', `${SYS.locs[SYS.loc].name} · ${SYS.name}`, [
    { name: 'Resume', desc: '', run: () => {} },
    { name: 'Ikosagon radio', kind: CFG.radio ? 'on' : 'off', desc: 'Your tracks, or the ship\'s own score', run: () => { CFG.radio = CFG.radio ? 0 : 1; setUi(); pausePanel(); } },
    { name: 'Other pilots', kind: ['peaceful', 'wary', 'hostile'][CFG.host], desc: 'Whether raiders come looking', run: () => { CFG.host = (CFG.host + 1) % 3; hostLv = CFG.host; setUi(); npcSpawn(); pausePanel(); } },
    { name: 'HUD colour', kind: HCOL[CFG.hud][0], desc: '', run: () => { CFG.hud = (CFG.hud + 1) % HCOL.length; setUi(); pausePanel(); } },
    { name: 'Journal', desc: 'Contracts, standing, first charts', run: journalPanel },
    { name: 'Star map', desc: 'Where you have been, and the lanes between', run: starMap },
    { name: 'Settings', desc: 'Display, audio, flight, controls', run: () => { closePanel(); setP.style.display = 'block'; setUi(); } },
  ], 'Esc closes · ' + BUILD);
}
function vrMenu() {
  const turnN = ['smooth', 'snap 30°', 'snap 45°'][CFG.vrTurn || 0];
  const vigN = !CFG.vrVig ? 'off' : CFG.vrVig < .7 ? 'subtle' : 'full';
  const hapN = ['off', 'subtle', 'strong'][CFG.vrHap || 0] || 'off';
  panel('Paused', `${SYS.locs[SYS.loc].name} · ${SYS.name}`, [
    { name: 'Resume', desc: '', run: () => {} },
    { name: 'Turning', kind: turnN, desc: 'Snap is the Quest comfort default. Pitch stays smooth either way.', run: () => { CFG.vrTurn = ((CFG.vrTurn || 0) + 1) % 3; setUi(); vrMenu(); } },
    { name: 'Comfort vignette', kind: vigN, desc: 'Darkens the edge of each eye while you boost', run: () => { CFG.vrVig = cyc(CFG.vrVig || 0, [0, .45, 1]); setUi(); vrMenu(); } },
    { name: 'Refresh', kind: (CFG.vrHz || 72) + ' Hz', desc: '72 is 13.9 ms. 90 is 11.1. 120 is 8.3 and Quest 3 only. The nearest rate the headset offers is used.', run: () => { CFG.vrHz = cyc(CFG.vrHz || 72, [72, 90, 120]); applyVrRate(); setUi(); vrMenu(); } },
    { name: 'Posture', kind: CFG.vrSeat ? 'standing' : 'seated', desc: 'Seated drops you into the chair. Standing uses the floor.', run: () => { CFG.vrSeat = CFG.vrSeat ? 0 : 1; setUi(); vrMenu(); } },
    { name: 'Seat height', kind: VRH[vrHi()][0], desc: 'Where the cabin floor meets the room', run: () => { CFG.vrH = VRH[(vrHi() + 1) % VRH.length][1]; setUi(); vrMenu(); } },
    { name: 'View scale', kind: ({ .9: '90%', 1: '100%', 1.1: '110%' }[CFG.vrIpd || 1] || '100%'), desc: 'A small scale around the headset IPD. It does not replace it.', run: () => { CFG.vrIpd = cyc(CFG.vrIpd || 1, [.9, 1, 1.1]); setUi(); vrMenu(); } },
    { name: 'Throttle hand', kind: CFG.vrHand ? 'left' : 'right', desc: 'The cab has the stick on the left. Swap if you fly the other way.', run: () => { CFG.vrHand = CFG.vrHand ? 0 : 1; setUi(); vrMenu(); } },
    { name: 'Haptics', kind: hapN, desc: 'Touch Plus buzz on a panel, a snap turn, and a hit', run: () => { CFG.vrHap = ((CFG.vrHap || 0) + 1) % 3; setUi(); vrMenu(); } },
    { name: 'Render scale', kind: String(CFG.vrRs || 1), desc: 'Eye buffer scale. Applies the next time you enter VR.', run: () => { CFG.vrRs = cyc(CFG.vrRs || 1, [.8, 1, 1.2]); setUi(); vrMenu(); } },
    { name: 'Foveation', kind: ({ 0: 'off', .5: 'medium', 1: 'high' }[CFG.vrFov || 0] || 'off'), desc: 'Lowers the edge of each eye. Medium is the Quest default.', run: () => { CFG.vrFov = cyc(CFG.vrFov || 0, [0, .5, 1]); applyFoveation(); setUi(); vrMenu(); } },
    { name: 'Cockpit', kind: cockpit ? 'on' : 'off', desc: 'The cabin, or open space', run: () => { const b = $('ck'); if (b) b.click(); vrMenu(); } },
    { name: 'HUD colour', kind: HCOL[CFG.hud][0], desc: '', run: () => { CFG.hud = (CFG.hud + 1) % HCOL.length; setUi(); vrMenu(); } },
    { name: 'Journal', desc: 'Contracts, standing, first charts', run: journalPanel },
    { name: 'Controls', desc: 'Touch Plus, Quest 3 and newer', run: () => panel('Controls', 'Touch Plus', [
      { name: CFG.vrHand ? 'Right stick' : 'Left stick', desc: (CFG.vrTurn ? 'Snap turn and pitch. ' : 'Yaw and pitch. ') + 'This hand keeps flying while a menu is open.' },
      { name: CFG.vrHand ? 'Left stick' : 'Right stick', desc: 'Throttle, and strafe on the sideways axis. In a menu, this stick moves the row.' },
      { name: 'Either trigger', desc: 'Fire. A normal squeeze is enough. The hard second stage is not required.' },
      { name: 'Either grip', desc: 'Boost. Hold it and it builds. There is nothing to grab in the cab.' },
      { name: 'A', desc: 'Hail, dock, or accept the row.' },
      { name: 'B', desc: 'Next target in flight. Back, when a menu is open.' },
      { name: 'X', desc: 'Journal' },
      { name: 'Y', desc: 'Next weapon' },
      { name: 'Menu, left controller', desc: 'This pause menu. The Meta button on the right belongs to the system.' },
      { name: 'Throttle stick click', desc: 'Throttle to zero' },
      { name: 'Hands', desc: 'Empty hands are ignored. The ship stays on Touch Plus.' },
    ], 'B to close') },
    { name: 'Exit to main menu', desc: 'Leave the headset view', run: () => { try { xr.end(); } catch (e) {} menu(); } },
  ], 'Throttle stick moves the row · trigger or A selects · B goes back · ' + BUILD);
}
