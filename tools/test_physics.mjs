// Headless checks of the LM physics and autopilot.  Run: node tools/test_physics.mjs
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { newState, step, massProps, MOON_G, padHeight, tilt, attitude, liftoff } from '../web/js/game/physics.js';
import { createDap, dapUpdate, setMode, RATE_MAX } from '../web/js/game/dap.js';
import { DPS, GEAR, jet } from '../web/js/game/lm.js';
import { cross, dot, qrot } from '../web/js/game/vec.js';

const DT = 1 / 480, DEG = Math.PI / 180;
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}  ${info}`); if (!ok) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const NOSTICK = { pitch: 0, roll: 0, yaw: 0, tx: 0, ty: 0, tz: 0, rodClicks: 0, throttle: 0 };
const fly = (s, d, inp, secs, until) => {
  for (let i = 0; i < secs / DT; i++) {
    const c = dapUpdate(d, s, typeof inp === 'function' ? inp(s) : inp, DT);
    step(s, c, DT);
    if (until && until(s)) break;
  }
  return s;
};

check('lunar gravity', near(MOON_G, 1.624, 0.002), MOON_G.toFixed(4));

// mass properties
{
  const s = newState({ dpsFuel: 400 });
  const { m, cg, I } = massProps(s);
  check('LM mass near touchdown', m > 7000 && m < 7600, `${m.toFixed(0)} kg`);
  check('centre of mass near the stage interface', Math.abs(cg[0]) < 0.8 && Math.abs(cg[1]) < 0.05, cg.map(c => c.toFixed(2)).join(', '));
  check('inertia positive and plausible', I[0] > 3000 && I[4] > 5000 && I[8] > 5000 && I[4] < 40000,
    `Ixx ${I[0].toFixed(0)} Iyy ${I[4].toFixed(0)} Izz ${I[8].toFixed(0)} kg·m²`);
}

// Luminary jet table gives torques about the U and V axes
{
  const U = [0, Math.SQRT1_2, Math.SQRT1_2], V = [0, -Math.SQRT1_2, Math.SQRT1_2];
  const torque = ns => ns.map(n => cross(jet(n).pos, jet(n).dir)).reduce((a, b) => a.map((c, i) => c + b[i]));
  const ok = (ns, axis, sign) => { const t = torque(ns); return dot(t, axis) * sign > 0.9 * Math.hypot(...t); };
  check('jets 5,14 rotate +U and 6,13 -U', ok([5, 14], U, 1) && ok([6, 13], U, -1));
  check('jets 1,10 rotate +V and 2,9 -V', ok([1, 10], V, 1) && ok([2, 9], V, -1));
}

// free fall
{
  const s = newState({ alt: 1000, vel: [0, 0, 0], q: attitude(0), engStop: true, throttle: 0 });
  const y0 = s.pos[1];
  for (let i = 0; i < 2 / DT; i++) step(s, { throttle: 0, jets: [] }, DT);
  check('free fall 2 s', near(s.vel[1], -2 * MOON_G, 1e-6) && near(y0 - s.pos[1], 2 * MOON_G, 0.01), s.vel[1].toFixed(4));
}

// P66 with no clicks holds the descent rate it started with; propellant flow = F / ve
{
  const s = newState({ alt: 200, vel: [0, -1, 0], q: attitude(0) });
  const d = createDap(); setMode(d, s, 'P66');
  fly(s, d, NOSTICK, 10);
  check('P66 holds 1 m/s descent', near(s.vel[1], -1, 0.03), s.vel[1].toFixed(3));
  const f0 = s.dpsFuel, F = s.throttle * DPS.fRated;
  fly(s, d, NOSTICK, 1);
  check('descent propellant flow from Luminary exhaust velocity', near(f0 - s.dpsFuel, F / DPS.vex, 0.05), `${(f0 - s.dpsFuel).toFixed(2)} kg/s at ${(s.throttle * 100).toFixed(0)} %`);
  fly(s, d, { ...NOSTICK, rodClicks: 3 }, DT);
  fly(s, d, NOSTICK, 8);
  check('three ROD clicks up: 3 ft/s slower descent', near(s.vel[1], -1 + 3 * 0.3048, 0.03), s.vel[1].toFixed(3));
}

// hand controller: rate command, then attitude hold
{
  const s = newState({ alt: 500, vel: [0, 0, 0], q: attitude(0) });
  const d = createDap();
  fly(s, d, { ...NOSTICK, pitch: 1 }, 3);
  check('full forward stick: 20°/s pitch rate', near(-s.w[1], RATE_MAX, 0.6 * DEG), `${(s.w[1] / DEG).toFixed(1)}°/s`);
  fly(s, d, NOSTICK, 4);
  const q1 = s.q.slice();
  fly(s, d, NOSTICK, 10);
  const drift = Math.acos(Math.min(1, Math.abs(q1.reduce((a, c, i) => a + c * s.q[i], 0)))) * 2 / DEG;
  check('centred stick holds attitude', Math.hypot(...s.w) < 0.3 * DEG && drift < 1, `rate ${(Math.hypot(...s.w) / DEG).toFixed(2)}°/s, drift ${drift.toFixed(2)}° in 10 s`);
}

// trim gimbal takes over from the RCS during a long burn
{
  const s = newState({ alt: 2000, vel: [0, 0, 0], q: attitude(0) });
  const d = createDap(); setMode(d, s, 'P66');
  fly(s, d, NOSTICK, 2);
  const r0 = s.rcsFuel; fly(s, d, NOSTICK, 10); const early = r0 - s.rcsFuel;
  fly(s, d, NOSTICK, 50);
  const r1 = s.rcsFuel; fly(s, d, NOSTICK, 10); const late = r1 - s.rcsFuel;
  check('trim gimbal cuts RCS use', late <= early, `RCS ${early.toFixed(2)} kg then ${late.toFixed(2)} kg per 10 s, gimbal ${s.gimbal.map(g => (g / DEG).toFixed(2)).join('/')}°`);
}

// touchdowns at different speeds, engine stopped, attitude held
function drop(vDown, vSide = 0, tiltDeg = 0) {
  const s = newState({ alt: 0.05, vel: [vSide, -vDown, 0], q: attitude(tiltDeg * DEG), engStop: true, throttle: 0 });
  fly(s, createDap(), NOSTICK, 30, s => s.phase !== 'flying');
  return s;
}
const sevs = s => s.report?.lines.filter(l => l.sev).map(l => l.text).join(' | ');
{
  const s = drop(1.0);
  check('1 m/s touchdown: good landing', s.phase === 'down' && s.report.worst === 0, `${s.report?.verdict}, max stroke ${(Math.max(...s.legs.map(l => l.c)) * 100).toFixed(1)} cm ${sevs(s)}`);
  const b = drop(3.0);
  const st = Math.max(...b.legs.map(l => l.c));
  check('3 m/s (design limit): uses roughly half the stroke', st > GEAR.stroke * 0.25 && st < GEAR.stroke * 0.75 && b.phase === 'down', `${(st * 100).toFixed(0)} cm, ${b.report?.verdict}, ${b.gPeak.toFixed(1)} g`);
  const h = drop(5.5);
  check('5.5 m/s: hard landing with damage, crew alive', h.phase === 'down' && h.report.worst >= 1 && !h.crewLost, `${h.report?.verdict}: ${sevs(h)}`);
  const x = drop(15);
  check('15 m/s: severe or crew lost', x.report && x.report.worst >= 3, `${x.report?.verdict}: ${sevs(x)}`);
  const sl = drop(1.5, 3.0);
  check('3 m/s sideways: not a clean landing', sl.report && sl.report.worst >= 1, `${sl.report?.verdict}, tilt ${(tilt(sl) / DEG).toFixed(0)}° ${sevs(sl)}`);
}

// a simple pilot flies the default start down in P66 with the stick
{
  const s = newState();
  const d = createDap(); setMode(d, s, 'P66');
  fly(s, d, s => {
    const h = padHeight(s);
    const wantVy = -Math.max(0.6, Math.min(8, h * 0.08));
    const vxCap = Math.min(10, h * 0.06);
    const wantVx = Math.max(-vxCap, Math.min(vxCap, -s.pos[0] * 0.03));
    const leanWant = Math.max(-20 * DEG, Math.min(20 * DEG, (wantVx - s.vel[0]) * 0.08));   // + = lean forward
    const lean = Math.asin(Math.max(-1, Math.min(1, qrot(s.q, [1, 0, 0])[0])));
    const pitch = Math.max(-1, Math.min(1, (leanWant - lean) * 3 + s.w[1] * 1.5));
    const clicks = Math.round((wantVy - d.rod) / 0.3048);
    if (s.contactLight) s.engStop = true;
    return { ...NOSTICK, pitch, rodClicks: Math.max(-1, Math.min(1, clicks)) };
  }, 400, s => s.phase !== 'flying');
  check('P66 pilot lands the default start', s.phase === 'down' && s.report.worst <= 1,
    `${s.report?.verdict} t=${s.t.toFixed(0)} s, fuel ${s.dpsFuel.toFixed(0)} kg, RCS ${s.rcsFuel.toFixed(0)} kg, ${Math.hypot(s.pos[0], s.pos[2]).toFixed(0)} m from target ${sevs(s)}`);

  // ...and lifts off with attitude hold
  const ok = liftoff(s);
  fly(s, d, NOSTICK, 120, s => s.phase !== 'ascent');
  check('liftoff climbs through 300 m', ok && s.phase === 'climbing', `${s.phase} t=${s.t.toFixed(0)} s, alt ${s.pos[1].toFixed(0)} m, APS ${s.apsFuel.toFixed(0)} kg`);
}

process.exit(fails ? 1 : 0);
