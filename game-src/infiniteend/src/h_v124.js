// v1.24: vertex budget first. Quest (LV >= 1, one eye, home gate) aims for
// <= 1_000_000 vertices and <= 80 draws. Desktop high (LV 0) may spend more.
const QUEST = LV >= 1;
const IE_BUDGET = { questVerts: 1000000, questDraws: 80 };

const packV = pack;
pack = function (L, s, hue, hv, w) {
  if (!L || L.per <= 8) return packV(L, s, hue, hv, w);
  const old = L.per;
  L.per = Math.max(QUEST ? 3 : 6, old * (QUEST ? .38 : .7) | 0);
  packV(L, s, hue, hv, w);
  L.per = old;
};
const growV = grow;
grow = function (L, n, v, sx, sy, sz, s, w) {
  growV(L, QUEST ? Math.max(1, n * .45 | 0) : n, v, sx, sy, sz, s, w);
};

function addTorus(V, I, R, r, nM, nT, mat, uy) {
  const s0 = V.length / 8;
  for (let j = 0; j <= nT; j++) {
    const v = j / nT * 6.2831853, cv = Math.cos(v), sv = Math.sin(v);
    for (let i = 0; i <= nM; i++) {
      const u = i / nM * 6.2831853, cu = Math.cos(u), su = Math.sin(u), rr = R + r * cv;
      V.push(rr * cu, r * sv, rr * su, cv * cu, sv, cv * su, mat, uy || 0);
    }
  }
  const stride = nM + 1;
  for (let j = 0; j < nT; j++) for (let i = 0; i < nM; i++) {
    const a = s0 + j * stride + i, b = a + stride;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
function smoothStation() {
  const V = [], I = [], nM = QUEST ? 32 : 48, nT = QUEST ? 8 : 10;
  addTorus(V, I, 1, .058, nM, nT, 0, 0);
  addTorus(V, I, .9, .014, Math.max(20, nM - 8), QUEST ? 6 : 8, 11, 0);
  for (let k = 0; k < 6; k++) {
    const g = k / 6 * 6.2831853, c = Math.cos(g), s = Math.sin(g);
    box(V, I, [c * .48, 0, s * .48], [c * .4, 0, s * .4], [0, .016, 0], [-s * .016, 0, c * .016], 0);
    box(V, I, [c * 1.02, s * .02, s * 1.02], [c * .07, 0, s * .07], [-s * .045, .05, c * .045], [-s * .05, 0, c * .05], k % 2 ? 8 : 0);
    if (k % 2 === 0) box(V, I, [c * 1.02, -0.02, s * 1.02], [c * .05, 0, s * .05], [0, .03, 0], [-s * .04, 0, c * .04], 2);
    lamp(V, I, c * 1.12, s * .08, s * 1.12, .018);
  }
  slab(V, I, [[.12, .16, .02], [.95, .42, .03], [.9, .5, .03], [.1, .22, .02]], .006, 10, 0);
  slab(V, I, [[-.12, .16, .02], [-.95, .42, .03], [-.9, .5, .03], [-.1, .22, .02]], .006, 10, 0);
  loft(V, I, [[-.06, .08, .08], [0, .16, .16], [.07, .07, .07]], 10, 8);
  box(V, I, [0, .22, 0], [.008, 0, 0], [0, .16, 0], [0, 0, .008], 0);
  lamp(V, I, 0, .4, 0, .02);
  for (let k = 0; k < 4; k++) {
    const g = k * 1.5708 + .4, c = Math.cos(g), s = Math.sin(g);
    box(V, I, [c * .2, .18, s * .2], [c * .012, 0, s * .012], [0, .05, 0], [-s * .012, 0, c * .012], 0);
    lamp(V, I, c * .2, .24, s * .2, .012);
  }
  return shipOut(V, I);
}
ringMesh = function () { return smoothStation(); };
function v124Must(src, from, to) {
  if (src.indexOf(from) < 0) throw Error('v1.24 shader anchor missing: ' + from.slice(0, 90).replace(/\n/g, '\\n'));
  return src.replace(from, to);
}


function v124Draw(vd, pass) {
  if (pass) return;
  v124Arc(vd);
}
const v122DrawPrev = v122Draw;
v122Draw = function (vd, pass) { v122DrawPrev(vd, pass); v124Draw(vd, pass); };

function v124Arc(vd) {
  if (!mArc || !RV || SYS.atm) return;
  let best = null;
  for (const L of [RV[0], MV[0]]) {
    if (!L || !L.n) continue;
    const D = L.d, N = L.N, C = L.C;
    const w = (v, m) => ((v - m + N * 1.5) % N) - N * .5;
    for (let i = 0; i < L.n; i++) {
      const o = i * 12;
      const x = (w(D[o], L.mx) + D[o + 4]) * C - L.fx;
      const y = (w(D[o + 1], L.my) + D[o + 5]) * C - L.fy;
      const z = (w(D[o + 2], L.mz) + D[o + 6]) * C - L.fz;
      const sc = D[o + 3], horiz = Math.hypot(x, z), tube = Math.hypot(horiz - sc, y);
      if (sc > 120 && tube < Math.min(1600, sc * .42) && (!best || tube < best.tube)) best = { x, y, z, sc, sd: D[o + 7], tube };
    }
  }
  DArc.n = 0;
  if (!best) return;
  const g = tm * .02 + best.sd * 5, cs = Math.cos(g), sn = Math.sin(g);
  const lx = (-best.x * cs - best.z * sn) / best.sc, lz = (best.x * sn - best.z * cs) / best.sc;
  const ang = Math.atan2(lz, lx);
  const span = Math.max(.4, Math.min(2.4, 3400 / best.sc));
  const arcLen = 2 * span * best.sc;
  const nM = Math.max(28, Math.min(QUEST ? 72 : 120, arcLen / 22 | 0));
  const nT = QUEST ? 12 : 16;
  const key = ang.toFixed(2) + ':' + span.toFixed(2) + ':' + nM + ':' + (best.sc | 0);
  if (key !== mArc.key) {
    const V = [], I = [], a0 = ang - span, a1 = ang + span, s0 = 0;
    for (let j = 0; j <= nT; j++) {
      const v = j / nT * 6.2831853, cv = Math.cos(v), sv = Math.sin(v);
      for (let i = 0; i <= nM; i++) {
        const u = a0 + (a1 - a0) * (i / nM), cu = Math.cos(u), su = Math.sin(u), rr = 1 + .058 * cv;
        V.push(rr * cu, .058 * sv, rr * su, cv * cu, sv, cv * su, 0, 0);
      }
    }
    const stride = nM + 1;
    for (let j = 0; j < nT; j++) for (let i = 0; i < nM; i++) {
      const a = s0 + j * stride + i, b = a + stride;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mArc.vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(V), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mArc.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(I), gl.DYNAMIC_DRAW);
    mArc.n = I.length; mArc.key = key;
  }
  put(DArc, best.x, best.y, best.z, best.sc, 0, 0, 0, best.sd, 0, 0, 0, 0);
  flush(DArc);
  gl.useProgram(P_SHIP.p);
  if (P_SHIP.u.uVd) gl.uniform1f(P_SHIP.u.uVd, vd);
  gl.uniform1i(P_SHIP.u.uShip, 6);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(-2, -2);
  draw(P_SHIP, DArc, mArc);
  gl.disable(gl.POLYGON_OFFSET_FILL);
}

function v124Shaders() {
  let rock = ROCK_F;
  rock = v124Must(rock, `else if(big>.5&&ap.y<.6){vec2 wg=q/(ps*.22),wi=floor(wg),wf=fract(wg);
   em=mix(vec3(1.,.8,.5),vec3(.6,.8,1.),step(.6,hh(wi+3.)))*step(.88,hh(wi*vec2(1.,.37)))*step(.45,hh(vec2(wi.y,7.)))*step(.25,wf.x)*step(wf.x,.75)*step(.3,wf.y)*step(wf.y,.7)*2.2;}
  if(big>.5){
   float dq=length(vP),det=1.-smoothstep(900.,4200.,dq);
   vec3 wp=q3;
   float nA=texture(uNz,wp*.0045).r,nB=texture(uNz,wp*.02).g;
   vec3 cell=abs(fract(wp*vec3(.035,.028,.02))-.5);
   float seam=smoothstep(.42,.49,max(cell.x,max(cell.y,cell.z)));
   float fine=smoothstep(.455,.49,max(abs(fract(wp.x*.11)-.5),abs(fract(wp.z*.09)-.5)));
   alb=mix(alb,alb*vec3(.55,.42,.32),smoothstep(.58,.86,nA)*.55);
   alb=mix(alb,vec3(.02,.022,.028),seam*(.45+.35*det));
   alb*=mix(1.,.62,fine*det);
   float win=step(.62,nB)*step(.28,fract(wp.y*.015+nA))*step(.22,fract(wp.x*.012));
   em+=mix(vec3(1.,.78,.45),vec3(.45,.7,1.),step(.55,nA))*win*(.35+.9*det)*(.65+.35*step(.15,fract(TIME*.04+nA*6.)));
   vec3 tn=normalize(cross(N,vec3(.21,1.,.07)));
   N=normalize(N+tn*(nA-.5)*det*.55+cross(N,tn)*(nB-.5)*det*.35);
   sp=mix(sp,.22+.85*nB,.5);gs=mix(gs,16.+80.*nB,.45);
   float stripe=step(.92,fract(wp.y*.008+wp.x*.001));
   alb=mix(alb,vec3(.55,.32,.05),stripe*.35);em+=vec3(1.,.45,.05)*stripe*.15;
  }`, `float dq=length(vP),reach=big>.5?4200.:520.;
  float det=1.-smoothstep(reach*.22,reach,dq);
  vec3 wp=q3;float nA=texture(uNz,wp*(big>.5?.0045:.02)).r,nB=texture(uNz,wp*(big>.5?.018:.06)).g,nC=texture(uNz,wp.yzx*(big>.5?.009:.03)).b;
  vec3 tn=normalize(cross(N,vec3(.21,1.,.07)));
  N=normalize(N+tn*(nA-.5)*det*(mid>6.5?.85:.55)+cross(N,tn)*(nB-.5)*det*.4);
  bool org=mid>6.5&&mid<7.5;
  if(org){
   float vein=pow(abs(sin(wp.x*.05+nA*6.+TIME*.35)),18.)+pow(abs(sin(wp.z*.04-nB*5.)),14.);
   em+=mix(vec3(.15,.85,.55),vec3(.55,.2,.75),nC)*vein*1.6*(.6+.4*sin(TIME*1.2+nA*8.));
   alb=mix(alb,vec3(.03,.015,.02),smoothstep(.62,.9,nA)*.45);
   sp=mix(sp,1.15,.6);gs=mix(gs,28.,.5);
   float pore=smoothstep(.72,.9,nB);alb=mix(alb,alb*.35,pore*.5);em+=vec3(.2,.9,.7)*pore*.25;
  }else{
   vec3 cell=abs(fract(wp*vec3(.04,.03,.025)*(big>.5?1.:4.))-.5);
   float seam=smoothstep(.4,.49,max(cell.x,max(cell.y,cell.z)));
   float fine=smoothstep(.46,.495,max(abs(fract(wp.x*(big>.5?.1:.4))-.5),abs(fract(wp.z*(big>.5?.08:.35))-.5)));
   alb=mix(alb,alb*vec3(.5,.4,.32),smoothstep(.55,.88,nA)*.6);
   float streak=smoothstep(.58,.9,texture(uNz,vec3(wp.x*.0015,wp.y*.02,wp.z*.0015)).r);
   alb=mix(alb,alb*vec3(.42,.4,.38),streak*.4);
   alb=mix(alb,vec3(.015,.016,.02),seam*(.55+.35*det));
   alb*=mix(1.,.6,fine*det);
   vec2 wg=wp.xz*vec2(big>.5?.035:.12,big>.5?.012:.05);
   float win=step(.58,fract(wg.x))*step(.22,fract(wg.y))*step(fract(wg.y),.74)*step(.6,nB);
   float bay=step(.92,nA)*step(.4,fract(wp.y*(big>.5?.004:.02)))*step(.15,fract(wp.x*(big>.5?.003:.015)));
   em+=mix(vec3(1.,.8,.5),vec3(.45,.7,1.),step(.5,nC))*win*det*(1.1+.5*step(.18,fract(TIME*.05+nA*7.)));
   em+=vec3(1.,.55,.2)*bay*1.4;
   float hz=step(.78,fract(wp.y*(big>.5?.01:.04)+abs(wp.x)*.15));
   float chev=step(.45,fract(wp.z*(big>.5?.02:.08)+wp.x*.4));
   alb=mix(alb,vec3(.75,.5,.08),hz*chev*det*.7);
   em+=vec3(1.,.45,.05)*hz*chev*.12;
   vec2 ant=abs(fract(wp.xy*vec3(.008,.02,0).xy)-.5);float mast=step(.96,nC)*step(.47,ant.x)*step(ant.x,.5);
   em+=vec3(.6,.85,1.)*mast*.8;
   sp=mix(sp,.25+.8*nB,.55);gs=mix(gs,18.+70.*nB,.4);
   if(big>.5&&ap.y<.6){vec2 g2=q/(ps*.22),wi=floor(g2),wf=fract(g2);
    em+=mix(vec3(1.,.8,.5),vec3(.6,.8,1.),step(.6,hh(wi+3.)))*step(.88,hh(wi*vec2(1.,.37)))*step(.45,hh(vec2(wi.y,7.)))*step(.25,wf.x)*step(wf.x,.75)*step(.3,wf.y)*step(wf.y,.7)*1.6*det;}
  }`);
  rock = v124Must(rock, 'col+=fr*fr*fr*neb(N,6.)*.85*rim+uSunC.rgb*pow(fr,2.2)*.22*rim+em', 'col+=fr*fr*fr*neb(N,6.)*.95*rim+uSunC.rgb*pow(fr,2.2)*.48*rim+em');
  const shipP = prog(SHIP_V, rock);
  P_SHIP.p = shipP.p; P_SHIP.u = shipP.u;
  gl.useProgram(P_SHIP.p); gl.uniform3fv(P_SHIP.u['uTier[0]'], TCOL); gl.uniform1i(P_SHIP.u.uKind, 4); gl.uniform1f(P_SHIP.u.uFlat, 0);

  let sky = SKY_F;
  sky = v124Must(sky, 'if(k==0){float freq=6.+5.*fract(abs(P.x)*7.3+P.z*2.1);float bd=.5+.5*sin(n.y*freq+w2*1.6),bd2=.5+.5*sin(n.y*(freq*.42)+1.1+w);s=mix(ca*.62,cb*1.45,smoothstep(.15,.85,bd));s=mix(s,ca*vec3(1.35,.95,.7),smoothstep(.45,.9,bd2)*.7);\n   float sx=n.x*2.1,sy=(n.y-.12)*5.5;s=mix(s,cb*vec3(1.35,.8,.5),exp(-(sx*sx+sy*sy))*1.15);cl=smoothstep(.52,.8,w*.5+w2*.5)*.38;land=0.;}',
    'if(k==0){float freq=7.+6.*fract(abs(P.x)*7.3+P.z*2.1);vec3 nw=n+vec3(tn(n*1.8+3.),tn(n*2.2+9.),tn(n*1.6+1.))*.22;float bd=.5+.5*sin(nw.y*freq+w2*1.8),bd2=.5+.5*sin(nw.y*(freq*.37)+1.4+w);s=mix(ca*.55,cb*1.55,smoothstep(.12,.88,bd));s=mix(s,ca*vec3(1.4,.9,.55),smoothstep(.4,.92,bd2)*.75);float sx=nw.x*2.4,sy=(nw.y-.2)*6.;s=mix(s,cb*vec3(1.2,.7,.45),exp(-(sx*sx+sy*sy))*1.3);vec2 st=vec2(atan(n.z,n.x)+P.x*6.,n.y*5.5);float vr=length(st-vec2(.8,.15));float arm=.5+.5*sin(atan(st.y-.15,st.x-.8)*4.-vr*18.);s=mix(s,cb*vec3(1.35,.8,.5),exp(-vr*vr*8.)*(.45+.55*arm));cl=smoothstep(.48,.78,w*.45+w2*.55)*.28;land=0.;}');
  sky = v124Must(sky, 's*=.93+.07*w3;', 's=mix(vec3(dot(s,vec3(.3,.5,.2))),s,1.22);s*=.94+.06*w3;if(k!=1&&k!=7){vec3 cw=n+vec3(tn(n*2.+5.),tn(n*2.3+11.),tn(n*1.8+2.))*.32;float cA=smoothstep(.52,.84,tn(cw*1.3)),cB=smoothstep(.52,.84,tn((cw+L*.07)*1.3));s=mix(s,mix(vec3(.94,.96,.98),ca,.22),cA*(k==0?.4:.82));s*=1.-clamp(cB-cA,0.,1.)*(k==3?.35:.5);}');
  sky = v124Must(sky, 'col+=atm*rim*pow(max(dot(d,Ls0),0.),4.)*1.15;', 'col+=atm*rim*pow(max(dot(d,Ls0),0.),4.)*1.35;{float ray=pow(1.-mu,2.5);vec3 rayC=mix(vec3(.18,.38,1.),vec3(1.,.52,.25),pow(max(dot(d,Ls0),0.),2.2));col+=rayC*ray*(.2+.95*max(nl,0.))*1.25+uSunC.rgb*pow(max(dot(d,Ls0),0.),7.)*ray*.5;}if(k==3){vec3 Rv=reflect(-L,n);col+=uSunC.rgb*pow(max(dot(Rv,-d),0.),48.)*(1.-land)*lit*(1.4+.8*w3);}if((k==2||k==3||k==5)&&nl<.08){float ct=step(.74,tn(n*22.))*step(.58,tn(n*6.5+2.));col+=mix(vec3(1.,.74,.38),vec3(.5,.72,1.),tn(n*3.))*ct*smoothstep(.2,-.5,nl)*2.6;}');
  sky = v124Must(sky, 'c=vec4(atm*a*1.25,min(.8,a));', 'c=vec4(mix(atm,vec3(.4,.62,1.),.4)*a*1.55+vec3(1.,.62,.32)*pow(max(dot(d,Ls0),0.),5.)*a*.8,min(.88,a*1.2));');
  sky = v124Must(sky, 'vec3 scol=hc<.14?vec3(1.,.35,.2):hc<.5?vec3(.55,.72,1.):vec3(1.,.95,.9);', 'float Tk=mix(2800.,18000.,pow(hc,1.15));vec3 scol=mix(vec3(1.,.42,.16),mix(vec3(1.,.9,.7),vec3(.55,.7,1.),smoothstep(5200.,11000.,Tk)),smoothstep(3000.,5600.,Tk));');
  const skyP = prog(TRI_V, sky);
  P_SKY.p = skyP.p; P_SKY.u = skyP.u;

  let bake = v124Must(BAKE_F, 'vec3 w=(vec3(fbm(d*2.+3.),fbm(d*2.+11.),fbm(d*2.+19.))-.5)*(0.55+uSty.w*1.35);', 'vec3 w=(vec3(fbm(d*2.+3.),fbm(d*2.+11.),fbm(d*2.+19.))-.5)*(0.55+uSty.w*1.35);w+=(vec3(n3(d*2.6+w*1.7+uSeed),n3(d*2.4+w.yzx*1.8+uSeed.yxy+4.),n3(d*2.1+w.zxy+uSeed.z+9.))-.5)*(0.7+uSty.y*1.4);');
  if (NEB) { const nb = prog(TRI_V, bake); NEB.p = nb; }

}
function v124Hooks() {
  try { v124Shaders(); if (NEB && SYS) bakeNebula(SYS.seed); }
  catch (e) { console.error('v124 shader', e); }
  const E = window.ES;
  E.budget = () => ({ questVerts: IE_BUDGET.questVerts, questDraws: IE_BUDGET.questDraws, quest: QUEST, lv: LV, perf: E.perf() });
}
