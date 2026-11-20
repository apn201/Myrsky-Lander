// The digital autopilot the player flies through, modelled on Luminary's manual modes:
//   - hand controller in rate command / attitude hold: stick deflection asks for a rotation rate,
//     centred stick holds the attitude
//   - jet selection by Luminary's table: pitch and roll are flown about the U and V axes
//     (45° from Y and Z) with the up/down jets, yaw with the sideways jets
//   - jet on-times from the rate error and the jets' angular acceleration (in the spirit of
//     TJETLAW), never shorter than the 14 ms minimum pulse
//   - translation controller: RCS translation along X, Y, Z
//   - P66 rate of descent: each click of the ROD switch changes the wanted descent rate by
//     1 ft/s and the computer throttles to hold it; or manual throttle
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import { JETS, RCS, DPS } from './lm.js';
import { massProps, MOON_G } from './physics.js';
import { qmul, qconj, qrot, len, cross } from './vec.js';

const DEG = Math.PI / 180;
export const ROD_CLICK = 0.3048;     // m/s per click (1 ft/s). Pad-loaded RODSCALE. VERIFY
export const TAUROD = 1.5;           // s, P66 time constant. Pad-loaded TAUROD. VERIFY
export const RATE_MAX = 20 * DEG;    // full stick rate. VERIFY
export const RATE_FINE = 4 * DEG;    // fine scale. VERIFY
const RATE_DB = 0.1 * DEG;           // rate dead band (cf. RATEDB1 0.101°/s in Luminary)
const ATT_DB = 0.3 * DEG;            // attitude-hold dead band. VERIFY
const HOLD_GAIN = 0.5;               // 1/s, attitude error to rate
const HOLD_RATE = 2 * DEG;

// Luminary jet table (Q,R-AXES_RCS_AUTOPILOT.agc, ALLJETS / TYPEPOLY)
const U_POS = [5, 14], U_NEG = [6, 13], V_POS = [1, 10], V_NEG = [2, 9];
const X_POS = [2, 6, 10, 14], X_NEG = [1, 5, 9, 13];
const SIDE = JETS.filter(j => j.dir[0] === 0);
const yawTorque = j => cross(j.pos, j.dir)[0];

export function createDap() {
  return { mode: 'P66', rod: null, hold: null, axis: [0, 1, 2].map(() => ({ dir: 0, t: 0 })) };
}

// inp: { pitch, roll, yaw: -1..1 (stick forward / right / nose right are +),
//        tx, ty, tz: -1|0|1 translation along body X (up), Y (right), Z (forward),
//        rodClicks: integer since last call (+ = slower descent), throttle: 0..1 (manual), fine }
export function dapUpdate(d, s, inp, dt) {
  const { m, I } = massProps(s);
  const max = inp.fine ? RATE_FINE : RATE_MAX;
  const active = Math.abs(inp.pitch) + Math.abs(inp.roll) + Math.abs(inp.yaw) > 0.05;

  // rate command / attitude hold
  let wCmd = [-inp.yaw * max, -inp.pitch * max, inp.roll * max];
  if (active) d.hold = null;
  else {
    if (!d.hold && len(s.w) < 1 * DEG) d.hold = s.q.slice();
    if (d.hold) {
      const qe = qmul(qconj(s.q), d.hold);
      const sg = qe[0] < 0 ? -2 : 2;
      wCmd = [qe[1], qe[2], qe[3]].map(e => {
        e *= sg;
        return Math.abs(e) < ATT_DB ? 0 : Math.max(-HOLD_RATE, Math.min(HOLD_RATE, e * HOLD_GAIN));
      });
    } else wCmd = [0, 0, 0];
  }

  // jet on-time per axis from the rate error
  const arm = RCS.quadR;
  const alpha = [2 * RCS.thrust * arm / I[0], 4 * RCS.thrust * arm / I[4], 4 * RCS.thrust * arm / I[8]];
  d.axis.forEach((a, i) => {
    const err = wCmd[i] - s.w[i];
    if (a.t > 0 && Math.sign(err) === a.dir) { a.t -= dt; return; }
    if (Math.abs(err) > RATE_DB) { a.dir = Math.sign(err); a.t = Math.max(RCS.minPulse, Math.min(0.1, Math.abs(err) / alpha[i])) - dt; }
    else { a.dir = 0; a.t = 0; }
  });

  const on = new Set();
  const addAll = l => l.forEach(n => on.add(n));
  const [dX, dY, dZ] = d.axis.map(a => a.dir);
  const U = dY + dZ, V = dZ - dY;
  if (U > 0) addAll(U_POS); else if (U < 0) addAll(U_NEG);
  if (V > 0) addAll(V_POS); else if (V < 0) addAll(V_NEG);
  if (dX) {
    // two sideways jets on opposite quads; switch quad pair if one has failed
    const pick = quads => SIDE.filter(j => quads.includes(j.quad) && Math.sign(yawTorque(j)) === dX);
    let jets = pick(['A', 'C']);
    if (jets.some(j => s.failedJets.has(j.n))) jets = pick(['B', 'D']);
    addAll(jets.map(j => j.n));
  }
  if (inp.tx > 0) addAll(X_POS); else if (inp.tx < 0) addAll(X_NEG);
  if (inp.ty) addAll(SIDE.filter(j => Math.sign(j.dir[1]) === inp.ty).map(j => j.n));
  if (inp.tz) addAll(SIDE.filter(j => Math.sign(j.dir[2]) === inp.tz).map(j => j.n));
  // a quad never fires two opposite jets at once
  for (const j of JETS) for (const k of JETS) {
    if (j.n < k.n && j.quad === k.quad && on.has(j.n) && on.has(k.n) && j.dir.every((c, i) => c === -k.dir[i])) { on.delete(j.n); on.delete(k.n); }
  }
  const jets = new Array(17).fill(false);
  on.forEach(n => { jets[n] = true; });

  // throttle
  let throttle = 0;
  if (s.stage === 'full') {
    if (d.mode === 'P66') {
      // the computer's own estimate of the descent rate (wrong when the landing radar has failed)
      const vyEst = s.vel[1] + (s.nav?.vErr || 0);
      if (d.rod === null) d.rod = vyEst;
      d.rod += (inp.rodClicks || 0) * ROD_CLICK;
      if (s.restarting) throttle = d.lastThrottle ?? s.throttle;    // program alarm restart: guidance skipped, throttle held
      else {
        const up = qrot(s.q, [1, 0, 0])[1];
        const a = (d.rod - vyEst) / TAUROD + MOON_G;
        throttle = Math.min(DPS.maxThrottleFrac, Math.max(DPS.minFrac, m * a / Math.max(0.5, up) / DPS.fRated));
      }
      d.lastThrottle = throttle;
    } else {
      throttle = DPS.minFrac + Math.max(0, Math.min(1, inp.throttle)) * 0.6;   // top of travel = FTP
    }
  }
  return { throttle, jets, wCmd };
}

export function setMode(d, s, mode) {
  d.mode = mode;
  d.rod = mode === 'P66' ? s.vel[1] : null;
}
