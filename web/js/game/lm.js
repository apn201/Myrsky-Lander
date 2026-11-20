// Lunar module definition: masses, engines, the 16 RCS jets, landing gear and hull contact points.
//
// Body axes are the LM's own: +X up (along the descent engine thrust), +Y right, +Z forward (out of
// the front windows). Origin: the descent/ascent stage interface plane, on the centre line.
//
// Sources:
//   LUMINARY  = Luminary 131 rev 1 (Apollo 13 LM flight software), CONTROLLED_CONSTANTS.agc and
//               Q,R-AXES_RCS_AUTOPILOT.agc, in the Space pilot project's Virtual AGC copy.
//   VERIFY    = figure from memory of Apollo documents; check against the LM Data Book / Apollo 12
//               Mission Report before the game presents it as fact.
//   ESTIMATE  = chosen by us to behave plausibly; no source.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.

export const G0 = 9.80665;

export const DPS = {
  vex: 2955.88868,        // m/s effective exhaust velocity. LUMINARY DPSVEX
  fRated: 46706,          // N, rated thrust (10,500 lbf). VERIFY
  fFTP: 43454.6769,       // N, full throttle position. LUMINARY FMAXPOS
  minFrac: 0.10,          // lowest throttle, fraction of rated. VERIFY
  maxThrottleFrac: 0.65,  // top of the throttleable range; above it the engine goes to FTP. VERIFY
  lag: 0.2,               // s, throttle response time constant. LUMINARY THROTLAG
  pivot: [-0.95, 0, 0],   // gimbal pivot. ESTIMATE
  exit: -2.75,            // nozzle exit plane X. ESTIMATE (0.5 m above uncompressed footpads)
  exitR: 0.76,            // nozzle exit radius. VERIFY
  gimbalMax: 6 * Math.PI / 180,      // trim gimbal travel. VERIFY
  gimbalRate: 0.2 * Math.PI / 180,   // trim gimbal drive rate, rad/s. VERIFY
};

export const APS = {
  vex: 3030,              // m/s. LUMINARY APSVEX (9942 ft/s)
  thrust: 15570,          // N (3,500 lbf), fixed, cannot throttle. VERIFY
  point: [0.25, 0, 0],    // nozzle throat, under the ascent stage. ESTIMATE
};

export const RCS = {
  thrust: 445,            // N per jet (100 lbf). VERIFY
  isp: 290,               // s, steady-state. VERIFY
  minPulse: 0.014,        // s, minimum jet on-time. LUMINARY 14MS = TJMINT6
  quadR: 1.68,            // m, quad offset along Y and along Z (quads sit on the diagonals). VERIFY
  quadX: 1.85,            // m, quad height above the interface. ESTIMATE
};

// Mass items. Boxes give the inertia; masses change as propellant burns.
// size = [X, Y, Z] extent in metres, at = centre.
export const MASS = {
  descentDry: { m: 2034, at: [-0.85, 0, 0], size: [1.65, 4.2, 4.2] },     // 4,483 lb. VERIFY
  dpsProp:    { m: 0,    at: [-0.85, 0, 0], size: [1.2, 3.0, 3.0] },      // set from fuel
  ascentDry:  { m: 2180, at: [1.30, 0, 0.12], size: [2.6, 4.0, 3.8] },    // 4,804 lb, cabin forward. VERIFY
  apsProp:    { m: 2353, at: [0.95, 0, -0.35], size: [1.0, 2.6, 1.0] },   // 5,187 lb. VERIFY
  rcsProp:    { m: 287,  at: [1.60, 0, -0.60], size: [0.6, 2.0, 0.6] },   // 633 lb. VERIFY
};

export const GEAR = {
  // four legs on the ±Y and ±Z axes; +Z is the forward leg with the ladder and no probe
  attachR: 2.10, attachX: -0.15,     // primary strut upper end. ESTIMATE
  padR: 4.72,                        // footpad centre radius: 9.45 m between opposite pads. VERIFY
  padX: -3.05,                       // footpad ball joint X, gear extended. ESTIMATE
  padDrop: 0.20,                     // ball joint to pad bottom. ESTIMATE
  padRadius: 0.47,                   // footpad 37 in diameter. VERIFY
  probe: 1.73,                       // lunar surface sensing probe below the pad (67 in). VERIFY
  // The primary and secondary struts form a truss; we model its net effect as one crushable
  // stroke along body X (vertical in the LM). 32 in of primary strut stroke at the strut's
  // slant is about 0.6 m vertically. ESTIMATE from the VERIFY figure 32 in.
  stroke: 0.60,
  crush: 28000,                      // N vertical-equivalent honeycomb crush load per leg. ESTIMATE:
                                     //   a 3 m/s level touchdown uses about half the stroke
  breakAxial: 66000,                 // N along a bottomed-out strut before it fails. ESTIMATE
  breakLateral: 26000,               // N across the strut before the leg fails. ESTIMATE
};

export const GROUND = {
  pad:  { k: 1.2e6, zeta: 0.30, mEff: 1900, mu: 0.6 },   // footpad on regolith. ESTIMATE
  hull: { k: 2.0e6, zeta: 0.30, mEff: 3000, mu: 0.5 },   // anything else. ESTIMATE
};

export const LEGS = [
  { name: '+Z', dir: [0, 0, 1], probe: false },   // forward, ladder
  { name: '-Z', dir: [0, 0, -1], probe: true },
  { name: '+Y', dir: [0, 1, 0], probe: true },
  { name: '-Y', dir: [0, -1, 0], probe: true },
].map(l => {
  const attach = [GEAR.attachX, l.dir[1] * GEAR.attachR, l.dir[2] * GEAR.attachR];
  const joint = [GEAR.padX, l.dir[1] * GEAR.padR, l.dir[2] * GEAR.padR];
  const d = [joint[0] - attach[0], joint[1] - attach[1], joint[2] - attach[2]];
  const L = Math.hypot(...d);
  return { ...l, attach, joint, L, axis: d.map(c => c / L) };
});

// RCS: four quads on the diagonals (the DAP's U and V axes, 45° from Y and Z).
// The up/down jet numbers and their quads follow Luminary's jet table (ALLJETS / TYPEPOLY):
//   +U 5,14  -U 6,13  +V 1,10  -V 2,9  +X 2,6,10,14  -X 1,5,9,13
// with U = (Y+Z)/√2 and V = (Z-Y)/√2, which puts quad A (jets 1-4) at +U, B (5-8) at -V,
// C (9-12) at -U and D (13-16) at +V. Each quad also has two sideways jets whose plumes point
// outward along ±Y and ±Z; their numbering here is ours, not Luminary's.
const QUADS = { A: [1, 1], B: [1, -1], C: [-1, -1], D: [-1, 1] };   // [sign Y, sign Z]
const QUAD_JETS = { A: [1, 2, 3, 4], B: [5, 6, 7, 8], C: [9, 10, 11, 12], D: [13, 14, 15, 16] };
export const JETS = [];
for (const [q, [sy, sz]] of Object.entries(QUADS)) {
  const pos = [RCS.quadX, sy * RCS.quadR, sz * RCS.quadR];
  const [down, up, side1, side2] = QUAD_JETS[q];
  JETS.push({ n: down, quad: q, pos, dir: [-1, 0, 0] });          // plume up, pushes -X
  JETS.push({ n: up, quad: q, pos, dir: [1, 0, 0] });             // plume down, pushes +X
  JETS.push({ n: side1, quad: q, pos, dir: [0, -sy, 0] });        // plume outward ±Y
  JETS.push({ n: side2, quad: q, pos, dir: [0, 0, -sz] });        // plume outward ±Z
}
JETS.sort((a, b) => a.n - b.n);
export const jet = n => JETS[n - 1];

// Hull contact points: where the vehicle hits the ground if not on its legs.
const ring = (n, r, x, part, phase = 0) => Array.from({ length: n }, (_, i) => {
  const a = phase + i * 2 * Math.PI / n;
  return { part, p: [x, r * Math.cos(a), r * Math.sin(a)] };
});
export const HULL_DESCENT = [
  ...ring(8, 2.1, -1.68, 'descent', Math.PI / 8),
  ...ring(8, 2.1, 0.0, 'descent', Math.PI / 8),
  ...ring(4, DPS.exitR, DPS.exit, 'nozzle'),
  { part: 'nozzle', p: [DPS.exit, 0, 0] },
];
export const HULL_ASCENT = [
  ...[[0.05, 1], [0.05, -1], [2.55, 1], [2.55, -1]].flatMap(([x, s]) => [
    { part: 'ascent', p: [x, s * 2.0, 1.6] }, { part: 'ascent', p: [x, s * 2.0, -1.9] }]),
  { part: 'ascent', p: [3.4, 0.3, 0] },                                   // top hatch / antennas
  ...Object.entries(QUADS).map(([q, [sy, sz]]) => ({ part: 'quad' + q, p: [RCS.quadX, sy * (RCS.quadR + 0.35), sz * (RCS.quadR + 0.35)] })),
];

// Landing limits used for the "within design limits" line of the report. VERIFY
export const LIMITS = { vVert: 3.05, vHoriz: 1.22, slope: 12 * Math.PI / 180 };
