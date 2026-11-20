// The scene, built from Myrsky's real data:
//   ground: LROC NAC height model (2 m) and orthophoto of the Apollo 12 site, SLDEM2015 beyond,
//           with Myrsky's terrain shadows (myrsky/terrain.js)
//   Sun:    position at the Apollo 12 touchdown from Astronomy Engine (myrsky/sky.js)
//   lander: the crew's photo cut-out (AS12-48-7100) relit for the scene; the NASA 3D model casts
//           the shadow without being seen (myrsky/models.js). At liftoff the photo splits in two.
// Plus the RCS jet puffs and engine glows from lm.js, so they sit where the physics fires them.
//
// World axes are Myrsky's: x east, y up, z = -north; origin at Intrepid's touchdown spot.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import * as THREE from 'three';
import { loadTerrain, heightTexture, buildTerrainMesh, buildWideMesh, terrainMaterial, heightAt, useTerrainShadow } from '../myrsky/terrain.js';
import { loadLM } from '../myrsky/models.js';
import { skyState } from '../myrsky/sky.js';
import { DATES } from '../myrsky/data.js';
import { DPS, APS, GEAR, JETS } from './lm.js';
import { Q_UPRIGHT } from './physics.js';
import { qmul, qconj, qrot } from './vec.js';

const V = a => new THREE.Vector3(a[0], a[1], a[2]);
const TQ = q => new THREE.Quaternion(q[1], q[2], q[3], q[0]);
const PAD_BOTTOM_X = GEAR.padX - GEAR.padDrop;     // body X of the footpad soles (gear extended)

// terrain for the physics: height and slope from the same LROC data as the picture
export const world = { height: (x, z) => heightAt(x, -z), slope: true };

export async function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 40000);

  // Sun at the Apollo 12 touchdown
  const sky = skyState(new Date(DATES.touchdown));
  const sunW = new THREE.Vector3(sky.sun[0], sky.sun[2], -sky.sun[1]).normalize();
  // exposure: Myrsky's light units (sun 3.2) scaled for the ACES curve here
  const PHYS_SUN = 3.2, S = 2.6;
  const sunLight = new THREE.DirectionalLight(0xfff8f0, PHYS_SUN * S);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 4000 });
  sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.06;
  scene.add(sunLight, sunLight.target);
  const sinEl = Math.max(0, sunW.y);
  scene.add(new THREE.HemisphereLight(0x000000, 0xf2ece4, PHYS_SUN * sinEl * 0.11 * S));
  scene.add(new THREE.AmbientLight(0xffffff, PHYS_SUN * sinEl * 0.11 * 0.03 * S));

  // ground
  await loadTerrain();
  const tl = new THREE.TextureLoader();
  const [tNear, tWide, tRego] = await Promise.all(['assets/ground_near.jpg', 'assets/ground_wide.jpg', 'assets/tex_regolith_AS12-49-7284.jpg'].map(u => tl.loadAsync(u)));
  for (const t of [tNear, tWide, tRego]) { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.colorSpace = THREE.NoColorSpace; }
  tRego.wrapS = tRego.wrapT = THREE.RepeatWrapping;
  const terrainMat = terrainMaterial(tNear, tWide, heightTexture());
  terrainMat.userData.uniforms.tRego.value = tRego;
  useTerrainShadow(terrainMat.userData.uniforms);
  scene.add(buildTerrainMesh(terrainMat));
  const wideMat = terrainMaterial(tNear, tWide, terrainMat.userData.uniforms.tHeight.value, true);
  wideMat.userData.uniforms.tRego.value = tRego;
  scene.add(buildWideMesh(wideMat));
  for (const m of [terrainMat, wideMat]) m.userData.uniforms.sunDirW.value.copy(sunW);

  // landing target: a thin ring on Intrepid's spot
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.0, 64),
    new THREE.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.45, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = heightAt(0, 0) + 0.08;
  scene.add(ring);

  // lander: shadow-only 3D shape + photo cut-outs
  const lm = await loadLM();
  const wrap = part => {                       // NASA model in its own units/orientation, as Myrsky set it up
    const outer = new THREE.Group(), inner = new THREE.Group();
    inner.scale.setScalar(1.42); inner.rotation.y = -Math.PI / 2; inner.position.y = -0.15;
    inner.add(part); outer.add(inner); scene.add(outer);
    return outer;
  };
  const shadowD = wrap(lm.descent), shadowA = wrap(lm.ascent);
  const asc = await ascentPhoto(lm.full.material.uniforms.map.value, lm.desc.material.uniforms.map.value);
  const ascentPhotoMesh = new THREE.Mesh(lm.full.geometry, lm.full.material.clone());
  ascentPhotoMesh.material.uniforms = THREE.UniformsUtils.clone(lm.full.material.uniforms);
  ascentPhotoMesh.material.uniforms.map.value = asc;
  for (const k of ['tsHeight', 'tsSun', 'tsOn', 'tsSteps']) ascentPhotoMesh.material.uniforms[k] = lm.full.material.uniforms[k];
  const photoFull = new THREE.Group(), photoDesc = new THREE.Group(), photoAsc = new THREE.Group();
  photoFull.add(lm.full); photoDesc.add(lm.desc); photoAsc.add(ascentPhotoMesh);
  scene.add(photoFull, photoDesc, photoAsc);
  lm.desc.visible = true;
  const sunTint = new THREE.Color(1, 0.97, 0.94).multiplyScalar(PHYS_SUN);
  const fill = new THREE.Color(1, 0.97, 0.92).multiplyScalar(PHYS_SUN * sinEl * 0.11 * 1.03);
  for (const mesh of [lm.full, lm.desc, ascentPhotoMesh]) {
    const u = mesh.material.uniforms;
    u.bright.value = 0.1 * S * 3.0; u.sunTint.value.copy(sunTint); u.fillTint.value.copy(fill);
  }

  // jets and engine glows, in body axes
  const fx = buildFx();
  scene.add(fx.group);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  // pose helpers
  const bodyToWorld = (pose, pb) => {
    const r = qrot(pose.q, [pb[0] - pose.cg[0], pb[1] - pose.cg[1], pb[2] - pose.cg[2]]);
    return new THREE.Vector3(pose.pos[0] + r[0], pose.pos[1] + r[1], pose.pos[2] + r[2]);
  };
  const placeShadow = (g, pose) => {
    g.position.copy(bodyToWorld(pose, [PAD_BOTTOM_X, 0, 0]));
    g.quaternion.copy(TQ(qmul(pose.q, qconj(Q_UPRIGHT))));
  };
  const placePhoto = (g, pose) => {
    // the photo stands in the plane facing the camera (south), turned by the lean in that plane
    const up = qrot(pose.q, [1, 0, 0]);
    g.rotation.set(0, 0, Math.atan2(-up[0], up[1]));
    g.position.copy(bodyToWorld(pose, [PAD_BOTTOM_X + 0.15, 0, 0])).add(new THREE.Vector3(0, 0, 2.0));
  };

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let first = true, zoom = 1;
  const ZOOMS = [0.45, 1, 2.2];
  const tmp = new THREE.Vector3();

  return {
    update(s, h, dt) {
      const ascentPose = { pos: s.pos, q: s.q, cg: s.cg };
      let descentPose = ascentPose;
      if (s.stage !== 'full') {
        const p = s.descentPose;
        descentPose = { pos: p.origin, q: p.q, cg: [0, 0, 0] };
      }
      placeShadow(shadowD, descentPose); placeShadow(shadowA, ascentPose);
      photoFull.visible = s.stage === 'full';
      photoDesc.visible = photoAsc.visible = s.stage !== 'full';
      if (s.stage === 'full') placePhoto(photoFull, ascentPose);
      else { placePhoto(photoDesc, descentPose); placePhoto(photoAsc, ascentPose); }
      fx.update(s);

      sunLight.target.position.copy(photoFull.visible ? photoFull.position : photoAsc.position);
      sunLight.position.copy(sunLight.target.position).addScaledVector(sunW, 1500);
      for (const m of [terrainMat, wideMat]) m.userData.uniforms.camPos.value.copy(camera.position);

      // side view from the south, zoomed out arcade-style: lander high in the frame, ground below
      const d = (45 + Math.min(h, 400) * 0.75) * ZOOMS[zoom];
      const gy = heightAt(s.pos[0], -s.pos[2]);
      const lookY = Math.max(gy + 2, s.pos[1] - d * 0.15);
      const wantPos = new THREE.Vector3(s.pos[0] + s.vel[0] * 0.8, Math.max(gy + 3, lookY + d * 0.2), s.pos[2] + d);
      const wantLook = new THREE.Vector3(s.pos[0] + s.vel[0] * 0.8, lookY, s.pos[2]);
      const k = first ? 1 : 1 - Math.exp(-dt * 2.5);
      camPos.lerp(wantPos, k); camLook.lerp(wantLook, k);
      first = false;
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      renderer.render(scene, camera);

      // screen position of the lander, for the flight director overlay
      tmp.set(s.pos[0], s.pos[1], s.pos[2]).project(camera);
      return { x: (tmp.x + 1) / 2 * canvas.clientWidth, y: (1 - tmp.y) / 2 * canvas.clientHeight, zoom };
    },
    cycleZoom() { zoom = (zoom + 1) % ZOOMS.length; },
    snapCamera() { first = true; },
  };
}

// The ascent stage on its own: the pixels of the full photo that the descent-only photo lacks.
async function ascentPhoto(fullTex, descTex) {
  const draw = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
  const a = draw(fullTex.image), b = draw(descTex.image);
  for (let i = 0; i < a.data.length; i += 4) {
    const diff = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    const keep = a.data[i + 3] > 115 && (b.data[i + 3] < 115 || diff > 24);
    if (!keep) a.data[i + 3] = 0;
  }
  const c = document.createElement('canvas'); c.width = a.width; c.height = a.height;
  c.getContext('2d').putImageData(a, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

// RCS puffs at the 16 jets and faint engine glows, in LM body axes (X up, Y right, Z forward).
function buildFx() {
  const group = new THREE.Group();
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
  const puffGeo = new THREE.ConeGeometry(0.22, 1.2, 10, 1, true);
  puffGeo.translate(0, -0.6, 0);               // tip at the jet, opening along -y
  const puffs = [null];
  for (const j of JETS) {
    const p = new THREE.Mesh(puffGeo, puffMat);
    const plume = V(j.dir).negate();
    p.position.copy(V(j.pos)).addScaledVector(plume, 0.25);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), plume);
    p.visible = false;
    group.add(p); puffs.push(p);
  }
  const glowMat = () => new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const dps = new THREE.Mesh(new THREE.CircleGeometry(DPS.exitR * 0.9, 24), glowMat());
  dps.position.set(DPS.exit - 0.02, 0, 0); dps.rotation.y = Math.PI / 2;
  const aps = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), glowMat());
  aps.position.set(APS.point[0] - 0.05, 0, 0); aps.rotation.y = Math.PI / 2;
  group.add(dps, aps);
  return {
    group,
    update(s) {
      const q = TQ(s.q);
      group.quaternion.copy(q);
      const cg = V(s.cg).applyQuaternion(q);
      group.position.set(s.pos[0] - cg.x, s.pos[1] - cg.y, s.pos[2] - cg.z);
      for (let n = 1; n <= 16; n++) puffs[n].visible = s.jetsOn[n];
      dps.visible = s.stage === 'full';
      dps.material.opacity = Math.min(0.6, s.throttle);
      aps.material.opacity = s.stage === 'ascent' && s.apsOn && s.apsFuel > 0 ? 0.6 : 0;
    },
  };
}
