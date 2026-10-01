(() => {
"use strict";

/* ---------- DOM ---------- */
const $ = s => document.querySelector(s);
const ui = {
  layer: $("#trains"), status: $("#status"), dot: $("#dot"), bar: $("#spawnBar"),
  score: $("#score"), best: $("#best"), level: $("#level"), handled: $("#handled"),
  start: $("#start"), pause: $("#pause"), sound: $("#sound"),
  modal: $("#modal"), mTitle: $("#mTitle"), mEyebrow: $("#mEyebrow"),
  reason: $("#reason"), final: $("#final"), again: $("#again"),
};
const switches = [...document.querySelectorAll(".switch")];
const platBoxes = [...document.querySelectorAll(".platform")];
const platCounts = platBoxes.map(p => p.querySelector("b"));

/* ---------- Constants ---------- */
const CX = [.125, .375, .625, .875];   // lane centres (fraction of map width)
const JUNCTION_Y = .5, START_Y = 1.06, PLATFORM_Y = .16;
const DEPART_MS = 1000, WIN_AT = 40;
const KEYS = { w: 0, ArrowUp: 0, a: 1, ArrowLeft: 1, s: 2, ArrowDown: 2, d: 3, ArrowRight: 3 };
// All timings are in "game clock" ms, which only advances while running.
const difficulty = lvl => ({
  approach: Math.max(4200, 9000 - (lvl - 1) * 600),
  cross: Math.max(650, 1100 - (lvl - 1) * 60),
  interval: Math.max(1400, 2600 - (lvl - 1) * 200),
});

/* ---------- Storage / audio (both fail safe) ---------- */
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const sfx = {
  on: store.get("metroSound") !== "0", ctx: null,
  play(freq, dur = .07) {
    if (!this.on) return;
    try {
      const c = this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (c.state === "suspended") c.resume();
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.frequency.value = freq;
      g.gain.setValueAtTime(.035, t);
      g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur);
    } catch { /* audio unavailable */ }
  },
};

/* ---------- State ---------- */
// state: idle | running | paused | over | won
const G = { state: "idle", clock: 0, last: 0, raf: 0, score: 0, handled: 0, level: 1,
  best: +store.get("metroBest") || 0, active: 0, trains: [], next: null,
  lastSpawn: 0, lastArrival: -1e9, delivered: [0, 0, 0, 0] };

/* ---------- Rendering helpers ---------- */
function renderHud() {
  ui.score.textContent = G.score; ui.best.textContent = G.best;
  ui.level.textContent = G.level; ui.handled.textContent = G.handled;
  platCounts.forEach((el, i) => el.textContent = G.delivered[i]);
}
function renderControls() {
  const msg = {
    idle: ["Ready for service", ""], running: ["Route each train to its platform", "on"],
    paused: ["Service paused", "warn"], over: ["Service ended", "off"], won: ["Line cleared", "on"],
  }[G.state];
  ui.status.textContent = msg[0]; ui.dot.className = msg[1];
  ui.start.textContent = G.state === "idle" ? "START SERVICE" : "RESTART";
  ui.pause.disabled = G.state !== "running" && G.state !== "paused";
  ui.pause.textContent = G.state === "paused" ? "RESUME" : "PAUSE";
}
function place(t, x, y) { t.el.style.left = x * 100 + "%"; t.el.style.top = y * 100 + "%"; }
const lerp = (a, b, p) => a + (b - a) * p;

function markNext() {
  const n = G.trains.find(t => t.phase === "approach") || null;
  if (n === G.next) return;
  G.next?.el.classList.remove("next");
  platBoxes.forEach(p => p.classList.remove("target"));
  G.next = n;
  if (n) { n.el.classList.add("next"); platBoxes[n.target].classList.add("target"); }
}

/* ---------- Game logic ---------- */
function setSwitch(i) {
  G.active = i;
  switches.forEach((b, k) => { b.classList.toggle("active", k === i); b.setAttribute("aria-pressed", k === i); });
  sfx.play(400 + (i + 1) * 80, .06);
}

function trySpawn() {
  const d = difficulty(G.level), arrive = G.clock + d.approach;
  // Arrivals are scheduled at least one crossing apart, so a perfect player can never be forced to crash.
  if (arrive < G.lastArrival + d.cross + 350) return false;
  // Don't stack trains on top of each other in one lane.
  const free = [0, 1, 2, 3].filter(i => !G.trains.some(t => t.entry === i && t.phase === "approach" && (G.clock - t.t0) / t.approach < .3));
  if (!free.length) return false;
  const el = document.createElement("div"), target = Math.floor(Math.random() * 4);
  const t = { el, entry: free[Math.floor(Math.random() * free.length)], target, phase: "approach", t0: G.clock, approach: d.approach, cross: d.cross, t1: 0 };
  el.className = "train"; el.textContent = "P" + (target + 1);
  place(t, CX[t.entry], START_Y);
  ui.layer.appendChild(el);
  G.trains.push(t);
  G.lastSpawn = G.clock; G.lastArrival = arrive;
  return true;
}

function deliver(t) {
  G.trains.splice(G.trains.indexOf(t), 1); t.el.remove();
  G.handled++; G.delivered[t.target]++;
  G.score += 100 + G.level * 20;
  G.level = 1 + Math.floor(G.handled / 5);
  if (G.score > G.best) { G.best = G.score; store.set("metroBest", G.best); }
  sfx.play(780, .08);
  renderHud();
  if (G.handled >= WIN_AT) finish("won", `All ${WIN_AT} trains delivered. Perfect shift.`);
}

function finish(kind, msg, culprit) {
  G.state = kind; stopLoop();
  culprit?.el.classList.add("bad");
  ui.mEyebrow.textContent = kind === "won" ? "SHIFT COMPLETE" : "SERVICE ENDED";
  ui.mTitle.textContent = kind === "won" ? "Victory!" : "Game Over";
  ui.reason.textContent = msg; ui.final.textContent = G.score;
  ui.modal.classList.remove("hidden");
  sfx.play(kind === "won" ? 990 : 140, kind === "won" ? .3 : .25);
  renderControls(); renderHud();
  ui.again.focus();
}

function step() {
  for (const t of G.trains.slice()) {
    if (t.phase === "approach") {
      const p = (G.clock - t.t0) / t.approach;
      if (p < 1) { place(t, CX[t.entry], lerp(START_Y, JUNCTION_Y, p)); continue; }
      if (G.trains.some(o => o.phase === "cross")) return finish("over", "Two trains collided at the junction.", t);
      if (G.active !== t.target) return finish("over", `Train P${t.target + 1} reached the junction on the wrong track.`, t);
      t.phase = "cross"; t.t1 = G.clock; markNext();
    }
    if (t.phase === "cross") {
      const p = (G.clock - t.t1) / t.cross;
      if (p < 1) { place(t, lerp(CX[t.entry], CX[t.target], p), JUNCTION_Y); continue; }
      t.phase = "depart"; t.t2 = G.clock;
    }
    const p = Math.min(1, (G.clock - t.t2) / DEPART_MS);
    place(t, CX[t.target], lerp(JUNCTION_Y, PLATFORM_Y, p));
    if (p >= 1) { deliver(t); if (G.state === "won") return; }
  }
}

function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(50, now - (G.last || now)); G.last = now;
  G.clock += dt;
  const d = difficulty(G.level);
  if (G.clock - G.lastSpawn >= d.interval) trySpawn();
  markNext();
  step();
  if (G.state === "running") ui.bar.style.transform = `scaleX(${Math.max(0, 1 - (G.clock - G.lastSpawn) / d.interval)})`;
}

/* ---------- Loop / state control (exactly one rAF loop at any time) ---------- */
function startLoop() { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(tick); } }
function stopLoop() { cancelAnimationFrame(G.raf); G.raf = 0; }

function start() {
  stopLoop();
  G.trains.forEach(t => t.el.remove());
  Object.assign(G, { trains: [], next: null, clock: 0, score: 0, handled: 0, level: 1,
    lastSpawn: 0, lastArrival: -1e9, delivered: [0, 0, 0, 0], state: "running" });
  platBoxes.forEach(p => p.classList.remove("target"));
  ui.modal.classList.add("hidden");
  ui.bar.style.transform = "scaleX(0)";
  setSwitch(0); renderHud(); renderControls();
  trySpawn();            // first train arrives straight away
  startLoop();
}
function togglePause() {
  if (G.state === "running") { G.state = "paused"; stopLoop(); }
  else if (G.state === "paused") { G.state = "running"; startLoop(); }
  else return;
  renderControls();
}
const primary = () => (G.state === "running" || G.state === "paused") ? togglePause() : start();

/* ---------- Input (all listeners registered once) ---------- */
document.addEventListener("keydown", e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k in KEYS) { e.preventDefault(); setSwitch(KEYS[k]); }
  else if ((k === " " || k === "Enter") && !e.target.closest?.("button")) { e.preventDefault(); primary(); }
  else if (k === "p" || k === "Escape") togglePause();
});
switches.forEach((b, i) => b.addEventListener("click", () => setSwitch(i)));
ui.start.addEventListener("click", start);
ui.again.addEventListener("click", start);
ui.pause.addEventListener("click", togglePause);
ui.sound.addEventListener("click", () => {
  sfx.on = !sfx.on; store.set("metroSound", sfx.on ? "1" : "0");
  ui.sound.textContent = sfx.on ? "🔊 SOUND" : "🔇 MUTED"; sfx.play(600);
});
// Mouse/touch clicks shouldn't leave focus on a button, or Space would re-trigger it.
document.addEventListener("click", e => { if (e.detail > 0) e.target.closest?.("button")?.blur(); });
// Auto-pause when the tab is hidden.
document.addEventListener("visibilitychange", () => { if (document.hidden && G.state === "running") togglePause(); });

/* ---------- Init ---------- */
ui.sound.textContent = sfx.on ? "🔊 SOUND" : "🔇 MUTED";
setSwitch(0); renderHud(); renderControls();
})();
