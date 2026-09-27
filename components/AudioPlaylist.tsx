"use client";
import{createElement as h,useCallback as uC,useEffect as uE,useMemo as uM,useRef as uR,useState as uS}from"react";
import{Pause,Play,Shuffle,SkipBack,SkipForward,Volume2,VolumeX}from"lucide-react";
export type PlaylistTrack={title:string;src:string;note?:string};
type P={tracks:PlaylistTrack[];heading?:string};
type Ph="idle"|"trying"|"playing"|"muted"|"blocked";
function fmt(sec:number){if(!Number.isFinite(sec)||!(sec>=0))return"0:00";const m=Math.floor(sec/60),s=Math.floor(sec%60);return`${m}:${s.toString().padStart(2,"0")}`;}
function shuf(n:number,prefer?:number){const o=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[o[i],o[j]]=[o[j],o[i]];}if(prefer!==undefined&&n>1){const at=o.indexOf(prefer);if(at>0){o.splice(at,1);o.unshift(prefer);}}return o;}
export function AudioPlaylist({tracks,heading="Demo playlist"}:P){
const aR=uR(null as HTMLAudioElement|null),tried=uR(false);
const[index,setIndex]=uS(0),[playing,setPlaying]=uS(false),[t,setT]=uS(0),[dur,setDur]=uS(0);
const[vol,setVol]=uS(0.85),[muted,setMuted]=uS(false),[shuffle,setShuffle]=uS(true);
const[order,setOrder]=uS(()=>tracks.length?shuf(tracks.length,0):([] as number[]));
const[phase,setPhase]=uS("idle" as Ph);
const track=tracks[index];
const oI=uM(()=>{const at=order.indexOf(index);return at>=0?at:0;},[index,order]);
const rebuild=uC((cur:number,on:boolean)=>{if(!tracks.length)return setOrder([]);setOrder(on?shuf(tracks.length,cur):Array.from({length:tracks.length},(_,i)=>i));},[tracks.length]);
uE(()=>{rebuild(0,true);},[tracks,rebuild]);
const playIndex=uC(async(next:number,opts?:{muted?:boolean})=>{const a=aR.current;if(!a||!tracks[next])return false;setIndex(next);a.src=tracks[next].src;if(opts?.muted!==undefined){a.muted=opts.muted;setMuted(opts.muted);}try{await a.play();setPlaying(true);return true;}catch{setPlaying(false);return false;}},[tracks]);
const unlock=uC(async()=>{const a=aR.current;if(!a||!track)return;a.muted=false;setMuted(false);a.volume=vol;if(!a.src||!a.src.includes(track.src))a.src=track.src;try{await a.play();setPlaying(true);setPhase("playing");}catch{setPlaying(false);setPhase("blocked");}},[track,vol]);
const toggle=uC(async()=>{const a=aR.current;if(!a||!track)return;if(playing){a.pause();setPlaying(false);return;}await unlock();},[playing,track,unlock]);
const step=uC((d:number)=>{if(!tracks.length||!order.length)return;void playIndex(order[(oI+d+order.length)%order.length]!);},[order,oI,playIndex,tracks.length]);
uE(()=>{const a=aR.current;if(!a)return;a.volume=vol;a.muted=muted;},[vol,muted]);
uE(()=>{if(!tracks.length||tried.current)return;tried.current=true;let cancel=false;(async()=>{setPhase("trying");const a=aR.current;if(!a||!tracks[0])return;a.src=tracks[0].src;a.volume=vol;a.muted=false;setMuted(false);setIndex(0);try{await a.play();if(!cancel){setPlaying(true);setPhase("playing");}return;}catch{}try{a.muted=true;setMuted(true);await a.play();if(!cancel){setPlaying(true);setPhase("muted");}}catch{if(!cancel){setPlaying(false);setMuted(false);a.muted=false;setPhase("blocked");}}})();return()=>{cancel=true;};},[tracks]);
uE(()=>{const a=aR.current;if(!a)return;const onTime=()=>setT(a.currentTime);const onMeta=()=>setDur(a.duration||0);const onEnded=()=>{if(!order.length){setPlaying(false);setT(0);return;}const np=oI+1;if(order.length>np)void playIndex(order[np]!);else if(shuffle){const f=shuf(tracks.length);setOrder(f);void playIndex(f[0]!);}else{setPlaying(false);setT(0);}};const onPause=()=>setPlaying(false);const onPlay=()=>setPlaying(true);a.addEventListener("timeupdate",onTime);a.addEventListener("loadedmetadata",onMeta);a.addEventListener("ended",onEnded);a.addEventListener("pause",onPause);a.addEventListener("play",onPlay);return()=>{a.removeEventListener("timeupdate",onTime);a.removeEventListener("loadedmetadata",onMeta);a.removeEventListener("ended",onEnded);a.removeEventListener("pause",onPause);a.removeEventListener("play",onPlay);};},[order,oI,playIndex,shuffle,tracks.length]);
if(!tracks.length||!track)return null;
const prog=dur>0?Math.min(100,(t/dur)*100):0;const showTap=phase==="muted"||phase==="blocked";
const btn="rounded-xl border border-border p-2 text-zinc-200 transition hover:border-accent/50";
const items=tracks.map((e,i)=>{const active=i===index;return h("li",{key:e.src},h("button",{type:"button",onClick:()=>{void playIndex(i,{muted:false}).then(ok=>{if(ok)setPhase("playing");});},className:"flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition "+(active?"border-accent/50 bg-accent/10 text-accent":"border-border text-zinc-300 hover:border-accent/40")},h("span",{className:"font-medium"},`${i+1}. ${e.title}`),e.note?h("span",{className:"shrink-0 text-xs text-zinc-500"},e.note):null));});
return h("section",{className:"card-surface neon-border mb-10 rounded-2xl p-5 md:p-6","aria-label":heading},
h("div",{className:"mb-4 flex flex-wrap items-end justify-between gap-3"},h("div",null,h("p",{className:"mb-1 font-mono text-xs text-accent"},heading),h("h2",{className:"text-xl font-semibold"},track.title),track.note?h("p",{className:"mt-1 text-sm text-zinc-400"},track.note):null),h("p",{className:"font-mono text-xs text-zinc-500"},`${fmt(t)} / ${fmt(dur)}`)),
showTap?h("button",{type:"button",onClick:()=>void unlock(),className:"mb-4 w-full rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-left text-sm text-accent transition hover:bg-accent/15"},phase==="muted"?"Playing muted — tap to unmute":"Tap to play — browser blocked autoplay"):null,
h("audio",{ref:aR,preload:"metadata",className:"hidden",playsInline:true}),
h("div",{className:"mb-4 h-1.5 overflow-hidden rounded-full bg-border"},h("div",{className:"h-full rounded-full bg-accent transition-[width]",style:{width:`${prog}%`}})),
h("div",{className:"mb-4 flex flex-wrap items-center gap-3"},
h("button",{type:"button",onClick:()=>step(-1),className:btn,"aria-label":"Previous track"},h(SkipBack,{className:"h-5 w-5"})),
h("button",{type:"button",onClick:()=>void toggle(),className:"rounded-xl bg-accent px-4 py-2 font-semibold text-black transition hover:opacity-90","aria-label":playing?"Pause":"Play"},h("span",{className:"inline-flex items-center gap-2"},playing?h(Pause,{className:"h-5 w-5"}):h(Play,{className:"h-5 w-5"}),playing?"Pause":"Play")),
h("button",{type:"button",onClick:()=>step(1),className:btn,"aria-label":"Next track"},h(SkipForward,{className:"h-5 w-5"})),
h("button",{type:"button",onClick:()=>setShuffle(prev=>{const n=!prev;rebuild(index,n);return n;}),className:"rounded-xl border p-2 transition "+(shuffle?"border-accent/50 bg-accent/10 text-accent":"border-border text-zinc-200 hover:border-accent/50"),"aria-label":shuffle?"Shuffle on":"Shuffle off","aria-pressed":shuffle,title:shuffle?"Shuffle on (default)":"Shuffle off"},h(Shuffle,{className:"h-5 w-5"})),
h("div",{className:"ml-auto flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-xs"},
h("button",{type:"button",onClick:()=>setMuted(m=>!m),className:btn,"aria-label":muted||vol===0?"Unmute":"Mute"},muted||vol===0?h(VolumeX,{className:"h-5 w-5"}):h(Volume2,{className:"h-5 w-5"})),
h("label",{className:"sr-only",htmlFor:"playlist-volume"},"Volume"),
h("input",{id:"playlist-volume",type:"range",min:0,max:1,step:0.01,value:muted?0:vol,onChange:(e:{target:{value:string}})=>{const n=Number(e.target.value);setVol(n);if(n>0&&muted)setMuted(false);if(phase==="muted"&&n>0)void unlock();},className:"h-1.5 w-full cursor-pointer accent-[var(--accent,#22d3ee)]","aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":Math.round((muted?0:vol)*100)}))),
h("ol",{className:"space-y-2"},items));
}
