// Sky geometry at the Apollo 12 site: Sun, Earth and star directions for any instant.
// Uses Astronomy Engine (Don Cross, MIT licence), loaded as the global `Astronomy`.
// Frames: EQJ (J2000 equatorial) -> Moon body-fixed (IAU rotation model) -> local East-North-Up.
// Code written with an AI assistant (Claude Code, Anthropic), Nov 2026.

const A = (typeof window !== 'undefined' ? window : globalThis).Astronomy;
const D2R = Math.PI / 180;
export const SITE = { lat: -3.0128, lon: 336.5781, radiusKm: 1737.4 - 1.422 }; // LROC (Wagner et al. 2017)
const AU_KM = 149597870.7;

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// rows of the matrix EQJ -> ENU
export function enuBasis(date) {
  const t = A.MakeTime((date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000);
  const ax = A.RotationAxis(A.Body.Moon, t);
  const ra = ax.ra * 15 * D2R, dec = ax.dec * D2R, W = ax.spin * D2R;
  const Z = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const Q = [-Math.sin(ra), Math.cos(ra), 0];
  const ZQ = cross(Z, Q);
  const X = [Math.cos(W) * Q[0] + Math.sin(W) * ZQ[0], Math.cos(W) * Q[1] + Math.sin(W) * ZQ[1], Math.cos(W) * Q[2] + Math.sin(W) * ZQ[2]];
  const Y = cross(Z, X);
  const la = SITE.lat * D2R, lo = SITE.lon * D2R;
  // site basis in body frame
  const upB = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const eaB = [-Math.sin(lo), Math.cos(lo), 0];
  const noB = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  // body -> EQJ: v_eqj = X*b0 + Y*b1 + Z*b2
  const toEqj = (b) => [X[0] * b[0] + Y[0] * b[1] + Z[0] * b[2], X[1] * b[0] + Y[1] * b[1] + Z[1] * b[2], X[2] * b[0] + Y[2] * b[1] + Z[2] * b[2]];
  return { east: toEqj(eaB), north: toEqj(noB), up: toEqj(upB), t };
}

export function toENU(basis, v) { return [dot(basis.east, v), dot(basis.north, v), dot(basis.up, v)]; }

export function azEl(enu) {
  const n = norm(enu);
  let az = Math.atan2(n[0], n[1]) / D2R; if (az < 0) az += 360;
  return { az, el: Math.asin(n[2]) / D2R };
}

// Everything the renderer needs for one instant.
export function skyState(date) {
  const B = enuBasis(date);
  const t = B.t;
  const moon = A.GeoMoon(t); // EQJ, AU, Earth -> Moon
  const m = [moon.x, moon.y, moon.z];
  const siteEqj = B.up.map((c) => c * SITE.radiusKm / AU_KM);
  const sunG = A.GeoVector(A.Body.Sun, t, true);
  const sunV = [sunG.x - m[0] - siteEqj[0], sunG.y - m[1] - siteEqj[1], sunG.z - m[2] - siteEqj[2]];
  const earthV = [-m[0] - siteEqj[0], -m[1] - siteEqj[1], -m[2] - siteEqj[2]];
  const earthDistKm = Math.hypot(...earthV) * AU_KM;
  const sun = norm(toENU(B, sunV));
  const earth = norm(toENU(B, earthV));
  // Earth's own orientation: Earth-fixed -> EQD (GAST) -> EQJ -> ENU
  const gast = A.SiderealTime(t) * 15 * D2R;
  const rot = A.Rotation_EQD_EQJ(t);
  const efToEqd = (v) => [Math.cos(gast) * v[0] - Math.sin(gast) * v[1], Math.sin(gast) * v[0] + Math.cos(gast) * v[1], v[2]];
  const eqdToEqj = (v) => { const r = A.RotateVector(rot, new A.Vector(v[0], v[1], v[2], t)); return [r.x, r.y, r.z]; };
  const ef = (v) => toENU(B, eqdToEqj(efToEqd(v)));
  const earthAxes = { x: ef([1, 0, 0]), y: ef([0, 1, 0]), z: ef([0, 0, 1]) };
  // Earth phase as seen from the site: fraction of the disc lit
  const cosPhase = -dot(sun, earth); // angle Sun-Earth seen from Moon
  const earthLit = (1 - dot(sun, earth)) / 2; // 1 = full Earth
  return {
    date, sun, earth, earthDistKm, earthAxes, earthLit, basis: B,
    sunAzEl: azEl(sun), earthAzEl: azEl(earth),
    earthAngularRadius: Math.asin(6371 / earthDistKm),
  };
}

// Is Earth covering the Sun (a lunar eclipse seen from the Moon)? Returns 0..1 covered fraction (approx).
export function sunCovered(s) {
  const sep = Math.acos(Math.min(1, Math.max(-1, dot(s.sun, s.earth))));
  const rs = 0.2666 * D2R, re = s.earthAngularRadius * 1.02; // thin atmosphere
  if (sep >= rs + re) return 0;
  if (sep <= re - rs) return 1;
  return Math.min(1, Math.max(0, (rs + re - sep) / (2 * rs)));
}

export function eqjFromRaDec(raDeg, decDeg) {
  const ra = raDeg * D2R, dec = decDeg * D2R;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}
