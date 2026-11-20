// Headless checks of web/js/game/physics.js.  Run: node tools/test_physics.mjs
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { newState, step, LM, MOON_G, G0, mass, padHeight } from '../web/js/game/physics.js';

const DT = 1 / 120;
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`); if (!ok) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

check('lunar gravity about 1.62', near(MOON_G, 1.624, 0.002), MOON_G.toFixed(4));

// free fall for 2 s from rest: v = g t, drop = g t²/2
{
  const s = newState({ x: 0, y: 1000, vx: 0, vy: 0, theta: 0 });
  for (let i = 0; i < 240; i++) step(s, { throttle: 0, rot: 0 }, DT);
  check('free fall speed', near(s.vy, -MOON_G * 2, 1e-6), s.vy.toFixed(4));
  check('free fall drop', near(1000 - s.y, MOON_G * 2, 0.02), (1000 - s.y).toFixed(3));
}

// hover throttle holds height; propellant flow matches F / (Isp g0)
{
  const s = newState({ x: 0, y: 1000, vx: 0, vy: 0, theta: 0 });
  const f0 = s.fuel;
  const thr = mass(s) * MOON_G / LM.thrustMax;
  for (let i = 0; i < 120; i++) step(s, { throttle: thr, rot: 0 }, DT);
  check('hover throttle in the real 10-60 % band', thr > 0.1 && thr < 0.6, (thr * 100).toFixed(1) + ' %');
  check('hover holds height over 1 s', near(s.y, 1000, 0.05), s.y.toFixed(3));
  const flow = thr * LM.thrustMax / (LM.isp * G0);
  check('propellant flow from Isp', near(f0 - s.fuel, flow, 0.01), `${(f0 - s.fuel).toFixed(3)} kg/s`);
}

// full stick reaches the commanded rate, centred stick holds attitude
{
  const s = newState({ x: 0, y: 1000, vx: 0, vy: 0, theta: 0 });
  let t20 = null;
  for (let i = 0; i < 1200 && t20 === null; i++) { step(s, { throttle: 0, rot: 1 }, DT); if (s.omega >= LM.rateMax * 0.99) t20 = s.t; }
  check('reaches 20°/s rotation', t20 !== null, `in ${t20?.toFixed(2)} s`);
  for (let i = 0; i < 1200; i++) step(s, { throttle: 0, rot: 0 }, DT);
  check('centred stick stops rotation', Math.abs(s.omega) < 0.005, (s.omega * 180 / Math.PI).toFixed(3) + '°/s');
}

// touchdown judgement
{
  const s = newState({ x: 0, y: -LM.padY + 0.5, vx: 0.3, vy: -1, theta: 0 });
  while (s.status === 'flying') step(s, { throttle: 0, rot: 0 }, DT);
  check('soft touchdown lands', s.status === 'landed', s.reason);
  const h = newState({ x: 0, y: 30, vx: 0, vy: -5, theta: 0 });
  while (h.status === 'flying') step(h, { throttle: 0, rot: 0 }, DT);
  check('hard touchdown crashes', h.status === 'crashed', h.reason);
}

// the default start can be flown down with fuel to spare by a simple autopilot
{
  const s = newState();
  while (s.status === 'flying' && s.t < 600) {
    const h = padHeight(s);
    const vyWant = -Math.max(0.8, Math.min(15, h * 0.12));          // descent rate schedule
    const vxCap = Math.min(10, h * 0.08);                               // null drift before touchdown
    const vxWant = Math.max(-vxCap, Math.min(vxCap, -s.x * 0.04));      // head for x = 0
    const ay = Math.max(0, (vyWant - s.vy) * 1.0 + MOON_G);   // engine can only push up
    const ax = (vxWant - s.vx) * 0.6;
    const thWant = Math.max(-0.5, Math.min(0.5, Math.atan2(-ax, Math.max(0.3, ay))));
    const rot = Math.max(-1, Math.min(1, (thWant - s.theta) * 3 - s.omega * 0.5));
    const F = ay < 0.05 ? 0 : mass(s) * Math.hypot(ax, ay);
    step(s, { throttle: F / LM.thrustMax, rot }, DT);
  }
  check('autopilot lands the default start', s.status === 'landed',
    `${s.status} ${s.reason} t=${s.t.toFixed(0)} s, fuel left ${s.fuel.toFixed(0)} kg, ${s.x.toFixed(0)} m from target`);
}

process.exit(fails ? 1 : 0);
