// Game loop: fixed-step physics at 480 Hz on the real Apollo 12 terrain, autopilot, flight director,
// input, scene and readouts.
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { newState, step, padHeight, liftoff, abortStage, massProps, MOON_G } from './physics.js';
import { SCENARIOS, startScenario, runEvents } from './scenarios.js';
import { createSound } from './sound.js';
import { createDap, dapUpdate, setMode } from './dap.js';
import { guidance } from './guidance.js';
import { createInput } from './input.js';
import { createScene, world } from './scene.js';
import { DPS, GEAR } from './lm.js';
import { qrot } from './vec.js';

const DT = 1 / 480;
const DEG = 180 / Math.PI;
const $ = id => document.getElementById(id);

const view = await createScene($('view'));
const input = createInput(document.body);
$('loading').remove();

const sound = createSound();
let s, dap, evs = [], scenario = SCENARIOS[0], paused = true, acc = 0, last = performance.now(), shownEvents = 0, shownPhase = '';
let calls = {};
function restart(sc = scenario) {
  scenario = sc;
  s = newState();
  s.pos[1] += 300 - padHeight(s, world);        // 300 m above the real ground
  evs = startScenario(sc, s, world);
  calls = {};
  paused = false;
  $('menu').hidden = true;
  $('scn').textContent = sc.title;
  dap = createDap();
  setMode(dap, s, 'P66');
  input.setMode('P66');
  input.reset();
  view.snapCamera();
  $('msg').hidden = true; $('log').innerHTML = ''; shownEvents = 0; shownPhase = '';
}
menu();
restart(SCENARIOS[0]); paused = true; $('menu').hidden = false;

function toggleMode() {
  if (s.stage !== 'full') return;
  const m = dap.mode === 'P66' ? 'MANUAL' : 'P66';
  if (m === 'MANUAL') input.setThrottle(Math.max(0, Math.min(1, (s.throttle - DPS.minFrac) / 0.6)));
  setMode(dap, s, m); input.setMode(m);
}
function engineStop() { if (s.stage === 'full') s.engStop = !s.engStop; else if (s.phase === 'ascent') s.apsOn = !s.apsOn; }
function doLiftoff() { if (abortStage(s)) { dap.hold = null; $('msg').hidden = true; shownPhase = s.phase; } }
function ackAlarm() { s.alarmQuiet = true; if (s.alarm && !s.alarm.acked) { s.alarm.acked = true; if (!calls.go) { calls.go = true; setTimeout(() => sound.say("Roger. We're go on that alarm."), 1800); } } }
function menu() {
  paused = true;
  $('menu-list').innerHTML = '';
  for (const sc of SCENARIOS) {
    const b = document.createElement('button');
    b.innerHTML = `<b>${sc.title}</b><span>${sc.text}</span>`;
    b.onclick = () => restart(sc);
    $('menu-list').append(b);
  }
  $('menu').hidden = false;
}
input.on('r', () => restart());
input.on('n', menu);
input.on('a', ackAlarm);
input.on('v', () => sound.toggle());
for (const [k, q] of [['1', 'A'], ['2', 'B'], ['3', 'C'], ['4', 'D']]) input.on(k, () => { s.isolated.has(q) ? s.isolated.delete(q) : s.isolated.add(q); s.events.push({ t: s.t, sev: 1, text: `RCS QUAD ${q} ${s.isolated.has(q) ? 'ISOLATED' : 'BACK ON'}` }); });
input.on('p', () => { paused = !paused; });
input.on('space', engineStop);
input.on('enter', doLiftoff);
input.on('m', toggleMode);
input.on('z', () => view.cycleZoom());
input.on('c', () => view.cycleZoom());
$('btn-stop').onclick = engineStop;
$('btn-mode').onclick = toggleMode;
$('btn-zoom').onclick = () => view.cycleZoom();
$('btn-lift').onclick = doLiftoff;
$('btn-again').onclick = () => restart();
$('btn-menu').onclick = menu;
$('btn-ack').onclick = ackAlarm;
$('btn-abort').onclick = doLiftoff;
$('master').onclick = ackAlarm;
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// debugging from the console: game.set({ vel: [0, -2, 0] }), game.paused = true
window.game = {
  get s() { return s; }, get dap() { return dap; }, world,
  set(o) { Object.assign(s, o); view.snapCamera(); },
  get paused() { return paused; }, set paused(v) { paused = v; },
};

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const raw = input.read(dt);
  // the arrows push the lander the way they point. Seen from the north, screen right is west, the
  // LM's forward direction: right arrow = lean west = stick forward
  const inp = { ...raw };
  s.manualThrottle = raw.throttle;
  if (!paused) {
    acc += dt;
    let clicks = inp.rodClicks;
    while (acc >= DT) {
      // crew keeps the cross-range drift near zero with small RCS translations (body Y along world z)
      const yW = qrot(s.q, [0, 1, 0])[2];
      const vz = s.vel[2];
      const ty = Math.abs(vz) > 0.05 && Math.abs(yW) > 0.5 ? -Math.sign(vz * yW) : 0;
      const c = dapUpdate(dap, s, { ...inp, ty, rodClicks: clicks }, DT);
      clicks = 0;
      step(s, c, DT, world);
      acc -= DT;
    }
  }
  let g = guidance(s, dap, world);
  if (!paused) {
    runEvents(evs, s, g);
    if (s.radarOut) s.nav.hErr += s.nav.vErr * dt;
    g = guidance(s, dap, world);
    callouts(s, g);
  }
  const alarmLit = !!(s.alarm && !s.alarm.acked) || (s.phase === 'flying' && g.adv.some(a => a.lvl >= 3));
  // the MASTER ALARM light and tone stay on until pressed (A); a new alarm or failure lights it again
  const lit = alarmLit && !s.alarmQuiet;
  $('master').classList.toggle('on', lit);
  sound.update(s, lit);
  const scr = view.update(s, g.h, dt);
  hud(s, g, scr);
  requestAnimationFrame(frame);
}

function hud(s, g, scr) {
  const h = g.h;
  if (!s.restarting) {                                   // a program alarm restart freezes the displays
    $('alt').textContent = h.toFixed(h < 100 ? 1 : 0) + (s.radarOut ? '?' : '');
    $('vs').textContent = (s.vel[1] + (s.nav.vErr || 0)).toFixed(1) + (s.radarOut ? '?' : '');
  }
  $('prog').textContent = s.alarm && s.t - s.alarm.t < 12 ? `PROG ${s.alarm.code}` : '';
  $('prog').classList.toggle('lit', !!(s.alarm && s.t - s.alarm.t < 12));
  $('hs').textContent = (-s.vel[0]).toFixed(1);          // + = moving right on screen (west, forward)
  $('lean').textContent = (-g.lean * DEG).toFixed(0);    // + = leaning right on screen (forward)
  const thrPct = s.stage === 'full' ? s.throttle * 100 : (s.apsOn && s.apsFuel > 0 ? 100 : 0);
  $('thr').textContent = thrPct.toFixed(0);
  $('thr-cmd').style.height = Math.min(100, thrPct) + '%';
  $('mode').textContent = s.stage === 'ascent' ? 'ASCENT' : dap.mode === 'P66' ? `P66 ${(dap.rod ?? 0).toFixed(1)}` : 'MANUAL';
  $('dps').textContent = s.stage === 'full' ? s.dpsFuel.toFixed(0) : s.apsFuel.toFixed(0);
  $('dps-l').textContent = s.stage === 'full' ? 'DPS' : 'APS';
  $('rcs').textContent = s.rcsFuel.toFixed(0);
  $('dist').textContent = (-g.dx).toFixed(0);
  $('met').textContent = s.t.toFixed(1);
  const sf = g.surf;
  $('surf').textContent = sf.rock > 0.35 ? `ROCK ${sf.rock.toFixed(1)}m` : sf.slope > 9 ? `SLOPE ${sf.slope.toFixed(0)}°` : 'CLEAR';
  $('surf').className = sf.ok ? '' : 'sev2';
  $('g').textContent = s.gNow.toFixed(1);
  $('contact').classList.toggle('on', s.contactLight);
  $('engstop').classList.toggle('on', s.stage === 'full' && s.engStop);
  const secs = s.dpsFuel / (massProps(s).m * MOON_G / DPS.vex);
  $('bingo').textContent = s.stage !== 'full' ? '' : s.dpsFuel <= 0 ? '' : secs < 30 ? '30 SECONDS' : secs < 60 ? '60 SECONDS' : '';

  // flight director: keep the dot in the middle of the crosshair
  const fd = $('fd');
  const flying = (s.phase === 'flying' && s.stage === 'full' && !s.restarting) || s.phase === 'ascent';
  fd.style.display = flying ? 'block' : 'none';
  if (flying) {
    const bx = Math.max(-1, Math.min(1, -g.leanErr * DEG / 10)), by = Math.max(-1, Math.min(1, g.vertErr));
    $('fd-dot').style.transform = `translate(${(bx * 46).toFixed(0)}px, ${(-by * 46).toFixed(0)}px)`;
    const centred = Math.abs(bx) < 0.15 && Math.abs(by) < 0.2;
    fd.classList.toggle('good', centred);
    $('fd-l').style.opacity = bx < -0.15 ? 1 : 0.15;
    $('fd-r').style.opacity = bx > 0.15 ? 1 : 0.15;
    $('fd-u').style.opacity = by > 0.2 ? 1 : 0.15;
    $('fd-d').style.opacity = by < -0.2 ? 1 : 0.15;
  }
  const top = g.adv.slice().sort((a, b) => b.lvl - a.lvl)[0];
  $('adv').textContent = top ? top.text : '';
  $('adv').className = 'hud' + (top ? ' sev' + top.lvl : '');

  for (let n = 1; n <= 16; n++) $('j' + n).className = s.failedJets.has(n) ? 'dead' : s.jetsOn[n] ? 'on' : '';
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
    while ($('log').children.length > 5) $('log').lastChild.remove();
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

// spoken callouts, Apollo style: height in feet and descent rate, fuel, contact
let lastThud = 0;
function callouts(s, g) {
  if (s.stage !== 'full') return;
  const ft = g.h * 3.28084, down = -(s.vel[1] + (s.nav.vErr || 0)) * 3.28084;
  for (const mark of [400, 300, 200, 150, 100, 75, 50, 40, 30, 20, 10]) {
    if (ft < mark && !calls['h' + mark] && s.phase === 'flying') {
      calls['h' + mark] = true;
      const r = Math.max(0, Math.round(down * 2) / 2);
      sound.say(`${mark} feet, down ${r % 1 ? Math.floor(r) + ' and a half' : r}`);
      break;
    }
  }
  const secs = s.dpsFuel / (massProps(s).m * MOON_G / DPS.vex);
  if (secs < 60 && !calls.f60) { calls.f60 = true; sound.say('Sixty seconds'); }
  if (secs < 30 && !calls.f30) { calls.f30 = true; sound.say('Thirty seconds'); }
  if (s.contactLight && !calls.contact) { calls.contact = true; sound.say('Contact light'); }
  if (s.firstTouch && !calls.td) { calls.td = true; sound.thud(s.firstTouch.vVert); }
  const hard = s.events.length && s.events[s.events.length - 1];
  if (hard && hard.sev >= 2 && hard.t > lastThud && /HIT|FAILED|BOTTOMED|BREACHED/.test(hard.text)) { lastThud = hard.t; sound.thud(5); }
  if (s.phase === 'down' && !calls.down) { calls.down = true; setTimeout(() => sound.say(s.report.worst <= 1 ? 'Engine stop. Houston, we are down.' : 'We are down. Assessing damage.'), 600); }
}
