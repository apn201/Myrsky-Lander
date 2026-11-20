// Flight director and advisories: what the player is told to do.
// A reference descent (rate of descent falling with height, horizontal speed that brings you to the
// target and dies away near the ground) is turned into two needle errors, like the error needles on an
// attitude indicator:
//   leanErr  how much more to lean toward +x (east). Press the arrow toward the dot.
//   vertErr  P66: how many ft/s of ROD clicks are missing (+ = click up); manual: throttle missing.
// Advisories say when the P66 throttle limit cannot stop you in time and manual full throttle can.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { padHeight, massProps, MOON_G } from './physics.js';
import { DPS } from './lm.js';
import { qrot } from './vec.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const TARGET = [0, 0];    // Intrepid's touchdown spot (x, z)
const VTD = 0.6;                 // aimed touchdown rate, m/s

const FLAT = { height: () => 0 };
export function guidance(s, dap, world = FLAT) {
  const h = Math.max(0, padHeight(s, world));
  const { m } = massProps(s);
  const up = qrot(s.q, [1, 0, 0]);
  const lean = Math.asin(clamp(up[0], -1, 1));          // + = leaning toward +x
  const cos = Math.max(0.3, up[1]);
  const vy = s.vel[1], vx = s.vel[0];
  const surf = surface(world, s.pos[0], s.pos[2]);
  // aim point: the target, or the nearest clear ground when the target is out of reach down low
  let aimX = TARGET[0];
  if (padHeight(s, world) < 60 && Math.abs(TARGET[0] - s.pos[0]) > 120) {
    // pick once, from where the lander can stop (about 1 m/s² of braking), and keep it while it stays clear
    if (!s.aim || !surface(world, s.aim.x, s.pos[2]).ok) {
      const stopX = s.pos[0] + s.vel[0] * Math.abs(s.vel[0]) / 2;
      s.aim = { t: s.t, x: clearSpot(world, stopX, s.pos[2]) ?? stopX };
    }
    aimX = s.aim.x;
  }
  const dx = aimX - s.pos[0];

  // come down slower while the target is still far, so the approach does not run out of height first
  const far = clamp(1 - (Math.abs(dx) - 15) / 120, 0.2, 1);
  const wantVy = -Math.max(VTD, clamp(0.08 * h, VTD, 8) * far);
  const cap = Math.min(10, 0.06 * h + 0.3 + (h > 30 ? 0.02 * Math.abs(dx) : 0));
  const wantVx = clamp(0.03 * dx, -cap, cap);
  // near the ground stay nearly level, unless still sliding: then killing the drift comes first
  const sliding = Math.abs(vx - wantVx) > 1.2;
  const leanMax = h < 4 ? (sliding ? 8 : 3) * DEG : h < 12 ? (sliding ? 12 : 6) * DEG : 20 * DEG;
  const leanWant = clamp((wantVx - vx) * 0.08, -leanMax, leanMax);
  // rate term, as in a flight director: the dot comes back toward the centre while the lander is still
  // turning, so letting go of the key when it is centred does not overshoot
  const wW = qrot(s.q, s.w);
  const leanRate = -wW[2] / Math.max(0.3, Math.cos(lean));
  const leanErr = leanWant - lean - 0.9 * leanRate;

  // vertical: what the engine has to do to reach the aimed touchdown rate at the ground
  const brake = vy < -VTD ? (vy * vy - VTD * VTD) / (2 * Math.max(0.3, h - 0.3)) : 0;
  const fNeed = m * (MOON_G + brake) / cos;
  const fP66 = DPS.maxThrottleFrac * DPS.fRated, fFTP = DPS.fFTP;
  const manual = dap.mode !== 'P66';
  const thrWant = clamp(m * (MOON_G + (wantVy - vy) / 1.5) / cos / DPS.fRated, 0, 1);
  const vertErr = manual
    ? (clamp((thrWant - DPS.minFrac) / 0.6, 0, 1) - (s.manualThrottle ?? 0)) / 0.25
    : (wantVy - (dap.rod ?? vy)) / (3 * 0.3048);

  const adv = [];
  const say = (lvl, text) => adv.push({ lvl, text });
  if (s.stage === 'full' && s.phase === 'flying') {
    if (s.contactLight && !s.engStop) say(2, 'CONTACT — ENGINE STOP (SPACE)');
    else if (s.dpsFuel <= 0) say(3, 'NO DESCENT PROPELLANT — LEVEL THE LANDER');
    else if (fNeed > fP66 && h > 0.5) {
      if (fNeed <= fFTP * 0.97) say(manual ? 2 : 3, manual ? 'FULL THROTTLE (↑)' : 'P66 CANNOT STOP YOU — MANUAL THROTTLE: M, THEN FULL ↑');
      else {
        const a = fFTP * cos / m - MOON_G;
        const vi = Math.sqrt(Math.max(0, vy * vy - 2 * Math.max(0, a) * h));
        say(3, `TOO FAST TO STOP — IMPACT ABOUT ${vi.toFixed(1)} m/s: ${manual ? 'FULL THROTTLE, ' : 'M + FULL ↑, '}LEVEL OUT`);
      }
    } else if (manual && fNeed < fP66 * 0.8 && vy > wantVy - 1) say(1, 'P66 CAN TAKE OVER AGAIN (M)');
    if (h < 12 && Math.abs(lean) > 7 * DEG) say(2, 'LEVEL THE LANDER');
    if (h < 40 && Math.abs(vx - wantVx) > 2) say(1, `TOO FAST ${vx - wantVx > 0 ? 'EAST' : 'WEST'}WARD — FOLLOW THE DOT`);
    if (h < 60 && Math.abs(TARGET[0] - s.pos[0]) > 120) say(1, 'TARGET OUT OF REACH — FLY TO CLEAR GROUND');
    if (h < 70 && h > 1 && !surf.ok) {
      const spot = clearSpot(world, s.pos[0], s.pos[2]);
      const where = spot === null ? 'NO CLEAR GROUND NEARBY' : `CLEAR ${Math.abs(spot - s.pos[0]).toFixed(0)} m ${spot > s.pos[0] ? 'EAST ▶' : '◀ WEST'}`;
      say(h < 25 ? 2 : 1, `${surf.rock > 0.35 ? `BOULDERS ${surf.rock.toFixed(1)} m` : `SLOPE ${surf.slope.toFixed(0)}°`} BELOW — ${where}`);
    }
  }
  return { h, lean, leanWant, leanErr, wantVy, wantVx, vertErr, adv, dx, surf, aimX };
}

// The ground a lander would sit on at (x, z): the highest rock inside the footprint and the slope
// across the footpads. Rocks over 0.35 m threaten a footpad or the nozzle (0.5 m clearance); the LM's
// design slope limit was 12°.
export function surface(world, x, z) {
  const t = world.terrain ?? world.height;
  const R = 4.72;
  const sx = (t(x + R, z) - t(x - R, z)) / (2 * R), sz = (t(x, z + R) - t(x, z - R)) / (2 * R);
  const slope = Math.atan(Math.hypot(sx, sz)) / DEG;
  const rock = world.maxRock ? world.maxRock(x, z, 5.5) : 0;
  return { rock, slope, ok: rock <= 0.35 && slope <= 9 };
}

// nearest x (same z) within 80 m where the surface is fine, or null
export function clearSpot(world, x, z) {
  for (let d = 0; d <= 80; d += 2) for (const sg of [1, -1]) {
    const xx = x + sg * d;
    if (surface(world, xx, z).ok) return xx;
    if (d === 0) break;
  }
  return null;
}
