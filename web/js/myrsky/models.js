// Hardware models. The lunar module's shadow comes from NASA 3D Resources' "Apollo Lunar Module",
// simplified to a 172 KB shadow-only mesh (tools/bake_lm_shadow.md); what the camera sees is the crew's photo.
// Everything else is built from simple shapes at the documented sizes (data/dimensions.csv).
// Code written with an AI assistant (Claude Code, Anthropic), Nov 2026.
import * as THREE from 'three';
import { heightAt, TS_GLSL, tsUniforms } from './terrain.js';
import { POS, DATES, T } from './data.js';

const D2R = Math.PI / 180;
export const w = (e, n, u) => new THREE.Vector3(e, u, -n);
export const ground = (id, du = 0) => { const [e, n] = POS[id]; return w(e, n, heightAt(e, n) + du); };

function at(m, x, y, z, rx = 0, ry = 0, rz = 0) { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; }
function std(color, rough = 0.7, metal = 0) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); }
function shadowAll(o) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }
function cyl(r1, r2, h, mat, seg = 16) { return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat); }
function box(x, y, z, mat) { return new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat); }
function rod(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a); const m = cyl(r, r, d.length(), mat, 6);
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}

// Crew-photo cut-out, relit for the scene. The photo already holds its own sunlit and shaded sides, so
// it is multiplied by the light that reaches it: sunlight (zero where a hill or the crater rim blocks the
// Sun, the same march as the ground) plus fill (Earthlight, light bounced off the ground). Where only
// fill light reaches it, the photo's baked-in sun contrast is flattened, as it would be in soft light.
function photoMaterial(tex) {
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, bright: { value: 1 }, sunTint: { value: new THREE.Color(1, 1, 1) }, fillTint: { value: new THREE.Color(0, 0, 0) }, ...tsUniforms() },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float bright; uniform vec3 sunTint; uniform vec3 fillTint; varying vec2 vUv; varying vec3 vW;
      ${TS_GLSL}
      void main(){
        vec4 t = texture2D(map, vUv); if (t.a < 0.45) discard;
        vec3 c = pow(t.rgb, vec3(2.2));
        vec3 sunL = sunTint * terrainSun(vW), L = sunL + fillTint;
        float sf = dot(sunL, vec3(1.0)) / max(dot(L, vec3(1.0)), 1e-9);
        float l = dot(c, vec3(0.3, 0.59, 0.11));
        // softer contrast in fill light only: colour gain capped at 3x (more would blow JPEG chroma noise in
        // the black shadows up into green and purple blotches), the rest of the lift added as neutral grey
        float tl = mix(0.3 + (l - 0.3) * 0.75, l, sf), k = min(tl / max(l, 1e-4), 3.0);
        c = c * k + vec3(max(tl - l * k, 0.0));
        gl_FragColor = vec4(c * bright * L, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

// Simple lander made of boxes and struts (model units, as in the NASA model): the shadow caster for the
// first moment, until assets/lm_shadow.bin arrives, or for good if that file cannot load.
function fallbackLM() {
  const root = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x808080 });
  const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); root.add(m); return m; };
  add(new THREE.CylinderGeometry(1.55, 1.55, 1.5, 8), 0, 1.4, 0).rotation.y = Math.PI / 8; // descent stage
  add(new THREE.BoxGeometry(2.0, 1.6, 1.9), 0, 3.0, 0);                                  // ascent stage
  add(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12), 0, 4.05, -0.3);                     // docking tunnel and tanks
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, x = Math.sin(a), z = Math.cos(a);
    const from = new THREE.Vector3(x * 1.4, 1.6, z * 1.4), to = new THREE.Vector3(x * 3.33, 0.12, z * 3.33);
    const len = from.distanceTo(to);
    const leg = add(new THREE.CylinderGeometry(0.06, 0.06, len, 6), 0, 0, 0);
    leg.position.copy(from).add(to).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 12), to.x, 0.06, to.z);              // footpad
  }
  return { scene: root };
}

export async function loadLM(say = () => {}) {
  say('lander');
  const tl = new THREE.TextureLoader();
  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  const ascent = new THREE.Group(), descent = new THREE.Group();
  const lm = new THREE.Group();
  lm.add(descent, ascent);
  lm.scale.setScalar(1.42); // model units -> metres (real diagonal 9.45 m)
  lm.rotation.y = -90 * D2R; // model +z (ladder) faces west
  lm.position.copy(ground('lm', -0.15));
  let ver = 0;
  // The 3D shape only casts the shadow; the camera sees the crew's photo. A box stand-in casts the shadow
  // from the first frame, and NASA's model, simplified to 4 cm (assets/lm_shadow.bin), replaces it on arrival.
  const fallback = fallbackLM().scene; fallback.updateMatrixWorld(true);
  fallback.traverse((m) => { if (m.isMesh) { const c = new THREE.Mesh(m.geometry, shadowMat); c.applyMatrix4(m.matrixWorld); (m.position.y > 2.2 ? ascent : descent).add(c); } });
  shadowAll(lm);
  fetch('assets/lm_shadow.bin').then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((buf) => {
    // format: uint32 magic, vertex count, descent index count, ascent index count; float32 grid step;
    // int16 xyz in grid steps; uint16 triangle indices (descent first)
    const [magic, nV, nD, nA] = new Uint32Array(buf, 0, 4), G = new Float32Array(buf, 16, 1)[0];
    if (magic !== 0x4C4D3031) throw new Error('bad file');
    const q = new Int16Array(buf, 20, nV * 3), pos = new Float32Array(nV * 3);
    for (let i = 0; i < q.length; i++) pos[i] = q[i] * G;
    const off = 20 + nV * 6 + ((4 - ((20 + nV * 6) % 4)) % 4), idx = new Uint16Array(buf, off, nD + nA);
    const part = (from, n) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx.slice(from, from + n), 1)); return new THREE.Mesh(g, shadowMat); };
    descent.clear(); ascent.clear();
    descent.add(part(0, nD)); ascent.add(part(nD, nA));
    shadowAll(lm); ver++;
  }).catch((e) => console.warn('LM shadow mesh not loaded, keeping the simple shape:', e.message));
  say('lander photo');
  const [pFull, pDesc] = await Promise.all([tl.loadAsync('assets/lm_photo_full.png'), tl.loadAsync('assets/lm_photo_descent.png')]);
  const photoMat = photoMaterial;
  // photo geometry: crop 825 x 680 px at 0.0107 m/px; lander axis at 54.5 % across; west footpad 630 px from the top
  const PW = 825 * 0.010687, PH = 680 * 0.010687;
  const geo = new THREE.PlaneGeometry(PW, PH);
  geo.translate(PW * (0.5 - 0.545), PH / 2 - 0.53, 0);
  const photo = new THREE.Group();
  const full = new THREE.Mesh(geo, photoMat(pFull)), desc = new THREE.Mesh(geo, photoMat(pDesc));
  photo.add(full, desc);
  photo.position.copy(ground('lm', 0));
  return {
    lm, ascent, descent, photo, full, desc,
    get ver() { return ver; }, // changes when the real model replaces the stand-in (shadow map must be redrawn)
    setEnv() {}, // the 3D shape is invisible (shadow only)
    setPhoto(bright, sunTint, fillTint, camPos, liftedOff) {
      full.visible = !liftedOff; desc.visible = liftedOff;
      for (const mm of [full.material, desc.material]) { mm.uniforms.bright.value = bright; mm.uniforms.sunTint.value.copy(sunTint); mm.uniforms.fillTint.value.copy(fillTint); }
      // face the camera (about the vertical axis), 2 m toward it so the nearest footpad is not buried
      const dx = camPos.x - lm.position.x, dz = camPos.z - lm.position.z, d = Math.hypot(dx, dz);
      photo.rotation.y = Math.atan2(dx, dz);
      photo.position.set(lm.position.x + dx / d * 2.0, lm.position.y + 0.15, lm.position.z + dz / d * 2.0);
    },
  };
}

export function buildSurveyor() {
  const white = std(0xeeeeea, 0.6, 0.1);
  const tan = std(0xb8a888, 0.85, 0.05);
  const metal = std(0xb0b0b0, 0.4, 0.8);
  const dark = std(0x222222, 0.6, 0.2);
  const g = new THREE.Group();
  const frame = new THREE.Group(); g.add(frame);
  const legR = 2.15, hub = 0.62;
  const feet = [];
  for (let i = 0; i < 3; i++) {
    const a = (i * 120 + 30) * D2R;
    const top = new THREE.Vector3(Math.cos(a) * 0.55, 0.95, Math.sin(a) * 0.55);
    const foot = new THREE.Vector3(Math.cos(a) * legR, 0.12, Math.sin(a) * legR);
    frame.add(rod(top, foot, 0.04, white));
    frame.add(rod(new THREE.Vector3(Math.cos(a + 0.6) * hub, 0.45, Math.sin(a + 0.6) * hub), foot, 0.025, white));
    const pad = cyl(0.15, 0.13, 0.23, white, 14); pad.position.copy(foot).setY(0.08); frame.add(pad); feet.push(foot);
    // triangular base frame
    const b = (i * 120 + 90) * D2R;
    frame.add(rod(new THREE.Vector3(Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6), new THREE.Vector3(Math.cos(a + 2.094) * 0.6, 0.6, Math.sin(a + 2.094) * 0.6), 0.03, white));
    // vernier engine / tanks
    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), metal); tank.position.set(Math.cos(b) * 0.42, 0.75, Math.sin(b) * 0.42); frame.add(tank);
  }
  const body = cyl(0.42, 0.55, 0.35, white, 3); body.position.y = 0.7; frame.add(body);
  // thermal compartments (white boxes)
  const compA = box(0.55, 0.32, 0.4, white); compA.position.set(0.25, 1.15, 0.35); frame.add(compA);
  const compB = box(0.5, 0.3, 0.38, white); compB.position.set(-0.35, 1.1, -0.2); frame.add(compB);
  // mast with planar antenna and solar panel
  const mast = cyl(0.03, 0.03, 2.0, metal, 8); mast.position.y = 1.95; frame.add(mast);
  const solar = box(0.86, 0.02, 0.86, dark); solar.position.set(0, 2.85, 0.15); solar.rotation.x = -0.6; frame.add(solar);
  const ant = box(0.95, 0.02, 0.6, std(0x999999, 0.5, 0.6)); ant.position.set(0, 2.7, -0.4); ant.rotation.x = 0.7; frame.add(ant);
  // TV camera (removed 20 Nov 1969 06:48:52)
  const camera = new THREE.Group();
  const cbody = cyl(0.1, 0.1, 0.62, white, 12); cbody.position.y = 0.31; camera.add(cbody);
  const mirror = box(0.2, 0.18, 0.2, metal); mirror.position.y = 0.66; camera.add(mirror);
  camera.position.set(0.55, 0.85, -0.45); camera.rotation.z = 0.15; frame.add(camera);
  // surface sampler scoop arm (removed 06:50:43)
  const scoop = new THREE.Group();
  scoop.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.2, -0.55, 0), 0.025, metal));
  const sc = box(0.12, 0.08, 0.06, metal); sc.position.set(1.22, -0.58, 0); scoop.add(sc);
  scoop.position.set(-0.5, 0.75, 0.5); scoop.rotation.y = 2.4; frame.add(scoop);
  // footpad 2 dug in: sink slightly and tilt
  const [e, n] = POS.surveyor3;
  g.position.copy(w(e, n, heightAt(e, n) - 0.1));
  g.rotation.y = 40 * D2R;
  // align to the slope (14 degrees toward the crater centre, roughly SE->NW down)
  const dz = heightAt(e, n + 1) - heightAt(e, n - 1), dx = heightAt(e + 1, n) - heightAt(e - 1, n);
  const nrm = new THREE.Vector3(-dx / 2, 1, dz / 2).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
  g.quaternion.premultiply(q);
  shadowAll(g);
  const parts = [];
  frame.traverse((c) => { if (c.isMesh && c.material === white) parts.push(c); });
  // What the camera sees is the real Surveyor 3: cut-outs of crew photo AS12-48-7100 (black and white),
  // in three states (complete, TV camera removed, camera and scoop removed). The model casts the shadow.
  g.traverse((c) => { if (c.isMesh) { c.material = c.material.clone(); c.material.colorWrite = false; c.material.depthWrite = false; } });
  const tl = new THREE.TextureLoader();
  const mk = (file) => photoMaterial(tl.load(file));
  // crop 710 x 470 (1000-scale) at 0.0068 m per unit; axis at 48.6 %; ground line 400 units from the top
  const PW = 710 * 0.0068, PH = 470 * 0.0068;
  const pg = new THREE.PlaneGeometry(PW, PH); pg.translate(PW * (0.5 - 0.486), PH / 2 - 0.48, 0);
  const states = ['full', 'nocam', 'bare'].map((n) => new THREE.Mesh(pg, mk(`assets/sv_photo_${n}.png`)));
  const photo = new THREE.Group(); states.forEach((s) => photo.add(s));
  const base = w(e, n, heightAt(e, n));
  return {
    group: g, camera, scoop, photo,
    get ppm() { const im = states[0].material.uniforms.map.value.image; return im && im.width ? im.width / PW : 114; }, // photo pixels per metre
    setDusty() {}, // the photo carries the paint colour now; the model only casts the shadow
    setPhoto(t, bright, sunTint, fillTint, camPos) {
      const st = t < Date.parse('1969-11-20T06:48:52Z') ? 0 : t < Date.parse('1969-11-20T06:50:43Z') ? 1 : 2;
      states.forEach((s, i) => { s.visible = i === st; const u = s.material.uniforms; u.bright.value = bright; u.sunTint.value.copy(sunTint); u.fillTint.value.copy(fillTint); });
      const dx = camPos.x - base.x, dz = camPos.z - base.z, dd = Math.hypot(dx, dz);
      photo.rotation.y = Math.atan2(dx, dz);
      photo.position.set(base.x + dx / dd * 1.2, base.y, base.z + dz / dd * 1.2);
    },
  };
}

function flagTexture() {
  const c = document.createElement('canvas'); c.width = 380; c.height = 200; const g = c.getContext('2d');
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#b5232e'; g.fillRect(0, i * 200 / 13, 380, 200 / 13 + 1); }
  g.fillStyle = '#2d3a6b'; g.fillRect(0, 0, 152, 200 * 7 / 13);
  g.fillStyle = '#f4f1ea';
  for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) {
    const x = (r % 2 ? 25.3 : 12.7) + k * 25.3, y = 6 + r * 11.7; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildFlag() {
  const g = new THREE.Group();
  const metal = std(0xdddddd, 0.35, 0.8);
  const poleH = 2.05;
  const pole = cyl(0.0125, 0.0125, poleH, metal, 8); pole.position.y = poleH / 2; g.add(pole);
  const bar = cyl(0.0125, 0.0125, 1.55, metal, 6); bar.rotation.z = Math.PI / 2; bar.position.set(0.78, poleH - 0.03, 0); g.add(bar);
  const geo = new THREE.PlaneGeometry(1.52, 0.91, 40, 24);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + 0.76, y = p.getY(i); // x 0..1.52 from pole
    const droopTop = y > 0 ? Math.pow(x / 1.52, 1.6) * 0.09 * (y / 0.455) : 0;
    const ripple = Math.sin(x * 9 + y * 2) * 0.035 * (x / 1.52) + Math.sin(x * 17.0 - y * 5) * 0.012;
    p.setXYZ(i, x, y - droopTop - Math.pow(x / 1.52, 2) * 0.03, ripple);
  }
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexture(), color: 0x8c8c8c, roughness: 0.9, side: THREE.DoubleSide })); // nylon, dulled by dust
  cloth.position.set(0.02, poleH - 0.04 - 0.455, 0); g.add(cloth);
  g.position.copy(ground('flag', -0.3));
  g.rotation.y = 120 * D2R; // front of the cloth toward CAM 1 (real orientation approximate)
  return shadowAll(g);
}

export function buildDish() {
  const g = new THREE.Group();
  const metal = std(0xcfcfcf, 0.45, 0.7);
  // erectable S-band dish: white-pink fabric on 16 dark ribs (crew photo AS12-46-6739)
  const fabric = new THREE.MeshStandardMaterial({ color: 0xa98670, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }); // salmon fabric, AS12-47-6988
  const ribMat = std(0x3a3632, 0.6, 0.3);
  const upright = new THREE.Group();
  for (let i = 0; i < 3; i++) { const a = i * 2.094; upright.add(rod(new THREE.Vector3(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9), new THREE.Vector3(0, 1.8, 0), 0.015, metal)); }
  const head = new THREE.Group(); head.position.y = 1.9;
  // umbrella fabric: paraboloid that sags between the 16 ribs, darker in the folds
  const NR = 14, NA = 96, dp = [], dc = [], di = [];
  for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
    const r = 1.5 * i / NR, a = j / NA * Math.PI * 2;
    const sag = (1 - Math.abs(Math.cos(a * 8))) * 0.05 * (r / 1.5);
    dp.push(Math.cos(a) * r, r * r / (4 * 1.3) + sag, Math.sin(a) * r);
    const shade = 0.75 + 0.25 * Math.abs(Math.cos(a * 8)) - 0.08 * Math.random();
    dc.push(shade, shade, shade);
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) { const a0 = i * (NA + 1) + j, b0 = a0 + NA + 1; di.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3)); dg.setIndex(di); dg.computeVertexNormals();
  fabric.vertexColors = true;
  const dish = new THREE.Mesh(dg, fabric); head.add(dish);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8; let prev = new THREE.Vector3(0, 0, 0);
    for (let k = 1; k <= 6; k++) { const r = 1.5 * k / 6; const p = new THREE.Vector3(Math.cos(a) * r, r * r / (4 * 1.3) + 0.004, Math.sin(a) * r); head.add(rod(prev, p, 0.008, ribMat)); prev = p; }
  }
  head.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.45, 0), 0.014, metal)); // feed mast
  const band = std(0xc8783a, 0.6, 0.2);
  head.add(at(cyl(0.022, 0.022, 0.12, band, 8), 0, 0.55, 0)); head.add(at(cyl(0.022, 0.022, 0.1, band, 8), 0, 1.3, 0));
  head.add(at(cyl(0.035, 0.05, 0.08, metal, 10), 0, 1.5, 0));
  upright.add(head);
  g.add(upright);
  g.position.copy(ground('sband'));
  shadowAll(g);
  return {
    group: g, head, upright,
    aim(earthENU) { // point the dish axis at Earth
      const dir = new THREE.Vector3(earthENU[0], earthENU[2], -earthENU[1]).normalize();
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    },
    setFallen(f) {
      if (f) { upright.rotation.set(0, 2.2, 1.42); upright.position.set(0, 0.12, 0); head.quaternion.set(0, 0, 0, 1); head.rotation.set(0, 0, -0.75); } // tripod on the ground, bowl tipped about 40 deg up (real pose unknown: no photo exists)
      else { upright.rotation.set(0, 0, 0); upright.position.set(0, 0, 0); }
    },
  };
}

export function buildSWC() {
  const g = new THREE.Group();
  const metal = std(0xdddddd, 0.4, 0.8);
  g.add(at(cyl(0.02, 0.02, 1.5, metal, 6), 0, 0.75, 0));
  const foil = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.3), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }));
  foil.position.set(0.17, 0.75, 0); g.add(foil);
  g.position.copy(ground('swc', -0.2));
  return { group: shadowAll(g), foil };
}

// dust and handling marks on hardware: the soil photo's grain, laid on in world space, gently
function dusty(root, grain, amount = 0.35) {
  if (!grain) return root;
  const done = new Set();
  root.traverse((c) => {
    if (!c.isMesh || done.has(c.material)) return;
    const mat = c.material; done.add(mat);
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrain = { value: grain };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vDW; varying vec3 vDN;`).replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vDW = (modelMatrix * vec4(transformed, 1.0)).xyz; vDN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tGrain; varying vec3 vDW; varying vec3 vDN;`).replace('#include <map_fragment>', `#include <map_fragment>
          vec3 bw = pow(abs(vDN), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
          float gr = texture2D(tGrain, vDW.zy / 0.3).r * bw.x + texture2D(tGrain, vDW.xz / 0.3).r * bw.y + texture2D(tGrain, vDW.xy / 0.3).r * bw.z;
          diffuseColor.rgb *= 1.0 + ${amount.toFixed(2)} * (gr * 1.99 - 1.0) - 0.12 * smoothstep(0.55, 0.85, gr);`);
    };
    mat.customProgramCacheKey = () => 'hw-dust-v1';
  });
  return root;
}

export function buildALSEP(grain = null) {
  const g = new THREE.Group();
  const gold = std(0xb8913a, 0.45, 0.7), silver = std(0xd8d8d8, 0.35, 0.8), white = std(0xb8b8b2, 0.6), dark = std(0x2a2a2a, 0.6, 0.3);
  const place = (id, obj, du = 0) => { obj.position.copy(ground(id, du)); g.add(obj); return obj; };
  // central station: base box, raised sunshield, helical antenna on a mast
  const cs = new THREE.Group();
  cs.add(at(box(0.68, 0.17, 0.7, gold), 0, 0.12, 0));
  cs.add(at(box(0.8, 0.02, 0.8, silver), 0, 0.62, 0));
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) cs.add(at(cyl(0.01, 0.01, 0.42, silver, 4), x, 0.41, z));
  cs.add(at(cyl(0.015, 0.015, 0.6, silver, 6), 0.3, 0.92, 0));
  cs.add(at(cyl(0.02, 0.02, 0.58, std(0x777777, 0.5, 0.5), 8), 0.3, 1.45, 0, 0, 0, 0.5));
  place('alsep_cs', cs);
  // SNAP-27: finned dark cylinder
  const rtg = new THREE.Group();
  rtg.add(at(cyl(0.11, 0.11, 0.46, dark, 16), 0, 0.33, 0));
  for (let i = 0; i < 8; i++) { const f = box(0.2, 0.44, 0.01, dark); f.position.set(Math.cos(i * 0.785) * 0.15, 0.33, Math.sin(i * 0.785) * 0.15); f.rotation.y = -i * 0.785; rtg.add(f); }
  rtg.add(at(cyl(0.02, 0.02, 0.1, dark, 6), 0, 0.05, 0));
  place('alsep_rtg', rtg);
  // seismometer: shiny cylinder on a 1.5 m skirt
  const pse = new THREE.Group();
  pse.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), std(0xcfcfcf, 0.3, 0.8)), 0, 0.02, 0, -Math.PI / 2, 0, 0));
  pse.add(at(cyl(0.12, 0.14, 0.32, silver, 16), 0, 0.18, 0));
  place('alsep_pse', pse);
  // magnetometer (AS12-47-6921): low body on three short legs, three ~1 m booms angled up, fat sensor heads on the ends
  const lsm = new THREE.Group();
  lsm.add(at(box(0.24, 0.13, 0.27, white), 0, 0.3, 0));
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094 + 0.5, c = Math.cos(a), sn = Math.sin(a);
    const root = new THREE.Vector3(c * 0.08, 0.36, sn * 0.08), tip = new THREE.Vector3(c * 0.85, 0.78, sn * 0.85);
    lsm.add(rod(root, tip, 0.014, silver));
    const dir = tip.clone().sub(root).normalize();
    lsm.add(rod(tip.clone().addScaledVector(dir, -0.04), tip.clone().addScaledVector(dir, 0.17), 0.045, white));
    const la = a + 1.047;
    lsm.add(rod(new THREE.Vector3(Math.cos(la) * 0.1, 0.25, Math.sin(la) * 0.1), new THREE.Vector3(Math.cos(la) * 0.3, 0, Math.sin(la) * 0.3), 0.01, silver));
  }
  place('alsep_lsm', lsm);
  // solar wind spectrometer (AS12-46-6812): box with dark radiator sides, faceted dome of sensor cups, short legs
  const sws = new THREE.Group();
  sws.add(at(box(0.3, 0.2, 0.3, white), 0, 0.24, 0));
  for (const [x, z, ry] of [[0, 0.151, 0], [0, -0.151, 0], [0.151, 0, Math.PI / 2], [-0.151, 0, Math.PI / 2]]) sws.add(at(box(0.24, 0.12, 0.004, dark), x, 0.22, z, 0, ry, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8c8c4, roughness: 0.45, metalness: 0.5, flatShading: true }));
  dome.scale.y = 0.75; sws.add(at(dome, 0, 0.34, 0));
  for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) sws.add(rod(new THREE.Vector3(x, 0.15, z), new THREE.Vector3(x * 1.5, 0, z * 1.5), 0.009, silver));
  place('alsep_sws', sws);
  // ion detector SIDE (AS12-47-6922): silver box on three legs over a wire-web ground screen, CCIG gauge beside it
  const side = new THREE.Group();
  side.add(at(box(0.3, 0.32, 0.26, silver), 0, 0.42, 0));
  side.add(at(box(0.28, 0.01, 0.24, std(0x9a9a98, 0.2, 0.3)), 0, 0.585, 0));
  for (let i = 0; i < 3; i++) { const a = i * 2.094; side.add(rod(new THREE.Vector3(Math.cos(a) * 0.1, 0.27, Math.sin(a) * 0.1), new THREE.Vector3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22), 0.012, silver)); }
  const wire = std(0x8c8c8c, 0.5, 0.6);
  for (let i = 0; i < 6; i++) { const a = i * 1.047; side.add(rod(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(Math.cos(a) * 0.38, 0.01, Math.sin(a) * 0.38), 0.003, wire)); }
  for (let i = 0; i < 6; i++) { const a = i * 1.047, b = a + 1.047; for (const r of [0.2, 0.36]) side.add(rod(new THREE.Vector3(Math.cos(a) * r, 0.012, Math.sin(a) * r), new THREE.Vector3(Math.cos(b) * r, 0.012, Math.sin(b) * r), 0.003, wire)); }
  side.add(at(cyl(0.05, 0.05, 0.14, silver, 12), -0.45, 0.07, 0.1, 0, 0, Math.PI / 2));
  place('alsep_side', side);
  const cover = (() => { const o = box(0.4, 0.05, 0.4, std(0xcfcfcf, 0.4, 0.7)); o.rotation.set(0.2, 0.5, 0.1); return o; })();
  place('pse_cover', cover, 0.02);
  return dusty(shadowAll(g), grain);
}

export function buildBackpacks() {
  const g = new THREE.Group();
  const white = std(0xe6e6e0, 0.7);
  const p1 = box(0.66, 0.25, 0.5, white); p1.position.set(0, 0.1, 0); p1.rotation.set(0.1, 0.7, 0.05); g.add(p1);
  const p2 = box(0.66, 0.25, 0.5, white); p2.position.set(-1.1, 0.12, 0.8); p2.rotation.set(-0.2, -0.4, 0.3); g.add(p2);
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), std(0xd0d0c8, 0.9)); bag.scale.y = 0.6; bag.position.set(0.7, 0.1, 0.9); g.add(bag);
  g.position.copy(ground('backpacks', 0));
  return shadowAll(g);
}

// The invented webcam on its pole tripod
export function buildWebcam(heading) {
  const g = new THREE.Group();
  const grey = std(0x8a8a8a, 0.5, 0.6), black = std(0x111111, 0.5, 0.2);
  for (let i = 0; i < 3; i++) { const a = i * 2.094; g.add(rod(new THREE.Vector3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45), new THREE.Vector3(0, 0.9, 0), 0.015, grey)); }
  g.add(at(cyl(0.02, 0.02, 0.5, grey, 6), 0, 1.15, 0));
  const body = box(0.18, 0.14, 0.26, std(0xd8d8d0, 0.6)); body.position.set(0, 1.45, 0); g.add(body);
  const lens = cyl(0.045, 0.05, 0.08, black, 12); lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.45, -0.16); g.add(lens);
  const panel = box(0.35, 0.01, 0.25, std(0x1a2238, 0.4, 0.4)); panel.position.set(0, 1.58, 0.05); panel.rotation.x = -0.3; g.add(panel);
  g.rotation.y = -heading * D2R;
  return shadowAll(g);
}

// Procedural rocks around a point. Size-frequency from Surveyor 3 counts in this crater:
// N(>=y mm) = 3e6 * y^-2.56 per 100 m^2 (JPL PD 125, fig VII-19). Mostly half buried.
export function buildRocks(centres, seed = 1, grain = null) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // 3D value noise for lumpy, irregular shapes (no single big flat plane, which read as folded paper)
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.1) * 43758.5453; return h - Math.floor(h); };
  const vn = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w2 = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t, H = (i, j, k) => hash(xi + i, yi + j, zi + k);
    return l(l(l(H(0, 0, 0), H(1, 0, 0), u), l(H(0, 1, 0), H(1, 1, 0), u), v), l(l(H(0, 0, 1), H(1, 0, 1), u), l(H(0, 1, 1), H(1, 1, 1), u), v), w2);
  };
  const geos = [];
  for (let v = 0; v < 6; v++) {
    const g = new THREE.IcosahedronGeometry(1, v < 3 ? 4 : 2); // 3 detailed shapes for the few big rocks, 3 light ones for the many small
    const p = g.attributes.position; const o = [rnd() * 50, rnd() * 50, rnd() * 50];
    // a few soft chips: blunt cuts along random directions, rounded by micrometeorite erosion
    const cuts = [0, 1, 2].map(() => { const t = rnd() * 6.28, z = rnd() * 2 - 1, r = Math.sqrt(1 - z * z); return [r * Math.cos(t), z, r * Math.sin(t), 0.55 + rnd() * 0.25]; });
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let f = 0.78 + 0.34 * vn(x * 1.3 + o[0], y * 1.3 + o[1], z * 1.3 + o[2]) + 0.12 * vn(x * 3.1 + o[1], y * 3.1, z * 3.1 + o[0]) + 0.04 * vn(x * 8 + o[2], y * 8, z * 8);
      for (const [cx, cy, cz, d] of cuts) { const k = x * cx + y * cy + z * cz; if (k * f > d) f = d / k + (k * f - d) * 0.15 / k; }
      p.setXYZ(i, x * f * (1 + v * 0.07), y * f * (0.6 + 0.1 * (v % 3)), z * f);
    }
    g.computeVertexNormals(); geos.push(g);
  }
  // dust-coated basalt, about as dark as the soil; the soil's own grain from crew photo AS12-49-7284 is
  // laid over it (triplanar, world space) so close rocks are not smooth plastic
  const mat = new THREE.MeshStandardMaterial({ color: 0x625d58, roughness: 1.0 });
  if (grain) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrain = { value: grain };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vRW; varying vec3 vRN;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 rw = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vRW = rw.xyz; vRN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tGrain; varying vec3 vRW; varying vec3 vRN;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 bw = pow(abs(vRN), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
          float gr = texture2D(tGrain, vRW.zy / 0.45).r * bw.x + texture2D(tGrain, vRW.xz / 0.45).r * bw.y + texture2D(tGrain, vRW.xy / 0.45).r * bw.z;
          diffuseColor.rgb *= 1.0 + 1.1 * (gr * 1.99 - 1.0);`);
    };
    mat.customProgramCacheKey = () => 'rock-grain-v1';
  }
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  const lists = geos.map(() => []);
  for (const c of centres) {
    const area = Math.PI * c.r * c.r;
    // rocks >= 6 cm: 3e6 * 60^-2.56 per 100 m^2 ~ 0.85 per m^2. Visible sizes only.
    const count = Math.min(9000, Math.round(area / 100 * 3e6 * Math.pow(60, -2.56)));
    for (let i = 0; i < count; i++) {
      const rr = c.r * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
      const e = c.e + Math.cos(a) * rr, n = c.n + Math.sin(a) * rr;
      if (c.avoid && c.avoid.some(([ae, an, ar]) => Math.hypot(e - ae, n - an) < ar)) continue;
      const size = 0.06 * Math.pow(rnd(), -1 / 2.56) / 2; // radius m, inverse-CDF of the power law
      const r = Math.min(size, 0.35);
      const bury = 0.55 + 0.35 * rnd(); // Surveyor 3 burial factor 0.6-0.7: mostly half buried
      p3.set(e, heightAt(e, n) - r * bury * 0.75, -n);
      q.setFromEuler(new THREE.Euler(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5));
      sc.set(r * (0.8 + rnd() * 0.5), r, r * (0.8 + rnd() * 0.5));
      lists[(r > 0.12 ? 0 : 3) + (i % 3)].push(m4.compose(p3, q, sc).clone());
    }
  }
  lists.forEach((l, i) => {
    const im = new THREE.InstancedMesh(geos[i], mat, l.length);
    l.forEach((m, k) => im.setMatrixAt(k, m));
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    group.add(im);
  });
  return group;
}
