// Boulders: the landing hazard on top of the LROC terrain.
// LROC's 2 m height model shows the craters but not rocks smaller than a few metres, so the boulders
// are generated from the size-frequency law measured by Surveyor 3 in this crater (as in Myrsky):
//   N(>= y mm) = 3e6 * y^-2.56 per 100 m²  (JPL PD 125, fig VII-19)
// Only rocks big enough to matter to a footpad or the descent engine nozzle (0.25 m radius up) are
// made. Each is half buried. Physics and picture use the same ellipsoid caps: a footpad on a rock
// tilts the lander, a rock under the descent stage can hit the nozzle.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import * as THREE from 'three';

const AREA = { x0: -220, x1: 620, z0: -45, z1: 45 };   // along the approach (west of x1 to beyond the target)
const CELL = 4;
const CLEAR = { x: 0, z: 0, r: 8 };                     // Intrepid's spot kept clear

// density: 1 = the measured Surveyor 3 density; the game default is 4 (more boulders than the real site,
// so there is something to avoid on every approach)
export const ROCK_DENSITY = { real: 1, game: 4 };
export function makeRocks(terrainH, seed = 12, density = ROCK_DENSITY.game) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const area = (AREA.x1 - AREA.x0) * (AREA.z1 - AREA.z0);
  const yMin = 500;                                      // diameter 0.5 m (radius 0.25 m) and up
  const count = Math.round(density * area / 100 * 3e6 * Math.pow(yMin, -2.56));
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const x = AREA.x0 + rnd() * (AREA.x1 - AREA.x0), z = AREA.z0 + rnd() * (AREA.z1 - AREA.z0);
    const d = yMin * Math.pow(rnd(), -1 / 2.56) / 1000;  // diameter, inverse CDF of the power law
    const r = Math.min(d / 2, 2.2);
    if (Math.hypot(x - CLEAR.x, z - CLEAR.z) < CLEAR.r + r) continue;
    const ry = r * (0.65 + 0.3 * rnd());                 // vertical semi-axis
    const prot = ry * (0.45 + 0.3 * rnd());              // height above the ground (half buried)
    const g = terrainH(x, z);
    rocks.push({ x, z, r, ry, cy: g + prot - ry, prot, rot: rnd() * 6.28, tilt: [rnd() * 0.4, rnd() * 0.4], shape: i % 3 });
  }
  // spatial hash for height queries
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const rk of rocks) {
    for (let i = Math.floor((rk.x - rk.r) / CELL); i <= Math.floor((rk.x + rk.r) / CELL); i++)
      for (let j = Math.floor((rk.z - rk.r) / CELL); j <= Math.floor((rk.z + rk.r) / CELL); j++) {
        const k = key(i, j);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(rk);
      }
  }
  // top of the rocks at a point (or -Infinity)
  function top(x, z) {
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return -Infinity;
    let h = -Infinity;
    for (const rk of list) {
      const u = (x - rk.x) / rk.r, v = (z - rk.z) / rk.r, q = 1 - u * u - v * v;
      if (q > 0) h = Math.max(h, rk.cy + rk.ry * Math.sqrt(q));
    }
    return h;
  }
  return {
    rocks,
    height: (x, z) => Math.max(terrainH(x, z), top(x, z)),
    // how far rocks stick up above the ground anywhere within radius R of (x, z)
    maxRock(x, z, R) {
      let m = 0;
      for (let i = Math.floor((x - R) / CELL); i <= Math.floor((x + R) / CELL); i++)
        for (let j = Math.floor((z - R) / CELL); j <= Math.floor((z + R) / CELL); j++)
          for (const rk of grid.get(key(i, j)) || []) if (Math.hypot(rk.x - x, rk.z - z) < R + rk.r * 0.5) m = Math.max(m, rk.prot);
      return m;
    },
  };
}

// Instanced rock meshes matching the physics caps, dust-grey basalt with the soil's own grain
// (crew photo AS12-49-7284) laid over it.
export function rockMeshes(rocks, grain, decorate = m => m) {
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
  const geos = [0, 1, 2].map(v => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position, o = [rnd() * 50, rnd() * 50, rnd() * 50];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = 0.9 + 0.1 * hash(Math.round(x * 3 + o[0]), Math.round(y * 3 + o[1]), Math.round(z * 3 + o[2])) + 0.05 * Math.sin(x * 5 + o[2]) * Math.cos(z * 4 + o[1]);
      p.setXYZ(i, x * f, y * f, z * f);
    }
    g.computeVertexNormals();
    return g;
  });
  const mat = new THREE.MeshStandardMaterial({ color: 0x625d58, roughness: 1.0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.tGrain = { value: grain };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 rw = modelMatrix * instanceMatrix * vec4(transformed, 1.0); vRW = rw.xyz; vRN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGrain; varying vec3 vRW; varying vec3 vRN;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec3 bw = pow(abs(vRN), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
      float gr = texture2D(tGrain, vRW.zy / 0.45).r * bw.x + texture2D(tGrain, vRW.xz / 0.45).r * bw.y + texture2D(tGrain, vRW.xy / 0.45).r * bw.z;
      diffuseColor.rgb *= 1.0 + 1.1 * (gr * 1.99 - 1.0);
      // far away a boulder is only a dark speck: fade rocks out with distance (dithered, no sorting)
      float rd = distance(vRW, cameraPosition);
      if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) < smoothstep(110.0, 170.0, rd)) discard;`);
  };
  mat.customProgramCacheKey = () => 'game-rock-v2';
  decorate(mat);
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  geos.forEach((g, gi) => {
    const list = rocks.filter(r => r.shape === gi);
    const im = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((r, k) => {
      p3.set(r.x, r.cy, r.z);
      q.setFromEuler(new THREE.Euler(r.tilt[0] * 0.3, r.rot, r.tilt[1] * 0.3));
      sc.set(r.r, r.ry, r.r);
      im.setMatrixAt(k, m4.compose(p3, q, sc));
    });
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    group.add(im);
  });
  return group;
}
