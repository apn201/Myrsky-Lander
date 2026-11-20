// Prototype scene: flat ground with the real Apollo 12 site albedo (Myrsky's LROC ground images),
// a low Sun as at the Apollo 12 touchdown, and a placeholder lunar module built from lm.js, so
// the jets, legs and engines you see are exactly where the physics puts them.
//
// World axes: +x downrange (west), +y up, +z north. The Apollo 12 LM site is the origin.
// The LM model is built in LM body axes (X up, Y right, Z forward) and given the physics
// orientation directly.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import * as THREE from 'three';
import { DPS, APS, GEAR, LEGS, JETS, RCS } from './lm.js';
import { padJointBody } from './physics.js';

const DEG = Math.PI / 180;
const SUN_ELEV = 5.1 * DEG, SUN_SWING = 12 * DEG;
const SUN_DIR = new THREE.Vector3(-Math.cos(SUN_ELEV) * Math.cos(SUN_SWING), Math.sin(SUN_ELEV), -Math.cos(SUN_ELEV) * Math.sin(SUN_SWING));
const V = a => new THREE.Vector3(a[0], a[1], a[2]);

export async function createScene(canvas, meta) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 40000);

  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 14000 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x222222, 0x8a8478, 0.35));

  // ---- ground ----
  const load = url => new Promise((ok, fail) => new THREE.TextureLoader().load(url, ok, undefined, fail));
  const [near, wide, grain] = await Promise.all([
    load('assets/ground_near.jpg'), load('assets/ground_wide.jpg'), load('assets/tex_regolith_AS12-49-7284.jpg'),
  ]);
  for (const t of [near, wide, grain]) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  groundMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      tNear: { value: near }, tWide: { value: wide }, tGrain: { value: grain },
      gCentre: { value: new THREE.Vector2(...meta.grid_centre_en) },
      gHalf: { value: new THREE.Vector2(meta.half_m, meta.wide.half_m) },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGW;
uniform sampler2D tNear, tWide, tGrain;
uniform vec2 gCentre, gHalf;`)
      .replace('#include <map_fragment>', `
{
  vec2 en = vec2(-vGW.x, vGW.z) - gCentre;          // east/north of the LM site
  vec2 uvN = en / gHalf.x * 0.5 + 0.5, uvW = en / gHalf.y * 0.5 + 0.5;
  float a = texture2D(tWide, uvW).r;
  float k = 1.0 - smoothstep(0.46, 0.5, max(abs(uvN.x - 0.5), abs(uvN.y - 0.5)));
  a = mix(a, texture2D(tNear, uvN).r, k);
  float dist = length(vGW - cameraPosition);
  float g = texture2D(tGrain, vGW.xz / 3.1).r * 0.6 + texture2D(tGrain, vGW.zx / 0.9 + 0.37).r * 0.4;
  a *= mix(0.55 + 0.9 * g, 1.0, smoothstep(30.0, 400.0, dist));
  diffuseColor.rgb *= vec3(a * 0.9);
}`);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * meta.wide.half_m, 2 * meta.wide.half_m), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.0, 64),
    new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.5, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  scene.add(ring);

  const lm = buildLander();
  scene.add(lm.descent, lm.ascent);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let first = true;
  const place = (obj, s) => {
    const q = new THREE.Quaternion(s.q[1], s.q[2], s.q[3], s.q[0]);
    const cg = V(s.cg).applyQuaternion(q);
    obj.quaternion.copy(q);
    obj.position.set(s.pos[0] - cg.x, s.pos[1] - cg.y, s.pos[2] - cg.z);
  };

  return {
    update(s, h, dt) {
      place(lm.ascent, s);
      if (s.stage === 'full') { place(lm.descent, s); lm.setLegs(s.legs); }
      else {
        const p = s.descentPose;
        lm.descent.position.set(...p.origin);
        lm.descent.quaternion.set(p.q[1], p.q[2], p.q[3], p.q[0]);
        lm.setLegs(p.legs);
      }
      lm.setJets(s.jetsOn);
      lm.setEngines(s.stage === 'full' ? s.throttle : 0, s.stage === 'ascent' && s.apsOn && s.apsFuel > 0, s.gimbal);

      sun.target.position.copy(lm.ascent.position);
      sun.position.copy(lm.ascent.position).addScaledVector(SUN_DIR, 1500);

      // side view from the north: lander in the upper part of the frame, ground below it
      const low = Math.min(h, 220);
      const d = 30 + low * 0.25 + Math.max(0, h - 220) * 0.04;
      const wantPos = new THREE.Vector3(s.pos[0] - d * 0.18, Math.max(1.6, s.pos[1] - d * 0.06), s.pos[2] + d);
      const wantLook = new THREE.Vector3(s.pos[0] + s.vel[0] * 0.6, Math.max(0, s.pos[1] - d * 0.12), s.pos[2]);
      const k = first ? 1 : 1 - Math.exp(-dt * 3);
      camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
      first = false;
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      renderer.render(scene, camera);
    },
    snapCamera() { first = true; },
  };
}

// Placeholder LM in body axes from the lm.js geometry.
function buildLander() {
  const descent = new THREE.Group(), ascent = new THREE.Group();
  const mat = (color, metalness, roughness) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  const foil = mat(0xb8892a, 0.7, 0.45), black = mat(0x1a1a1a, 0.3, 0.6), grey = mat(0xa3a39b, 0.2, 0.7), strut = mat(0x9a8a5a, 0.6, 0.5);
  const mesh = (parent, geo, m, pos, rot) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    o.castShadow = o.receiveShadow = true;
    parent.add(o); return o;
  };
  const alongX = [0, 0, -Math.PI / 2];   // cylinders are built along y; turn them onto body X
  // body X is "up" here, so a box's size is [X, Y, Z]
  const box = (parent, size, m, at) => mesh(parent, new THREE.BoxGeometry(...size), m, at);

  // descent stage: octagonal box and engine bell
  mesh(descent, new THREE.CylinderGeometry(2.1, 2.1, 1.65, 8), foil, [-0.85, 0, 0], [Math.PI / 8, 0, -Math.PI / 2]);
  const bellLen = -0.95 - DPS.exit;
  const bell = new THREE.Group(); bell.position.set(...DPS.pivot); descent.add(bell);
  mesh(bell, new THREE.CylinderGeometry(0.33, DPS.exitR, bellLen, 20, 1, true), black, [-bellLen / 2, 0, 0], alongX);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = mesh(bell, new THREE.CircleGeometry(DPS.exitR * 0.9, 24), glowMat, [-bellLen - 0.01, 0, 0], [0, -Math.PI / 2, 0]);
  glow.castShadow = false;

  // ascent stage
  box(ascent, [2.3, 2.4, 2.6], grey, [1.25, 0, 0.25]);
  mesh(ascent, new THREE.CylinderGeometry(1.2, 1.2, 2.4, 16), grey, [1.3, 0, 0.4], [Math.PI / 2, 0, 0]);
  box(ascent, [1.3, 2.0, 1.2], black, [1.1, 0, -1.35]);
  box(ascent, [0.6, 1.2, 0.15], black, [1.6, 0, 1.47]);
  mesh(ascent, new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), grey, [2.45, -0.5, -0.4], [0, 0, -Math.PI / 2]);
  mesh(ascent, new THREE.CylinderGeometry(0.05, 0.05, 1.2), grey, [3.0, 0.6, 0.3], alongX);
  const apsGlow = mesh(ascent, new THREE.CircleGeometry(0.3, 20), glowMat.clone(), [APS.point[0] - 0.05, 0, 0], [0, -Math.PI / 2, 0]);
  apsGlow.castShadow = false;
  // RCS quads
  for (const j of JETS.filter(j => j.dir[0] === -1)) box(ascent, [0.5, 0.35, 0.35], grey, j.pos);

  // legs
  const unit = new THREE.CylinderGeometry(1, 1, 1, 8);
  const legs = LEGS.map(leg => {
    const primary = mesh(descent, unit, strut, [0, 0, 0]);
    const sec1 = mesh(descent, unit, strut, [0, 0, 0]);
    const sec2 = mesh(descent, unit, strut, [0, 0, 0]);
    const pad = mesh(descent, new THREE.CylinderGeometry(GEAR.padRadius, GEAR.padRadius - 0.05, 0.12, 20), strut, [0, 0, 0], alongX);
    const probe = leg.probe ? mesh(descent, unit, grey, [0, 0, 0]) : null;
    return { leg, primary, sec1, sec2, pad, probe };
  });
  const up = new THREE.Vector3(0, 1, 0);
  const tube = (m, a, b, r) => {
    const d = new THREE.Vector3().subVectors(b, a), l = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.scale.set(r, l, r);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };

  // jet plumes: a small cone per jet, pointing opposite to its thrust
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
  const puffGeo = new THREE.ConeGeometry(0.16, 0.9, 10, 1, true);
  puffGeo.translate(0, -0.45, 0);    // tip at the origin, opening toward -y
  const puffs = [null];
  for (const j of JETS) {
    const p = new THREE.Mesh(puffGeo, puffMat);
    const plume = V(j.dir).negate();
    p.position.copy(V(j.pos)).addScaledVector(plume, 0.2);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), plume);
    p.visible = false;
    ascent.add(p); puffs.push(p);
  }

  return {
    descent, ascent,
    setLegs(states) {
      legs.forEach((L, i) => {
        const st = states[i];
        const jb = padJointBody(L.leg, st);
        const joint = V(jb);
        const attach = V(L.leg.attach);
        if (st.broken) {
          // folded under: strut hanging from its upper end
          joint.copy(attach).add(new THREE.Vector3(-1.6, L.leg.dir[1] * 0.9, L.leg.dir[2] * 0.9));
        }
        tube(L.primary, attach, joint, 0.09);
        const lowA = new THREE.Vector3(-1.6, L.leg.dir[1] * 1.95, L.leg.dir[2] * 1.95);
        const side = new THREE.Vector3(0, L.leg.dir[2], L.leg.dir[1]).multiplyScalar(0.8);
        tube(L.sec1, lowA.clone().add(side), joint, 0.045);
        tube(L.sec2, lowA.clone().sub(side), joint, 0.045);
        L.pad.position.copy(joint).add(new THREE.Vector3(-GEAR.padDrop + 0.06, 0, 0));
        if (L.probe) {
          L.probe.visible = !st.broken && !st.contact && st.c < 0.01;
          tube(L.probe, joint, joint.clone().add(new THREE.Vector3(-(GEAR.padDrop + GEAR.probe), 0, 0)), 0.012);
        }
      });
    },
    setJets(on) { for (let n = 1; n <= 16; n++) puffs[n].visible = on[n]; },
    setEngines(dpsThrottle, apsOn, gimbal) {
      glow.material.opacity = Math.min(0.5, dpsThrottle * 0.8);
      bell.rotation.set(0, gimbal[0], gimbal[1]);
      apsGlow.material.opacity = apsOn ? 0.5 : 0;
    },
  };
}
