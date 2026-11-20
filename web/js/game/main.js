// Game loop: fixed-step physics at 480 Hz, autopilot, input, scene and readouts.
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { newState, step, padHeight, tilt, liftoff, massProps, MOON_G } from './physics.js';
import { createDap, dapUpdate, setMode } from './dap.js';
import { createInput } from './input.js';
import { createScene } from './scene.js';
import { DPS, LEGS, GEAR, JETS } from './lm.js';
import { qrot } from './vec.js';

const DT = 1 / 480;
const DEG = 180 / Math.PI;
const $ = id => document.getElementById(id);

const meta = await (await fetch('assets/terrain.json')).json();
const view = await createScene($('view'), meta);
const input = createInput(document.body);

let s, dap, paused = false, acc = 0, last = performance.now(), shownEvents = 0, shownPhase = '';
function restart() {
  s = newState();
  dap = createDap();
  setMode(dap, s, 'P66');
  input.setMode('P66');
  input.reset();
  view.snapCamera();
  $('msg').hidden = true; $('log').innerHTML = ''; shownEvents = 0; shownPhase = '';
}
restart();

input.on('r', restart);
input.on('p', () => { paused = !paused; });
input.on('space', () => { if (s.stage === 'full') s.engStop = !s.engStop; else if (s.phase === 'ascent') s.apsOn = !s.apsOn; });
input.on('enter', doLiftoff);
input.on('m', () => {
  const m = dap.mode === 'P66' ? 'MANUAL' : 'P66';
  if (m === 'MANUAL') input.setThrottle(Math.max(0, Math.min(1, (s.throttle - DPS.minFrac) / 0.6)));
  setMode(dap, s, m); input.setMode(m);
});
function doLiftoff() { if (liftoff(s)) { dap.hold = null; $('msg').hidden = true; shownPhase = s.phase; } }
$('btn-mode').addEventListener('click', () => dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })));
$('btn-lift').addEventListener('click', doLiftoff);
$('btn-again').addEventListener('click', restart);
$('btn-stop').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// debugging from the console: game.set({ vel: [0, -2, 0] }), game.paused = true
window.game = {
  get s() { return s; }, get dap() { return dap; },
  set(o) { Object.assign(s, o); view.snapCamera(); },
  get paused() { return paused; }, set paused(v) { paused = v; },
};

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const inp = input.read(dt);
  if (!paused) {
    acc += dt;
    let clicks = inp.rodClicks;
    while (acc >= DT) {
      // crew keeps the cross-range drift near zero with small RCS translations (body Y is world z)
      const yW = qrot(s.q, [0, 1, 0])[2];
      const vz = s.vel[2];
      const ty = Math.abs(vz) > 0.05 && Math.abs(yW) > 0.5 ? -Math.sign(vz * yW) : 0;
      const c = dapUpdate(dap, s, { ...inp, ty, rodClicks: clicks }, DT);
      clicks = 0;
      step(s, c, DT);
      acc -= DT;
    }
  }
  const h = Math.max(0, padHeight(s));
  view.update(s, h, dt);
  hud(s, h, inp);
  requestAnimationFrame(frame);
}

function hud(s, h, inp) {
  const lean = Math.asin(Math.max(-1, Math.min(1, qrot(s.q, [1, 0, 0])[0]))) * DEG;
  $('alt').textContent = h.toFixed(h < 100 ? 1 : 0);
  $('vs').textContent = s.vel[1].toFixed(1);
  $('hs').textContent = s.vel[0].toFixed(1);
  $('lean').textContent = lean.toFixed(0);
  const thrPct = s.stage === 'full' ? s.throttle * 100 : (s.apsOn && s.apsFuel > 0 ? 100 : 0);
  $('thr').textContent = thrPct.toFixed(0);
  $('thr-cmd').style.height = Math.min(100, thrPct) + '%';
  $('mode').textContent = s.stage === 'ascent' ? 'ASCENT' : dap.mode === 'P66' ? `P66 ${(dap.rod ?? 0).toFixed(1)}` : 'MANUAL';
  $('dps').textContent = s.stage === 'full' ? s.dpsFuel.toFixed(0) : s.apsFuel.toFixed(0);
  $('dps-l').textContent = s.stage === 'full' ? 'DPS' : 'APS';
  $('rcs').textContent = s.rcsFuel.toFixed(0);
  $('dist').textContent = s.pos[0].toFixed(0);
  $('met').textContent = s.t.toFixed(1);
  $('g').textContent = s.gNow.toFixed(1);
  $('contact').classList.toggle('on', s.contactLight);
  $('engstop').classList.toggle('on', s.stage === 'full' && s.engStop);
  const hoverKgS = massProps(s).m * MOON_G / DPS.vex;
  const secs = s.dpsFuel / hoverKgS;
  $('bingo').textContent = s.stage !== 'full' ? '' : s.dpsFuel <= 0 ? 'NO DESCENT PROPELLANT' : secs < 30 ? '30 SECONDS' : secs < 60 ? '60 SECONDS' : '';
  $('prompt').textContent = s.phase === 'flying' && s.contactLight && !s.engStop && s.stage === 'full' ? 'CONTACT — ENGINE STOP: SPACE' : '';

  // 16 jet lights by quad, leg strokes
  for (let n = 1; n <= 16; n++) {
    const el = $('j' + n);
    el.className = s.failedJets.has(n) ? 'dead' : s.jetsOn[n] ? 'on' : '';
  }
  const legs = s.stage === 'full' ? s.legs : s.descentPose.legs;
  legs.forEach((l, i) => {
    const el = $('leg' + i);
    el.style.width = (l.c / GEAR.stroke * 100) + '%';
    el.parentElement.className = 'leg' + (l.broken ? ' dead' : l.bottomed ? ' warn' : l.contact ? ' touch' : '');
  });

  for (; shownEvents < s.events.length; shownEvents++) {
    const e = s.events[shownEvents];
    const li = document.createElement('div');
    li.className = 'sev' + e.sev;
    li.textContent = `${e.t.toFixed(1).padStart(6)}  ${e.text}`;
    $('log').prepend(li);
    while ($('log').children.length > 6) $('log').lastChild.remove();
  }

  if (s.report && shownPhase !== s.phase) {
    shownPhase = s.phase;
    const r = s.report;
    $('msg-title').textContent = r.verdict;
    $('msg-title').className = 'sev' + (s.phase === 'climbing' ? 0 : r.worst);
    $('msg-body').innerHTML = r.lines.map(l => `<li class="sev${l.sev}">${l.text}</li>`).join('');
    $('btn-lift').hidden = !r.canLift || s.phase !== 'down';
    $('lift-note').textContent = r.canLift && s.phase === 'down'
      ? (r.worst >= 2 ? 'Liftoff will be risky with this damage.' : 'Ready for liftoff when you are.') : '';
    $('msg').hidden = false;
  }
}

requestAnimationFrame(frame);
