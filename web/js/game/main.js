// Game loop: fixed-step physics, input, scene and readouts.
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { newState, step, padHeight, hoverSecondsLeft, LM } from './physics.js';
import { createInput } from './input.js';
import { createScene } from './scene.js';

const DT = 1 / 120;
const DEG = 180 / Math.PI;
const $ = id => document.getElementById(id);

const meta = await (await fetch('assets/terrain.json')).json();
const view = await createScene($('view'), meta);
const input = createInput(document.body);

let s = newState();
let paused = false;
let acc = 0, last = performance.now();
const restart = () => { s = newState(); input.reset(); view.snapCamera(); $('msg').hidden = true; };
input.on('r', restart);
input.on('p', () => { paused = !paused; });
$('msg').addEventListener('click', restart);
// debugging from the console: game.set({ y: 40, vy: -2 }), game.paused = true
window.game = { get s() { return s; }, set(o) { Object.assign(s, o); view.snapCamera(); }, get paused() { return paused; }, set paused(v) { paused = v; } };
document.addEventListener('visibilitychange', () => { last = performance.now(); });

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const cmd = input.read(dt);
  if (!paused) {
    acc += dt;
    while (acc >= DT) { step(s, cmd, DT); acc -= DT; }
  }
  const h = Math.max(0, padHeight(s));
  view.update(s, h, dt);
  hud(s, h, cmd);
  requestAnimationFrame(frame);
}

function hud(s, h, cmd) {
  $('alt').textContent = h.toFixed(h < 100 ? 1 : 0);
  $('vs').textContent = s.vy.toFixed(1);
  $('hs').textContent = s.vx.toFixed(1);
  $('fuel').textContent = s.fuel.toFixed(0);
  const sec = hoverSecondsLeft(s);
  $('sec').textContent = sec.toFixed(0);
  $('thr').textContent = (s.throttle * 100).toFixed(0);
  $('thr-cmd').style.height = (cmd.throttle * 100) + '%';
  $('pitch').textContent = (s.theta * DEG).toFixed(0);
  $('dist').textContent = s.x.toFixed(0);
  $('met').textContent = s.t.toFixed(1);
  $('contact').classList.toggle('on', s.contact);
  $('bingo').textContent = s.fuel <= 0 ? 'NO FUEL' : sec < 30 ? '30 SECONDS' : sec < 60 ? '60 SECONDS' : '';
  $('vs').classList.toggle('warn', -s.vy > LM.limits.vy && h < 30);
  $('hs').classList.toggle('warn', Math.abs(s.vx) > LM.limits.vx && h < 30);

  if (s.status !== 'flying' && $('msg').hidden) {
    const td = s.touchdown;
    $('msg-title').textContent = s.status === 'landed' ? 'INTREPID HAS LANDED' : 'CRASHED';
    $('msg-body').innerHTML = s.status === 'landed'
      ? `Touchdown at ${(-td.vy).toFixed(2)} m/s down, ${Math.abs(td.vx).toFixed(2)} m/s sideways.<br>` +
        `${Math.abs(td.x).toFixed(0)} m from the Apollo 12 landing spot, ${td.fuel.toFixed(0)} kg of propellant left.<br>` +
        `Apollo 12 landed 163 m from Surveyor 3.`
      : `Lander ${s.reason}.`;
    $('msg').hidden = false;
  }
}

requestAnimationFrame(frame);
