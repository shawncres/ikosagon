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

function v124Must(src, from, to) {
  if (src.indexOf(from) < 0) throw Error('v1.24 shader anchor missing: ' + from.slice(0, 90).replace(/\n/g, '\\n'));
  return src.replace(from, to);
}

function v124Shaders() {
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
