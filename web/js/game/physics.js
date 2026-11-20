// Lunar module flight physics: one rigid body moving in a vertical plane.
// x is downrange (metres), y is height above the local ground (metres), theta is the tilt
// (radians, positive = counter-clockwise, which points the thrust toward -x).
// Pure JavaScript, no three.js, so it runs in Node tests too.
//
// Figures marked VERIFY are from memory of Apollo documents and must be checked against the
// Apollo 12 Mission Report / LM Data Book before the game claims them as real.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.

const DEG = Math.PI / 180;

// Moon: surface gravity from GM and the radius Myrsky uses for the site.
export const G0 = 9.80665;                 // standard gravity, m/s², defines specific impulse
export const MOON_GM = 4.9028e12;          // m³/s² (IAU / JPL value)
export const MOON_R = 1737400;             // m, mean radius used by Myrsky's terrain
export const MOON_G = MOON_GM / (MOON_R * MOON_R);   // about 1.624 m/s²

export const LM = {
  dryMass: 6800,          // kg, LM at touchdown minus descent propellant. VERIFY (A12 report)
  fuelStart: 750,         // kg of descent propellant at game start (a game choice)
  thrustMax: 45040,       // N, descent engine full thrust, 10,125 lbf. VERIFY
  throttleMin: 0.10,      // lowest throttle setting. Real engine: 10-60 %, then fixed full thrust
  isp: 311,               // s, descent engine specific impulse. VERIFY
  rcsJet: 445,            // N per reaction-control jet (100 lbf). VERIFY
  rcsJets: 4,             // jets firing together for a pitch rotation
  rcsArm: 1.67,           // m, jet moment arm. VERIFY
  inertia: 14000,         // kg·m², pitch moment of inertia near touchdown. ESTIMATE, VERIFY
  rateMax: 20 * DEG,      // rad/s, rotation rate at full stick (rate command, like the real stick)
  padX: 4.72,             // m, footpad distance from centre line (9.45 m across). VERIFY
  padY: -3.1,             // m, footpad bottom below the centre of mass. ESTIMATE
  probe: 1.73,            // m, lunar surface sensing probe below the pad (67 in). VERIFY
  limits: {               // touchdown limits. VERIFY (10 ft/s vertical, 4 ft/s horizontal)
    vy: 3.05,
    vx: 1.22,
    tilt: 12 * DEG,
    omega: 10 * DEG,
  },
};

// Contact points in body coordinates. The forward (+x) leg carries the ladder and no probe.
// The two side legs sit at x = 0 in this plane (they are at ±z).
const PADS = [[-LM.padX, LM.padY], [LM.padX, LM.padY], [0, LM.padY]];
const PROBES = [[-LM.padX, LM.padY - LM.probe], [0, LM.padY - LM.probe]];

export function newState(opts = {}) {
  return {
    t: 0,
    x: -700, y: 500,          // start 500 m up, 700 m short of the target
    vx: 18, vy: -14,
    theta: 18 * DEG, omega: 0,
    fuel: LM.fuelStart,
    throttle: 0,              // effective throttle 0..1 after limits
    rcs: 0,                   // -1, 0, 1: which way the jets fired this step
    contact: false,           // contact light: a probe touched
    status: 'flying',         // 'flying' | 'landed' | 'crashed'
    reason: '',
    touchdown: null,
    ...opts,
  };
}

function toWorld(s, [bx, by]) {
  const c = Math.cos(s.theta), n = Math.sin(s.theta);
  return [s.x + bx * c - by * n, s.y + bx * n + by * c];
}

// Height of the lowest footpad above the ground: what the altitude readout shows.
export function padHeight(s) {
  return Math.min(...PADS.map(p => toWorld(s, p)[1]));
}

export function mass(s) {
  return LM.dryMass + s.fuel;
}

// Burn time left at the thrust that would hold the current mass in a hover.
export function hoverSecondsLeft(s) {
  const f = mass(s) * MOON_G;
  return s.fuel / (f / (LM.isp * G0));
}

// One fixed time step. cmd = { throttle: 0..1, rot: -1..1 }.
export function step(s, cmd, dt) {
  if (s.status !== 'flying') return s;

  // engine: below half the minimum setting counts as off
  let thr = cmd.throttle < LM.throttleMin * 0.5 ? 0 : Math.min(1, Math.max(LM.throttleMin, cmd.throttle));
  if (s.fuel <= 0) thr = 0;
  const F = thr * LM.thrustMax;
  const m = mass(s);
  const mdot = F / (LM.isp * G0);
  const burnt = Math.min(s.fuel, mdot * dt);

  // attitude: rate command. The stick asks for a rotation rate, the jets fire to reach it,
  // and with the stick centred they hold the attitude (rate zero).
  const want = Math.max(-1, Math.min(1, cmd.rot)) * LM.rateMax;
  const err = want - s.omega;
  const alphaMax = LM.rcsJets * LM.rcsJet * LM.rcsArm / LM.inertia;
  let alpha = 0;
  s.rcs = 0;
  if (Math.abs(err) > 0.2 * DEG) {
    alpha = Math.max(-alphaMax, Math.min(alphaMax, err / dt));
    s.rcs = Math.sign(err);
  }

  // semi-implicit Euler
  const ax = -Math.sin(s.theta) * F / m;
  const ay = Math.cos(s.theta) * F / m - MOON_G;
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.omega += alpha * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.theta += s.omega * dt;
  s.fuel -= burnt;
  s.throttle = thr;
  s.t += dt;

  if (!s.contact && PROBES.some(p => toWorld(s, p)[1] <= 0)) s.contact = true;

  const low = padHeight(s);
  if (low <= 0) touchdown(s, low);
  return s;
}

function touchdown(s, low) {
  const L = LM.limits;
  const td = { vy: s.vy, vx: s.vx, tilt: s.theta, omega: s.omega, x: s.x, t: s.t, fuel: s.fuel };
  s.touchdown = td;
  const bad = [];
  if (-s.vy > L.vy) bad.push(`came down at ${(-s.vy).toFixed(1)} m/s (limit ${L.vy.toFixed(1)})`);
  if (Math.abs(s.vx) > L.vx) bad.push(`sliding sideways at ${Math.abs(s.vx).toFixed(1)} m/s (limit ${L.vx.toFixed(1)})`);
  if (Math.abs(s.theta) > L.tilt) bad.push(`tilted ${(Math.abs(s.theta) / DEG).toFixed(0)}° (limit ${(L.tilt / DEG).toFixed(0)}°)`);
  if (Math.abs(s.omega) > L.omega) bad.push(`still rotating at ${(Math.abs(s.omega) / DEG).toFixed(0)}°/s`);

  s.y -= low;              // put the lowest pad on the ground
  s.throttle = 0;
  s.rcs = 0;
  if (bad.length) {
    s.status = 'crashed';
    s.reason = bad.join(', ');
  } else {
    // flat ground: the lander settles onto all four pads
    s.status = 'landed';
    s.theta = 0;
    s.y = -LM.padY;
    s.vx = s.vy = s.omega = 0;
  }
}
