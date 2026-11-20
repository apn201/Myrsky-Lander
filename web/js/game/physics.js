// Lunar module rigid-body physics, 6 degrees of freedom.
//   - mass, centre of mass and inertia tensor recomputed from the mass items as propellant burns
//   - descent engine with throttle lag and trim gimbal, ascent engine, 16 RCS jets at their quads
//   - four legs with crushable struts (stroke once, no spring back), footpad friction
//   - hull contact points for everything else, with damage by part
// World: Myrsky's axes, x east, y up, z = -north, origin at Intrepid's spot. The approach is westward (-x),
// as Apollo 12's was. Body: the LM's X up, Y right, Z forward (see lm.js).
// Pure JavaScript, no three.js: the tests run it in Node.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { add, sub, scale, addScaled, dot, cross, len, qrot, qinvrot, qintegrate, qmul, qaxis, qfromBasis, m3v, m3inv } from './vec.js';
import { G0, DPS, APS, RCS, MASS, GEAR, GROUND, LEGS, JETS, HULL_DESCENT, HULL_ASCENT, LIMITS } from './lm.js';

export const MOON_GM = 4.9028e12;           // m³/s²
export const MOON_R = 1737400;              // m, radius Myrsky uses for the site
export const MOON_G = MOON_GM / MOON_R ** 2;
const DEG = Math.PI / 180;
const FLAT = { height: () => 0 };

// Orientation with body X up, body Z (forward) toward the west (world -x), tilted back by pitchBack radians.
export const Q_UPRIGHT = qfromBasis([0, 1, 0], [0, 0, -1], [-1, 0, 0]);
export function attitude(pitchBack = 0, yaw = 0) {
  const q0 = Q_UPRIGHT;
  return qmul(qmul(qaxis([0, 1, 0], -yaw), q0), qaxis([0, 1, 0], pitchBack));
}

export function newState(opts = {}) {
  const s = {
    t: 0,
    phase: 'flying',            // flying | down | ascent | climbing | wreck | lost
    stage: 'full',              // full | ascent
    pos: [450, 0, 0],           // centre of mass, world: 450 m east of the target
    vel: [-14, -5, 0],
    q: attitude(16 * DEG),
    w: [0, 0, 0],               // body rates, rad/s
    dpsFuel: 650,               // kg descent propellant at the start (a game choice)
    apsFuel: MASS.apsProp.m,
    rcsFuel: MASS.rcsProp.m,
    throttle: 0.28,             // actual descent engine thrust, fraction of rated
    engStop: false,             // ENGINE STOP latched
    apsOn: false,
    gimbal: [0, 0],             // trim gimbal about body Y and Z
    jetsOn: new Array(17).fill(false),
    failedJets: new Set(),
    legs: LEGS.map(() => ({ c: 0, bottomed: false, broken: false, contact: false, load: 0 })),
    touching: new Set(),
    partHit: {},                // part -> worst impact speed so far
    events: [],                 // { t, sev, text }
    contactLight: false,
    firstTouch: null,           // velocities at first footpad contact
    gNow: 0, gPeak: 0,
    settle: 0,
    report: null,
    descentPose: null,          // where the descent stage was left at liftoff (or falls, after an abort)
    cg: null,
    // failures a scenario can switch on
    fail: { stuckJet: null, throttleStuck: null },
    isolated: new Set(),        // RCS quads the crew has isolated (A-D)
    nav: { hErr: 0, vErr: 0 },  // navigation error (landing radar failure): estimate minus truth
    ...opts,
  };
  // start with the footpads at the requested height (default 300 m)
  const h = opts.alt ?? 300;
  s.cg = massProps(s).cg;
  s.pos[1] += h - padHeight(s);
  // the descent engine has been firing for ten minutes: its trim gimbal already points the thrust
  // through the centre of mass (an untrimmed engine at full throttle out-torques the RCS)
  if (!opts.gimbal) {
    const d = sub(s.cg, DPS.pivot);
    s.gimbal = [-Math.atan2(d[2], d[0]), Math.atan2(d[1], d[0])];
  }
  return s;
}

// ---------- mass properties ----------
function items(s) {
  const out = [MASS.ascentDry, { ...MASS.apsProp, m: s.apsFuel }, { ...MASS.rcsProp, m: s.rcsFuel }];
  if (s.stage === 'full') out.push(MASS.descentDry, { ...MASS.dpsProp, m: s.dpsFuel });
  return out;
}

export function massProps(s) {
  const list = items(s);
  let m = 0, c = [0, 0, 0];
  for (const it of list) { m += it.m; c = addScaled(c, it.at, it.m); }
  c = scale(c, 1 / m);
  const I = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const it of list) {
    const [sx, sy, sz] = it.size, k = it.m / 12;
    I[0] += k * (sy * sy + sz * sz); I[4] += k * (sx * sx + sz * sz); I[8] += k * (sx * sx + sy * sy);
    const r = sub(it.at, c), r2 = dot(r, r);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) I[i * 3 + j] += it.m * ((i === j ? r2 : 0) - r[i] * r[j]);
  }
  return { m, cg: c, I, Iinv: m3inv(I) };
}

// ---------- geometry helpers ----------
const toWorld = (s, pb) => add(s.pos, qrot(s.q, sub(pb, s.cg)));
const pointVel = (s, pw) => add(s.vel, cross(qrot(s.q, s.w), sub(pw, s.pos)));
export function padJointBody(leg, st) { return [leg.joint[0] + st.c, leg.joint[1], leg.joint[2]]; }
export function padBottomWorld(s, i) { return add(toWorld(s, padJointBody(LEGS[i], s.legs[i])), [0, -GEAR.padDrop, 0]); }

// Height of the lowest working footpad above the ground (what the altimeter shows).
export function padHeight(s, world = FLAT) {
  if (s.stage !== 'full') return lowestHull(s, world);
  let h = Infinity;
  LEGS.forEach((l, i) => { if (!s.legs[i].broken) { const p = padBottomWorld(s, i); h = Math.min(h, p[1] - world.height(p[0], p[2])); } });
  return h === Infinity ? lowestHull(s, world) : h;
}
function lowestHull(s, world) {
  let h = Infinity;
  for (const pt of hull(s)) { const p = toWorld(s, pt.p); h = Math.min(h, p[1] - world.height(p[0], p[2])); }
  return h;
}
const hull = s => s.stage === 'full' ? [...HULL_DESCENT, ...HULL_ASCENT] : HULL_ASCENT;

export const tilt = s => Math.acos(Math.max(-1, Math.min(1, qrot(s.q, [1, 0, 0])[1])));

// Ground reaction at a point: spring-damper along the local surface normal, capped viscous friction.
export function groundNormal(world, x, z) {
  if (!world.slope) return [0, 1, 0];
  const e = 0.5, hx = (world.height(x + e, z) - world.height(x - e, z)) / (2 * e), hz = (world.height(x, z + e) - world.height(x, z - e)) / (2 * e);
  const l = Math.hypot(hx, 1, hz);
  return [-hx / l, 1 / l, -hz / l];
}
function groundForce(pw, vw, g, world) {
  const dh = world.height(pw[0], pw[2]) - pw[1];
  if (dh <= 0) return null;
  const n = groundNormal(world, pw[0], pw[2]);
  const p = dh * n[1];
  const vn = dot(vw, n);
  const c = 2 * g.zeta * Math.sqrt(g.k * g.mEff);
  const fn = Math.max(0, g.k * p - c * vn);
  const vt = addScaled(vw, n, -vn), sp = len(vt);
  const ft = sp > 1e-6 ? scale(vt, -Math.min(g.mu * fn / sp, 4e4)) : [0, 0, 0];
  return { F: addScaled(ft, n, fn), p, vn, n };
}

function log(s, sev, text) { s.events.push({ t: s.t, sev, text }); }

// ---------- one step ----------
// ctl = { throttle: fraction of rated thrust wanted (0 = none), jets: bool[17] }
export function step(s, ctl, dt, world = FLAT) {
  const mp = massProps(s);
  if (s.cg) s.pos = add(s.pos, qrot(s.q, sub(mp.cg, s.cg)));   // geometry stays put as the CG moves
  s.cg = mp.cg;
  const { m, cg, I, Iinv } = mp;

  let Fw = [0, -MOON_G * m, 0];            // world-frame force
  let Fb = [0, 0, 0], Tb = [0, 0, 0];      // body-frame non-gravity force and torque about the CG
  const bodyForce = (f, at) => { Fb = add(Fb, f); Tb = add(Tb, cross(sub(at, cg), f)); };

  // descent engine
  if (s.stage === 'full') {
    let want = ctl.throttle > 0 ? Math.max(DPS.minFrac, ctl.throttle) : 0;
    if (want > DPS.maxThrottleFrac) want = DPS.fFTP / DPS.fRated;      // past 65 %: full throttle position
    if (s.fail.throttleStuck != null && want > 0) want = s.fail.throttleStuck;
    if (s.engStop || s.dpsFuel <= 0 || s.dpsFailed) want = 0;
    s.throttle += (want - s.throttle) * Math.min(1, dt / DPS.lag);
    if (s.throttle < 0.01 && want === 0) s.throttle = 0;
    const F = s.throttle * DPS.fRated;
    if (F > 0) {
      // trim gimbal drives the thrust line toward the centre of mass
      const d = sub(cg, DPS.pivot);
      const ideal = [-Math.atan2(d[2], d[0]), Math.atan2(d[1], d[0])];
      for (let i = 0; i < 2; i++) {
        const e = ideal[i] - s.gimbal[i], stepMax = DPS.gimbalRate * dt;
        s.gimbal[i] = Math.max(-DPS.gimbalMax, Math.min(DPS.gimbalMax, s.gimbal[i] + Math.max(-stepMax, Math.min(stepMax, e))));
      }
      const [gy, gz] = s.gimbal;
      const dir = [Math.cos(gy) * Math.cos(gz), Math.sin(gz), -Math.sin(gy) * Math.cos(gz)];
      bodyForce(scale(dir, F), DPS.pivot);
      s.dpsFuel = Math.max(0, s.dpsFuel - F / DPS.vex * dt);
    }
  }
  // ascent engine
  if (s.stage === 'ascent' && s.apsOn && s.apsFuel > 0) {
    bodyForce([APS.thrust, 0, 0], APS.point);
    s.apsFuel = Math.max(0, s.apsFuel - APS.thrust / APS.vex * dt);
  }
  // reaction control jets
  const flow = RCS.thrust / (RCS.isp * G0);
  for (const j of JETS) {
    const on = (!!ctl.jets?.[j.n] || s.fail.stuckJet === j.n) && !s.failedJets.has(j.n) && !s.isolated.has(j.quad) && s.rcsFuel > 0;
    s.jetsOn[j.n] = on;
    if (on) { bodyForce(scale(j.dir, RCS.thrust), j.pos); s.rcsFuel = Math.max(0, s.rcsFuel - flow * dt); }
  }

  // ground contact: footpads through the crushable struts
  let grounded = false;
  if (s.stage === 'full') {
    LEGS.forEach((leg, i) => {
      const st = s.legs[i];
      st.contact = false; st.load = 0;
      if (st.broken) return;
      const jw = toWorld(s, padJointBody(leg, st));
      if (leg.probe && !s.contactLight) {
        const tip = toWorld(s, addScaled(padJointBody(leg, st), [1, 0, 0], -(GEAR.padDrop + GEAR.probe)));
        if (tip[1] <= world.height(tip[0], tip[2])) { s.contactLight = true; log(s, 0, 'CONTACT LIGHT'); }
      }
      const pw = add(jw, [0, -GEAR.padDrop, 0]);
      // the pad moves with the body minus the strut shortening: while the honeycomb crushes
      // the pad stays put on the ground
      const upW = qrot(s.q, [1, 0, 0]);
      const vPad = addScaled(pointVel(s, pw), upW, st.cdot || 0);
      st.cdot = 0;
      const g = groundForce(pw, vPad, GROUND.pad, world);
      if (!g) return;
      st.contact = grounded = true;
      if (!s.firstTouch) {
        const hv = Math.hypot(s.vel[0], s.vel[2]);
        s.firstTouch = { vVert: -s.vel[1], vHoriz: hv, tilt: tilt(s), t: s.t };
        log(s, 0, `TOUCHDOWN ${(-s.vel[1]).toFixed(2)} m/s down, ${hv.toFixed(2)} m/s across`);
      }
      let F = g.F;
      let fb = qinvrot(s.q, F);
      const axial = fb[0];                                      // load along the crush stroke (body X)
      if (!st.bottomed && axial > GEAR.crush) {
        // honeycomb crushes: the strut shortens and the load stays at the crush level
        // pad held still on the ground, strut shortening as fast as the body closes on the pad
        const k = GEAR.crush / axial;
        st.cdot = Math.max(0, -dot(pointVel(s, pw), upW));
        st.c = Math.min(GEAR.stroke, st.c + st.cdot * dt);
        F = scale(F, k); fb = scale(fb, k);
        if (st.c >= GEAR.stroke) { st.bottomed = true; log(s, 2, `LEG ${leg.name} BOTTOMED OUT: all ${(GEAR.stroke * 100).toFixed(0)} cm of strut stroke used`); }
      }
      const ax2 = fb[0];
      // the secondary struts carry the load across the primary strut; what breaks a leg sideways
      // is the horizontal (sliding) force at the pad
      const lateral = Math.hypot(F[0], F[2]);
      if ((st.bottomed && ax2 > GEAR.breakAxial) || lateral > GEAR.breakLateral) {
        st.broken = true;
        log(s, 3, `LEG ${leg.name} FAILED (${lateral > GEAR.breakLateral ? 'side load' : 'overload after bottoming'})`);
        return;
      }
      st.load = ax2;
      Fw = add(Fw, F);
      Tb = add(Tb, cross(qinvrot(s.q, sub(pw, s.pos)), fb));
    });
  }

  // hull points
  const nowTouching = new Set();
  hull(s).forEach((pt, idx) => {
    const pw = toWorld(s, pt.p);
    const g = groundForce(pw, pointVel(s, pw), GROUND.hull, world);
    if (!g) return;
    grounded = true;
    const key = pt.part + idx;
    nowTouching.add(key);
    if (!s.touching.has(key)) hit(s, pt.part, Math.max(0, -g.vn));
    Fw = add(Fw, g.F);
    Tb = add(Tb, cross(qinvrot(s.q, sub(pw, s.pos)), qinvrot(s.q, g.F)));
  });
  s.touching = nowTouching;

  // crew load: specific force (everything except gravity), smoothed over about 50 ms
  const contactW = add(Fw, [0, MOON_G * m, 0]);
  const specific = len(add(qrot(s.q, Fb), contactW)) / m / G0;
  s.gNow += (specific - s.gNow) * Math.min(1, dt / 0.05);
  s.gPeak = Math.max(s.gPeak, s.gNow);

  // integrate (semi-implicit Euler)
  Fw = add(Fw, qrot(s.q, Fb));
  s.vel = addScaled(s.vel, Fw, dt / m);
  s.pos = addScaled(s.pos, s.vel, dt);
  const Iw = m3v(I, s.w);
  const wdot = m3v(Iinv, sub(Tb, cross(s.w, Iw)));
  s.w = addScaled(s.w, wdot, dt);
  s.q = qintegrate(s.q, s.w, dt);
  s.t += dt;
  if (s.descentPose?.vel) fallDescent(s, dt, world);
  if (s.debris) moveDebris(s, dt, world);

  phaseLogic(s, grounded, m, world, dt);
  return s;
}

// ---------- damage ----------
function worse(s, part, v) { const was = s.partHit[part] ?? 0; s.partHit[part] = Math.max(was, v); return was; }

function hit(s, part, v) {
  const was = worse(s, part, v);
  const crossed = lim => v >= lim && was < lim;
  if (part === 'nozzle') {
    if (crossed(0.02)) {
      log(s, 1, 'DESCENT ENGINE NOZZLE HIT THE GROUND (the extension is built to crumple)');
      if (s.throttle > 0.05) { s.dpsFailed = true; log(s, 2, 'DESCENT ENGINE SHUT DOWN: nozzle blocked'); }
    }
  } else if (part === 'descent') {
    if (crossed(2.5)) log(s, 2, `DESCENT STAGE STRUCTURE DAMAGED (hit at ${v.toFixed(1)} m/s)`);
    else if (crossed(0.4)) log(s, 1, `DESCENT STAGE SCRAPED THE GROUND (${v.toFixed(1)} m/s)`);
  } else if (part.startsWith('quad')) {
    const q = part.slice(4);
    if (crossed(0.15)) {
      for (const j of JETS) if (j.quad === q) s.failedJets.add(j.n);
      log(s, 2, `RCS QUAD ${q} DESTROYED: its 4 jets are lost`);
    }
  } else if (part === 'ascent') {
    if (crossed(3.5)) { log(s, 4, `ASCENT STAGE CABIN BREACHED (${v.toFixed(1)} m/s): crew lost`); s.crewLost = true; }
    else if (crossed(0.3)) log(s, 2, `ASCENT STAGE HIT THE GROUND (${v.toFixed(1)} m/s)`);
  }
}

function phaseLogic(s, grounded, m, world, dt) {
  if (s.gNow > 35 && !s.crewLost) { s.crewLost = true; log(s, 4, `CREW LOST: ${s.gNow.toFixed(0)} g impact`); }
  // a violent impact fails the stage interface: the ascent stage tears off
  if (s.stage === 'full' && !s.brokeUp && (s.gNow > 12 || (s.partHit.descent ?? 0) > 4)) breakUp(s);
  if (s.crewLost && s.phase !== 'lost') {
    s.lostAt ??= s.t;
    if (s.t - s.lostAt > 3) { s.phase = 'lost'; s.report = report(s, world); }   // let the wreck tumble first
    return;
  }

  const still = len(s.vel) < 0.05 && len(s.w) < 0.3 * DEG;
  const thrusting = (s.stage === 'full' && s.throttle * DPS.fRated > 0.2 * m * MOON_G) || (s.stage === 'ascent' && s.apsOn && s.apsFuel > 0);
  if ((s.phase === 'flying' || s.phase === 'ascent' || s.phase === 'wreck') && grounded && still && !thrusting) {
    s.settle += dt;
    if (s.settle > 1.5) { s.phase = s.stage === 'full' || s.brokeUp ? 'down' : 'lost'; s.report = report(s, world); }
  } else s.settle = 0;

  if (s.phase === 'ascent' && s.pos[1] - world.height(s.pos[0], s.pos[2]) > 300 && s.vel[1] > 0) {
    s.phase = 'climbing';
    log(s, 0, 'ASCENT STAGE CLIMBING THROUGH 300 m');
    s.report = report(s, world);
  }
}

// What happened, in order of severity. sev: 0 fine, 1 minor, 2 damaged, 3 severe, 4 crew lost.
export function report(s, world = FLAT) {
  const lines = [];
  const put = (sev, text) => lines.push({ sev, text });
  const ft = s.firstTouch;
  if (ft) {
    const within = ft.vVert <= LIMITS.vVert && ft.vHoriz <= LIMITS.vHoriz;
    put(within ? 0 : 1, `Touchdown ${ft.vVert.toFixed(2)} m/s down, ${ft.vHoriz.toFixed(2)} m/s across (design limits ${LIMITS.vVert} and ${LIMITS.vHoriz})`);
  }
  if (s.stage === 'full') {
    s.legs.forEach((st, i) => {
      const n = LEGS[i].name;
      if (st.broken) put(3, `Leg ${n}: failed`);
      else if (st.bottomed) put(2, `Leg ${n}: strut bottomed out`);
      else if (st.c > 0.005) put(st.c > GEAR.stroke * 0.6 ? 1 : 0, `Leg ${n}: strut crushed ${(st.c * 100).toFixed(0)} of ${(GEAR.stroke * 100).toFixed(0)} cm`);
    });
    const tl = tilt(s) / DEG;
    const terrainOnly = world.terrain ? { height: world.terrain, slope: true } : world;   // slope of the ground, not of a boulder
    const sl = Math.acos(groundNormal(terrainOnly, s.pos[0], s.pos[2])[1]) / DEG;
    put(sl > 12 ? 1 : 0, `Ground slope under the lander ${sl.toFixed(1)}° (design limit 12°)`);
    put(tl > 60 ? 3 : tl > 30 ? 2 : tl > 12 ? 1 : 0, `Resting tilt ${tl.toFixed(1)}°${tl > 12 ? ': the ascent stage will leave at an angle' : ''}`);
  }
  for (const e of s.events) if (e.sev > 0 && !e.text.startsWith('LEG')) put(e.sev, e.text.charAt(0) + e.text.slice(1).toLowerCase());
  const g = s.gPeak;
  put(g > 35 ? 4 : g > 20 ? 3 : g > 10 ? 2 : g > 4 ? 1 : 0,
    `Peak load on the crew ${g.toFixed(1)} g${g > 20 ? ': serious injuries' : g > 10 ? ': crew injured' : g > 4 ? ': hard jolt, crew shaken' : ''}`);
  const quadsLost = new Set([...s.failedJets].map(n => JETS[n - 1].quad)).size;
  if (s.stage === 'full') put(0, `Propellant left: descent ${s.dpsFuel.toFixed(0)} kg, RCS ${s.rcsFuel.toFixed(0)} kg`);
  put(0, `${Math.hypot(s.pos[0], s.pos[2]).toFixed(0)} m from the Apollo 12 landing spot`);
  const worst = Math.max(0, ...lines.map(l => l.sev));
  if (s.brokeUp && !s.crewLost) put(3, `Ascent stage torn off and came to rest tilted ${(tilt(s) / DEG).toFixed(0)}°; cabin ${s.partHit.ascent >= 0.3 ? 'dented but holding pressure' : 'intact'}`);
  const verdict = s.crewLost ? 'CREW LOST'
    : s.brokeUp && s.phase !== 'climbing' ? 'VEHICLE BROKE UP — CREW ALIVE'
    : s.phase === 'climbing' ? 'ASCENT UNDER WAY'
    : s.stage === 'ascent' ? 'ASCENT FAILED'
    : ['GOOD LANDING', 'HARD LANDING', 'LANDED WITH DAMAGE', 'SEVERE DAMAGE', 'CREW LOST'][worst];
  const canLift = !s.crewLost && !(s.partHit.ascent >= 2) && (s.stage === 'full' || (s.brokeUp && tilt(s) < 50 * DEG && s.apsFuel > 0));
  return { verdict, worst, lines: lines.sort((a, b) => b.sev - a.sev), canLift, quadsLost };
}

// ---------- liftoff ----------
export function liftoff(s) {
  if (s.phase !== 'down' || !s.report?.canLift) return false;
  if (s.brokeUp) {                                    // already separated: just light the ascent engine
    s.apsOn = true; s.phase = 'ascent'; s.settle = 0; s.report = null;
    log(s, 0, 'ASCENT ENGINE ON from the wreck');
    return true;
  }
  return stage(s, false);
}

// ABORT STAGE in flight: the descent stage is cut loose and falls, the ascent engine fires at once.
export function abortStage(s) {
  if (s.stage !== 'full' || s.crewLost || !(s.phase === 'flying' || s.phase === 'down')) return false;
  if (s.phase === 'down') return liftoff(s);
  return stage(s, true);
}

function stage(s, inFlight) {
  const origin = sub(s.pos, qrot(s.q, s.cg));          // body origin in the world
  const vOrigin = s.vel.slice();
  s.descentPose = { origin, q: s.q.slice(), legs: s.legs.map(l => ({ ...l })), vel: inFlight ? vOrigin : null };
  s.stage = 'ascent';
  const cgA = massProps(s).cg;
  s.cg = cgA;
  s.pos = add(origin, qrot(s.q, cgA));
  if (!inFlight) { s.vel = [0, 0, 0]; s.w = [0, 0, 0]; }
  s.apsOn = true; s.throttle = 0;
  s.phase = 'ascent'; s.settle = 0; s.report = null;
  s.touching = new Set();
  s.ignition = s.t;
  if (!inFlight) {
    // the ascent engine's exhaust is almost invisible in vacuum; what the Apollo 15-17 TV showed at
    // liftoff was a burst of shredded foil and insulation blown off the descent stage
    let seed = Math.floor(s.t * 977) + 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const top = add(origin, qrot(s.q, [0.1, 0, 0]));
    s.debris = (s.debris || []).concat(Array.from({ length: 60 }, () => {
      const a = rnd() * Math.PI * 2, el = 0.05 + rnd() * 0.6, sp = 3 + rnd() * 14;
      return {
        kind: 'foil', size: 0.08 + rnd() * 0.3,
        p: add(top, [Math.cos(a) * (0.5 + rnd() * 1.6), rnd() * 0.3, Math.sin(a) * (0.5 + rnd() * 1.6)]),
        v: [Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp],
        ax: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], ang: rnd() * 6.28, spin: (rnd() - 0.5) * 30, rest: false,
      };
    }));
  }
  log(s, inFlight ? 2 : 0, inFlight ? 'ABORT STAGE: descent stage jettisoned, ascent engine on' : 'ABORT STAGE / ASCENT ENGINE ON');
  return true;
}

// Structural breakup on a violent impact: the stage interface fails, the ascent stage is flung off and
// tumbles (simulated as its own rigid body, hull contacts and cabin breach as usual), the descent stage
// settles, and pieces of foil, panels and struts fly out on ballistic paths.
function breakUp(s) {
  s.brokeUp = true;
  const v0 = s.vel.slice();
  let seed = Math.floor(s.t * 1000) + 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  stage(s, true);
  s.apsOn = false;
  s.phase = 'wreck';
  s.events.pop();
  log(s, 3, 'STRUCTURE FAILED: ascent stage torn off the descent stage');
  s.descentPose.vel = [v0[0] * 0.25, Math.min(0, v0[1]) * 0.1, v0[2] * 0.25];
  s.vel = [v0[0] * 0.7 + (rnd() - 0.5) * 2, Math.abs(v0[1]) * 0.22 + 1.2, v0[2] * 0.4];
  s.w = [(rnd() - 0.5) * 0.4, (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 1.0), (rnd() - 0.5) * 0.4];
  const at = add(s.descentPose.origin, [0, -0.6, 0]);
  const kinds = ['foil', 'foil', 'foil', 'panel', 'strut', 'box'];
  s.debris = Array.from({ length: 28 }, (_, i) => {
    const a = rnd() * Math.PI * 2, el = 0.15 + rnd() * 1.0, sp = 2 + rnd() * 9;
    return {
      kind: kinds[i % kinds.length], size: 0.25 + rnd() * 0.9,
      p: add(at, [Math.cos(a) * 1.8, rnd() * 1.4, Math.sin(a) * 1.8]),
      v: [Math.cos(a) * Math.cos(el) * sp + v0[0] * 0.5, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp * 0.5],
      ax: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], ang: rnd() * 6.28, spin: (rnd() - 0.5) * 20, rest: false,
    };
  });
  s.burst = s.t;     // for the dust burst
}

function moveDebris(s, dt, world) {
  for (const d of s.debris) {
    if (d.rest) continue;
    d.v[1] -= MOON_G * dt;
    d.p = addScaled(d.p, d.v, dt);
    d.ang += d.spin * dt;
    const g = world.height(d.p[0], d.p[2]) + d.size * 0.12;
    if (d.p[1] < g) {
      d.p[1] = g;
      d.v = [d.v[0] * 0.55, -d.v[1] * 0.25, d.v[2] * 0.55];
      d.spin *= 0.5;
      if (len(d.v) < 0.4) d.rest = true;
    }
  }
}

// the jettisoned descent stage: ballistic until its footpads (or its body) reach the ground
function fallDescent(s, dt, world) {
  const d = s.descentPose;
  d.vel[1] -= MOON_G * dt;
  d.origin = addScaled(d.origin, d.vel, dt);
  let low = Infinity;
  for (const leg of LEGS) {
    const p = add(d.origin, qrot(d.q, padJointBody(leg, { c: 0 })));
    low = Math.min(low, p[1] - GEAR.padDrop - world.height(p[0], p[2]));
  }
  if (low <= 0) {
    const v = -d.vel[1];
    d.origin[1] -= low;
    d.vel = null;
    log(s, 0, `DESCENT STAGE HIT THE GROUND AT ${v.toFixed(1)} m/s`);
    if (v > 4) d.legs.forEach(l => { l.c = GEAR.stroke; l.bottomed = true; });
    else d.legs.forEach(l => { l.c = Math.min(GEAR.stroke, v * 0.12); });
  }
}
