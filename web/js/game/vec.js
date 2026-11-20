// Small vector, quaternion and 3x3 matrix helpers on plain arrays (no three.js, runs in Node).
// Quaternions are [w, x, y, z]. Matrices are row-major arrays of 9.
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
export const qconj = q => [q[0], -q[1], -q[2], -q[3]];
export const qnorm = q => { const l = Math.hypot(...q) || 1; return q.map(c => c / l); };
// rotate vector v by unit quaternion q
export function qrot(q, v) {
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export const qinvrot = (q, v) => qrot(qconj(q), v);
export function qaxis(axis, angle) {
  const s = Math.sin(angle / 2), a = norm(axis);
  return [Math.cos(angle / 2), a[0] * s, a[1] * s, a[2] * s];
}
// advance q by body-frame angular velocity w over dt
export function qintegrate(q, w, dt) {
  const a = len(w) * dt;
  if (a < 1e-12) return q;
  return qnorm(qmul(q, qaxis(w, a)));
}
// quaternion from a rotation matrix given by its columns (images of the body axes)
export function qfromBasis(c0, c1, c2) {
  const m00 = c0[0], m11 = c1[1], m22 = c2[2], tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [s / 4, (c1[2] - c2[1]) / s, (c2[0] - c0[2]) / s, (c0[1] - c1[0]) / s]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [(c1[2] - c2[1]) / s, s / 4, (c1[0] + c0[1]) / s, (c2[0] + c0[2]) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(c2[0] - c0[2]) / s, (c1[0] + c0[1]) / s, s / 4, (c2[1] + c1[2]) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(c0[1] - c1[0]) / s, (c2[0] + c0[2]) / s, (c2[1] + c1[2]) / s, s / 4]; }
  return qnorm(q);
}

export const m3v = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export function m3inv(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
          B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
          C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
