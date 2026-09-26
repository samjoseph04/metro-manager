const $=s=>document.querySelector(s);
const layer=$("#trains"), map=$("#map"), switches=[...document.querySelectorAll(".switch")];
let running=false,paused=false,score=0,handled=0,level=1,best=+localStorage.getItem("metroBest")||0;
let trains=[],spawn=0,interval=2200,last=0,raf=0,sound=true,audio;

$("#best").textContent=best;

function beep(freq=500,d=.07){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();let o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(audio.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.stop(audio.currentTime+d)}catch(e){}}
function setSwitch(n){switches.forEach((x,i)=>x.classList.toggle("active",i===n-1));active=n;beep(400+n*80,.06)}
let active=1;setSwitch(1);

function hud(){$("#score").textContent=score;$("#best").textContent=best;$("#level").textContent=level;$("#handled").textContent=handled}
const xs=[.13,.35,.57,.79];

function spawnTrain(){
  const target=1+Math.floor(Math.random()*4), entry=1+Math.floor(Math.random()*4);
  const el=document.createElement("div");el.className="train target";el.textContent="P"+target;layer.appendChild(el);
  trains.push({el,target,entry,progress:0,phase:"approach",speed:.000052*(1+level*.11),done:false});
}
function pos(t){
  const r=map.getBoundingClientRect(),w=r.width,h=r.height;
  const x=xs[t.entry-1]*w+30, targetX=xs[t.target-1]*w+30, jy=.5*h;
  let px=x-22,py=h-30;
  if(t.phase==="approach")py=h-30-t.progress*h*.55;
  if(t.phase==="cross"){px=x-22+(targetX-x)*t.progress;py=jy-11}
  if(t.phase==="depart"){px=targetX-22;py=jy-11-t.progress*h*.48}
  t.el.style.transform=`translate(${px}px,${py}px)`
}
function gameOver(msg){
  running=false;cancelAnimationFrame(raf);trains.forEach(t=>t.el.remove());trains=[];
  if(score>best){best=score;localStorage.setItem("metroBest",best)}
  $("#reason").textContent=msg;$("#final").textContent=score;$("#modal").classList.remove("hidden");$("#status").textContent="Service ended";beep(140,.25)
}
function deliver(t){
  score+=100+level*20;handled++;if(score>best){best=score;localStorage.setItem("metroBest",best)}
  t.el.remove();beep(780,.08);hud()
}
function tick(now){
  if(!running)return;raf=requestAnimationFrame(tick);if(!last)last=now;const dt=Math.min(50,now-last);last=now;if(paused)return;
  spawn+=dt;$("#spawnBar").style.transform=`scaleX(${Math.max(0,1-spawn/interval/spawn*spawn)})`;
  if(spawn>=interval){spawn=0;spawnTrain()}
  for(const t of [...trains]){
    if(t.phase==="approach"){t.progress+=dt*t.speed;if(t.progress>=.86){if(active!==t.target){t.el.classList.add("bad");gameOver("A train reached the junction on the wrong track.");return}t.phase="cross";t.progress=0}}
    else if(t.phase==="cross"){t.progress+=dt*.00011*(1+level*.1);if(t.progress>=1){t.phase="depart";t.progress=0}}
    else{t.progress+=dt*t.speed*.85;if(t.progress>=1){trains=trains.filter(x=>x!==t);deliver(t)}}
    if(t.el.isConnected)pos(t)
  }
  const near=trains.filter(t=>t.phase==="approach"&&t.progress>.82);
  if(near.length>1){gameOver("Two trains reached the junction at the same time.");return}
}
function start(){
  $("#modal").classList.add("hidden");trains.forEach(t=>t.el.remove());trains=[];score=0;handled=0;level=1;spawn=0;interval=2200;last=0;running=true;paused=false;setSwitch(1);hud();$("#start").textContent="RESTART";$("#pause").textContent="PAUSE";$("#status").textContent="Route trains to their matching platforms";raf=requestAnimationFrame(tick)
}
function pause(){if(!running)return;paused=!paused;$("#pause").textContent=paused?"RESUME":"PAUSE";$("#status").textContent=paused?"Service paused":"Service running";if(!paused){last=performance.now();raf=requestAnimationFrame(tick)}}

document.addEventListener("keydown",e=>{
 const m={w:1,ArrowUp:1,a:2,ArrowLeft:2,s:3,ArrowDown:3,d:4,ArrowRight:4};let k=e.key.length===1?e.key.toLowerCase():e.key;
 if(m[k]){e.preventDefault();setSwitch(m[k])} else if(e.key===" "){e.preventDefault();running?pause():start()}
});
switches.forEach((b,i)=>b.onclick=()=>setSwitch(i+1));
$("#start").onclick=start;$("#again").onclick=start;$("#pause").onclick=pause;
$("#sound").onclick=()=>{sound=!sound;$("#sound").textContent=sound?"🔊 SOUND":"🔇 MUTED";if(sound)beep()};
setInterval(()=>{if(running&&!paused){level=1+Math.floor(handled/5);interval=Math.max(850,2200-(level-1)*180);hud()}},500);
addEventListener("resize",()=>trains.forEach(pos));
hud();
