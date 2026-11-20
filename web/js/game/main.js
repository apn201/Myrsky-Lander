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
let subT = 0;
sound.onSubtitle(t => { $('callout').textContent = t; subT = performance.now(); });
setInterval(() => { if (performance.now() - subT > 2800) $('callout').textContent = ''; }, 300);
let s, dap, evs = [], scenario = SCENARIOS[0], paused = true, acc = 0, last = performance.now(), shownEvents = 0, shownPhase = '';
let calls = {}, lastDust = 0;
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
function engineStop() { if (s.stage === 'full') { s.engStop = !s.engStop; if (s.engStop && s.contactLight && !calls.es) { calls.es = true; sound.cue('engstop'); } } else if (s.phase === 'ascent') s.apsOn = !s.apsOn; }
function doLiftoff() { if (abortStage(s) || liftoff(s)) { dap.hold = null; $('msg').hidden = true; shownPhase = s.phase; } }
function ackAlarm() { s.alarmQuiet = true; s.everAcked = true; if (s.alarm && !s.alarm.acked) { s.alarm.acked = true; const first = !calls.go; calls.go = true; setTimeout(() => sound.chat(first ? 'alarm_go' : 'alarm_go_same'), 1500); } }
function menu() {
  paused = true;
  $('msg').hidden = true;                // the report must not show through the menu
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
input.on('c', () => view.toggleCamera());
input.on('g', () => view.toggleFilm());
$('btn-stop').onclick = engineStop;
$('btn-mode').onclick = toggleMode;
$('btn-zoom').onclick = () => view.cycleZoom();
$('btn-cam').onclick = () => view.toggleCamera();
$('btn-lift').onclick = doLiftoff;
$('btn-again').onclick = () => restart();
$('btn-menu').onclick = menu;
$('btn-ack').onclick = ackAlarm;
$('btn-abort').onclick = doLiftoff;
$('master').onclick = ackAlarm;
document.addEventListener('visibilitychange', () => { last = performance.now(); });

// debugging from the console: game.set({ vel: [0, -2, 0] }), game.paused = true
window.game = {
  get s() { return s; }, get dap() { return dap; }, world, sound,
  set(o) { Object.assign(s, o); view.snapCamera(); },
  get paused() { return paused; }, set paused(v) { paused = v; },
};

function frame(now) {
  requestAnimationFrame(frame);          // first, so an error below can never stop the game loop
  try { tick(now); } catch (e) { console.error(e); }
}
function tick(now) {
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
  // the MASTER ALARM light stays on until pressed (A or click). The tone runs until the first
  // acknowledge; after that a new alarm lights the light with a short chirp only.
  const lit = alarmLit && !s.alarmQuiet;
  if (lit && !s.litSince) s.litSince = s.t;
  if (!lit) s.litSince = null;
  const tone = lit && (!s.everAcked || s.t - s.litSince < 1.2);
  $('master').classList.toggle('on', lit);
  sound.update(s, tone);
  const scr = view.update(s, g.h, dt);
  lastDust = scr.dust || 0;
  hud(s, g, scr);
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
  // propellant gauge: descent propellant (or ascent after staging), hover seconds left
  const fullFuel = s.stage === 'full' ? (s.fuelStart ?? (s.fuelStart = s.dpsFuel)) : 2353;
  const left = s.stage === 'full' ? s.dpsFuel : s.apsFuel;
  $('fuel-lvl').style.height = Math.max(0, Math.min(100, left / fullFuel * 100)) + '%';
  $('fuel-bar').className = s.stage !== 'full' ? '' : secs < 30 ? 'red' : secs < 60 ? 'amber' : '';
  $('hover').textContent = s.stage === 'full' ? secs.toFixed(0) : '—';
  $('hover').className = s.stage === 'full' && secs < 60 ? (secs < 30 ? 'sev3' : 'sev2') : '';
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

// radio: altitude callouts from the player's real numbers, event chatter, real Apollo 11 tape at the end
let lastThud = 0;
const RATES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 15, 20];
function once(key, fn) { if (!calls[key]) { calls[key] = true; fn(); } }
function callouts(s, g) {
  const ft = g.h * 3.28084, down = -(s.vel[1] + (s.nav.vErr || 0)) * 3.28084;
  if (s.stage === 'full' && s.phase === 'flying') {
    if (s.t > 2) once('go', () => sound.chat(['go_landing', 'go_landing_ack']));
    if (s.t > 25 && g.h > 120) once('nice', () => sound.chat(s.rand && s.rand() < 0.5 ? 'looking_good' : 'coming_nicely'));
    for (const mark of [400, 300, 250, 200, 150, 100, 75, 60, 50, 40, 30, 20, 10]) {
      if (ft < mark && !calls['h' + mark]) {
        calls['h' + mark] = true;
        if (mark > ft + 30) break;                       // passed long ago (start below this mark)
        const r = RATES.reduce((a, b) => Math.abs(b - down) < Math.abs(a - down) ? b : a);
        sound.chat(down > 0.25 ? ['h' + mark, 'r' + r] : ['h' + mark]);
        break;
      }
    }
    if (g.h < 9 && g.h > 3) once('shadow', () => sound.chat('shadow'));
    if (g.adv.some(a => a.text.startsWith('BOULDERS'))) once('rocks', () => sound.chat('lot_of_rocks'));
    if (s.radarOut) once('av', () => { sound.cue('altvel'); sound.chat('radar_lost'); setTimeout(() => sound.chat('radar_ack'), 2500); });
    if (s.fail.stuckJet) once('jet', () => { sound.chat('jet_stuck'); setTimeout(() => sound.chat('jet_isolate'), 2500); });
    if (s.fail.throttleStuck != null) once('thr', () => { sound.chat('throttle_stuck'); setTimeout(() => sound.chat('throttle_ack'), 2500); });
    if (s.dpsFailed) once('eng', () => sound.chat('engine_out'));
  }
  if (s.alarmCall) {
    const c = s.alarmCall; s.alarmCall = null;
    sound.chat(!calls.firstAlarm ? 'alarm_1202' : c === '1201' ? 'alarm_1201' : 'alarm_reading');
    calls.firstAlarm = true;
  }
  if (s.stage === 'full') {
    const secs = s.dpsFuel / (massProps(s).m * MOON_G / DPS.vex);
    if (secs < 60 && s.phase === 'flying') once('f60', () => sound.cue('s60'));
    if (secs < 30 && s.phase === 'flying') once('f30', () => sound.cue('s30'));
    if (s.contactLight) once('contact', () => sound.cue('contact'));
    if (lastDust > 0.25 && s.phase === 'flying') once('dust', () => sound.cue('dust'));
    if (s.firstTouch) once('td', () => sound.thud(s.firstTouch.vVert));
  }
  if (s.descentPose?.vel && s.stage === 'ascent' && !s.brokeUp) once('abortack', () => sound.chat('abort_ack'));
  if (s.ignition != null && !s.descentPose?.vel && !s.brokeUp) once('lift', () => { sound.chat(['liftoff']); sound.chat('liftoff_beautiful'); setTimeout(() => sound.chat('liftoff_ack'), 4000); });
  const hard = s.events.length && s.events[s.events.length - 1];
  if (hard && hard.sev >= 2 && hard.t > lastThud && /HIT|FAILED|BOTTOMED|BREACHED/.test(hard.text)) { lastThud = hard.t; sound.thud(5); }
  if (s.phase === 'down' && !calls.down) {
    calls.down = true;
    const w = s.report.worst;
    setTimeout(() => {
      if (s.brokeUp) { sound.chat('broke_up'); sound.chat('say_status'); }
      else if (w <= 0) { sound.cue('eagle'); setTimeout(() => sound.cue('blue'), 6200); }
      else if (w === 1) { sound.chat('hard_landing'); sound.chat('we_copy_down'); }
      else { sound.chat('damaged_down'); sound.chat('say_status'); }
    }, 600);
  }
}
