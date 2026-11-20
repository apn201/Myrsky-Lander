// Prototype scene: flat ground with the real Apollo 12 site albedo (Myrsky's LROC ground images),
// a low Sun as at the Apollo 12 touchdown, and a placeholder lunar module built from documented
// sizes. The real terrain and Myrsky's lunar lighting replace the flat ground in step 2.
//
// World axes: +x = downrange (west, the Apollo 12 approach direction), +y = up, +z = north.
// The Apollo 12 LM site (Intrepid) is the origin and the landing target.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import * as THREE from 'three';
import { LM } from './physics.js';

const DEG = Math.PI / 180;
// Sun at the Apollo 12 touchdown: 5.1° up, in the east (behind the approaching LM). The small
// north offset swings the shadow slightly away from the camera so you can see it.
const SUN_ELEV = 5.1 * DEG, SUN_SWING = 12 * DEG;
const SUN_DIR = new THREE.Vector3(-Math.cos(SUN_ELEV) * Math.cos(SUN_SWING), Math.sin(SUN_ELEV), -Math.cos(SUN_ELEV) * Math.sin(SUN_SWING));

export async function createScene(canvas, meta) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 40000);

  // ---- light ----
  const sun = new THREE.DirectionalLight(0xffffff, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9;
  sc.near = 1; sc.far = 14000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  // light bounced off the sunlit ground, from below and from the Sun's side
  scene.add(new THREE.HemisphereLight(0x222222, 0x8a8478, 0.35));

  // ---- ground ----
  const load = url => new Promise((ok, fail) => new THREE.TextureLoader().load(url, ok, undefined, fail));
  const [near, wide, grain] = await Promise.all([
    load('assets/ground_near.jpg'), load('assets/ground_wide.jpg'), load('assets/tex_regolith_AS12-49-7284.jpg'),
  ]);
  for (const t of [near, wide, grain]) { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
  near.colorSpace = wide.colorSpace = THREE.NoColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;

  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  groundMat.onBeforeCompile = sh => {
    sh.uniforms.tNear = { value: near };
    sh.uniforms.tWide = { value: wide };
    sh.uniforms.tGrain = { value: grain };
    sh.uniforms.gCentre = { value: new THREE.Vector2(...meta.grid_centre_en) };
    sh.uniforms.gHalf = { value: new THREE.Vector2(meta.half_m, meta.wide.half_m) };
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
  // east/north metres from the LM site; textures have row 0 at the north edge
  vec2 en = vec2(-vGW.x, vGW.z) - gCentre;
  vec2 uvN = vec2(en.x / gHalf.x, en.y / gHalf.x) * 0.5 + 0.5;
  vec2 uvW = vec2(en.x / gHalf.y, en.y / gHalf.y) * 0.5 + 0.5;
  float a = texture2D(tWide, uvW).r;
  float edge = max(abs(uvN.x - 0.5), abs(uvN.y - 0.5));
  float k = 1.0 - smoothstep(0.46, 0.5, edge);
  a = mix(a, texture2D(tNear, uvN).r, k);
  // regolith grain from crew photo AS12-49-7284 at two scales, fading with distance
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

  // target: a thin ring around the Apollo 12 LM spot
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.0, 64),
    new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  // ---- lander ----
  const lander = buildLander();
  scene.add(lander);

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

  return {
    update(s, h, dt) {
      lander.position.set(s.x, s.y, 0);
      lander.rotation.z = s.theta;
      lander.userData.setRcs(s.rcs);

      // keep the shadow camera on the lander, looking along the sunlight
      sun.target.position.copy(lander.position);
      sun.position.copy(lander.position).addScaledVector(SUN_DIR, 1500);

      // chase camera from the north side: frame the lander and, when low, the ground below it
      const low = Math.min(h, 220);
      const d = 30 + low * 0.25 + Math.max(0, h - 220) * 0.04;
      // nearly level view with the lander in the upper part of the frame, ground below it
      const camY = Math.max(1.6, s.y - d * 0.06);
      const wantPos = new THREE.Vector3(s.x - d * 0.18, camY, d);
      const wantLook = new THREE.Vector3(s.x + s.vx * 0.6, Math.max(0, s.y - d * 0.12), 0);
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

// Placeholder LM from documented sizes (descent stage 4.2 m across, footpads 9.45 m apart,
// overall about 7 m tall). Origin = centre of mass; body +y = engine thrust direction.
function buildLander() {
  const g = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: 0xb8892a, metalness: 0.7, roughness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xa3a39b, metalness: 0.2, roughness: 0.7 });
  const strut = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, metalness: 0.6, roughness: 0.5 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = m.receiveShadow = true;
    g.add(m); return m;
  };
  const padY = LM.padY;

  // descent stage: octagonal box, 1.65 m tall
  add(new THREE.CylinderGeometry(2.1, 2.1, 1.65, 8), foil, 0, -0.85, 0, 0, Math.PI / 8, 0);
  // descent engine bell
  add(new THREE.CylinderGeometry(0.35, 0.75, 1.4, 20, 1, true), black, 0, -2.2, 0);
  // ascent stage: cabin and the tanks/equipment bay
  add(new THREE.BoxGeometry(2.4, 2.3, 2.6), grey, 0.25, 1.25, 0);
  add(new THREE.CylinderGeometry(1.2, 1.2, 2.3, 16), grey, 0.4, 1.3, 0, 0, 0, Math.PI / 2);
  add(new THREE.BoxGeometry(1.2, 1.3, 2.0), black, -1.35, 1.1, 0);           // aft equipment bay
  add(new THREE.BoxGeometry(0.15, 0.6, 1.2), black, 1.47, 1.6, 0);           // front windows
  add(new THREE.CylinderGeometry(0.05, 0.05, 1.2), grey, 0.3, 3.0, 0.6);     // antennas
  add(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), grey, -0.4, 2.45, -0.5, Math.PI / 2.4);

  // four legs on ±x and ±z, pads 4.72 m out, probes on all but the forward (+x, ladder) leg
  const up = new THREE.Vector3(0, 1, 0);
  const tube = (a, b, r, mat) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const m = add(new THREE.CylinderGeometry(r, r, d.length(), 8), mat, 0, 0, 0);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(up, d.normalize());
  };
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const pad = new THREE.Vector3(dx * LM.padX, padY + 0.12, dz * LM.padX);
    tube(new THREE.Vector3(dx * 2.05, -0.2, dz * 2.05), pad, 0.09, strut);              // main strut
    tube(new THREE.Vector3(dx * 1.95, -1.6, dz * 1.95 + (dx ? 0.8 : 0)), pad, 0.045, strut);
    tube(new THREE.Vector3(dx * 1.95 + (dz ? 0.8 : 0), -1.6, dz * 1.95), pad, 0.045, strut);
    add(new THREE.CylinderGeometry(0.47, 0.42, 0.12, 20), strut, pad.x, padY + 0.06, pad.z);
    if (dx !== 1) tube(new THREE.Vector3(pad.x, padY, pad.z), new THREE.Vector3(pad.x, padY - LM.probe, pad.z), 0.012, grey);
  }

  // reaction control jet puffs (visible cue for the rotation)
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const puffs = [];
  for (const [sx, sy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 10, 1, true), puffMat);
    // top jets blow down, bottom jets blow up; the cone's tip sits at the jet
    p.position.set(sx * 1.75, 2.0 + sy * 0.55 - sy * 0.45, 1.4);
    p.rotation.z = sy > 0 ? 0 : Math.PI;
    p.userData.sign = sx * sy;
    p.visible = false;
    g.add(p); puffs.push(p);
  }
  g.userData.setRcs = r => { for (const p of puffs) p.visible = r !== 0 && Math.sign(r) === p.userData.sign; };
  return g;
}
