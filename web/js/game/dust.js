// Descent engine dust and crash debris.
//
// Dust on the Moon: no air, so the exhaust throws regolith out in flat, straight, fast sheets at a few
// degrees above the ground (Apollo crews saw it from about 30 m; it hid the surface in the last metres
// and stopped the instant the engine did). Two layers:
//   sheet:     a radial disc that follows the terrain under the lander, with streaks racing outward
//   particles: individual grains flying out low and fast, falling back ballistically
// Impacts (a breakup) throw a burst of slower, higher ejecta.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import * as THREE from 'three';

const N = 4000;

export function createDust(scene, terrainHeight, sunColor) {
  // ---- particles ----
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const alpha = new Float32Array(N);
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(0.62, 0.58, 0.53).multiply(sunColor) }, scale: { value: 300 } },
    vertexShader: `attribute float alpha; varying float vA; uniform float scale;
      void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(scale * 0.35 / -mv.z, 1.0, 6.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(color, vA * (1.0 - r * 4.0)); }`,
  });
  const points = new THREE.Points(geo, pmat);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;

  // ---- sheet: radial grid that hugs the terrain ----
  const RINGS = 18, SEG = 72, RMAX = 70;
  const sgeo = new THREE.BufferGeometry();
  const spos = new Float32Array((RINGS + 1) * SEG * 3), suv = new Float32Array((RINGS + 1) * SEG * 2);
  const idx = [];
  for (let r = 0; r <= RINGS; r++) for (let a = 0; a < SEG; a++) {
    const k = r * SEG + a;
    suv[k * 2] = a / SEG; suv[k * 2 + 1] = r / RINGS;
    if (r < RINGS) { const b = r * SEG + (a + 1) % SEG, c = k + SEG, d = b + SEG; idx.push(k, c, b, b, c, d); }
  }
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sgeo.setAttribute('uv', new THREE.BufferAttribute(suv, 2));
  sgeo.setIndex(idx);
  const smat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { t: { value: 0 }, amt: { value: 0 }, color: { value: new THREE.Color(0.6, 0.57, 0.52).multiply(sunColor) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t, amt; uniform vec3 color;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      float streak(float a, float r){
        float i = floor(a * 380.0), f = fract(a * 380.0);
        float lane = smoothstep(0.0, 0.5, f) * smoothstep(1.0, 0.5, f);
        float sp = 0.7 + h(i) * 0.8;
        float k = fract(r * (2.0 + h(i + 3.0) * 3.0) - t * sp * 1.6 + h(i + 7.0));
        return lane * smoothstep(0.0, 0.25, k) * smoothstep(1.0, 0.45, k) * (0.4 + 0.6 * h(i + 11.0));
      }
      void main(){
        float r = vUv.y;
        // irregular: two streak layers, slow angular gusts, density falling off with distance
        float gust = 0.55 + 0.45 * sin(vUv.x * 37.0 + t * 0.7) * sin(vUv.x * 11.0 - t * 0.4);
        float s = (streak(vUv.x, r) * 0.6 + streak(vUv.x + 0.37, r * 1.3 + 0.2) * 0.4) * gust;
        float fall = smoothstep(0.0, 0.03, r) * (1.0 - smoothstep(0.08, 0.75, r));
        float a = amt * fall * (0.10 + 0.5 * s);
        gl_FragColor = vec4(color, clamp(a, 0.0, 0.5));
      }`,
  });
  const sheet = new THREE.Mesh(sgeo, smat);
  sheet.frustumCulled = false; sheet.renderOrder = 2;
  scene.add(sheet);

  function emit(c, n, speed, elev, r0, height) {
    for (let i = 0; i < n; i++) {
      const k = next; next = (next + 1) % N;
      const a = Math.random() * Math.PI * 2, el = elev[0] + Math.random() * (elev[1] - elev[0]);
      const sp = speed[0] + Math.random() * (speed[1] - speed[0]), rr = r0[0] + Math.random() * (r0[1] - r0[0]);
      pos[k * 3] = c.x + Math.cos(a) * rr; pos[k * 3 + 2] = c.z + Math.sin(a) * rr;
      pos[k * 3 + 1] = terrainHeight(pos[k * 3], pos[k * 3 + 2]) + height * Math.random();
      vel[k * 3] = Math.cos(a) * Math.cos(el) * sp; vel[k * 3 + 1] = Math.sin(el) * sp; vel[k * 3 + 2] = Math.sin(a) * Math.cos(el) * sp;
      life[k] = 1.6 + Math.random();
    }
  }

  let burstDone = null;
  const centre = new THREE.Vector3();
  return {
    // nozzle: world position of the engine exit; thrust: N; dt: s; burstAt: time of a breakup (or null)
    update(nozzle, thrust, dt, time, burst) {
      const gy = terrainHeight(nozzle.x, nozzle.z);
      const hh = Math.max(0, nozzle.y - gy);
      const amt = Math.min(1, thrust / 12000) * Math.pow(Math.max(0, Math.min(1, 1 - (hh - 2) / 30)), 1.5);
      centre.set(nozzle.x, gy, nozzle.z);
      if (amt > 0.01) emit(centre, Math.ceil(amt * 900 * dt * 60 / 60 * 6), [25, 75], [0.006, 0.07], [1.5, 6], 0.25);
      if (burst != null && burstDone !== burst) { burstDone = burst; emit(centre, 1600, [3, 18], [0.15, 0.9], [0.5, 4], 0.5); }
      // grains
      for (let k = 0; k < N; k++) {
        if (life[k] <= 0) { alpha[k] = 0; continue; }
        life[k] -= dt;
        vel[k * 3 + 1] -= 1.62 * dt;
        pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        if (pos[k * 3 + 1] < terrainHeight(pos[k * 3], pos[k * 3 + 2]) - 0.05) life[k] = 0;
        alpha[k] = Math.min(0.45, life[k] * 0.5);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
      // sheet follows the terrain under the nozzle
      smat.uniforms.amt.value = amt;
      smat.uniforms.t.value = time;
      sheet.visible = amt > 0.01;
      if (sheet.visible) {
        for (let r = 0; r <= RINGS; r++) {
          const rad = 0.5 + (r / RINGS) * (r / RINGS) * RMAX;
          for (let a = 0; a < SEG; a++) {
            const k = r * SEG + a, ang = a / SEG * Math.PI * 2;
            const x = centre.x + Math.cos(ang) * rad, z = centre.z + Math.sin(ang) * rad;
            spos[k * 3] = x; spos[k * 3 + 1] = terrainHeight(x, z) + 0.15 + 0.6 * (r / RINGS); spos[k * 3 + 2] = z;
          }
        }
        sgeo.attributes.position.needsUpdate = true;
      }
      return amt;
    },
  };
}

// Crash debris meshes: foil shards, panels, struts and boxes, posed from the physics list.
export function createDebris(scene) {
  const foil = new THREE.MeshStandardMaterial({ color: 0xc8962e, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
  const panel = new THREE.MeshStandardMaterial({ color: 0x9c9a94, metalness: 0.3, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, metalness: 0.3, roughness: 0.6 });
  const geos = {
    foil: new THREE.PlaneGeometry(1, 0.7, 3, 2),
    panel: new THREE.BoxGeometry(1, 0.05, 0.6),
    strut: new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6),
    box: new THREE.BoxGeometry(0.5, 0.35, 0.4),
  };
  // crumple the foil a little
  const p = geos.foil.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.12);
  geos.foil.computeVertexNormals();
  const mats = { foil, panel, strut: foil, box: dark };
  const meshes = [];
  return {
    update(list) {
      if (!list) { meshes.forEach(m => { m.visible = false; }); return; }
      while (meshes.length < list.length) {
        const d = list[meshes.length];
        const m = new THREE.Mesh(geos[d.kind], mats[d.kind]);
        m.castShadow = m.receiveShadow = true;
        scene.add(m); meshes.push(m);
      }
      list.forEach((d, i) => {
        const m = meshes[i];
        m.visible = true;
        m.position.set(d.p[0], d.p[1], d.p[2]);
        m.scale.setScalar(d.size);
        m.quaternion.setFromAxisAngle(new THREE.Vector3(...d.ax).normalize(), d.ang);
      });
      for (let i = list.length; i < meshes.length; i++) meshes[i].visible = false;
    },
  };
}
