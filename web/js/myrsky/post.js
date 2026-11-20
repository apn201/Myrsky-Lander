// The camera: a lo-res, imperfect feed. Reference: the Apollo 11 TV pictures (slow-scan vidicon,
// converted for broadcast) and a cheap 1997 webcam. Three stages:
//  1. scene  -> low-resolution HDR render (about 400 lines), only ~10 times a second (frame hold)
//  2. sensor -> soft focus, blooming highlights, harsh exposure curve, washed colour, vidicon lag
//               (bright things leave trails), noise. Feeds back on the previous frame.
//  3. display-> scaled up softly; scan lines, line jitter, a slow hum bar, snow, static bursts,
//               rolling glitches, vignetting, glare and ghosts from the Sun.
// With the webcam filter off (layers panel) the clean full-resolution render is shown instead.
// Code written with an AI assistant (Claude Code, Anthropic), Nov 2026.
import * as THREE from 'three';

const LINES = 400;   // vertical resolution of the feed
const FPS = 10;      // frame rate of the feed

export function createPost(renderer, samples = 0) {
  const out = new THREE.Vector2(); renderer.getDrawingBufferSize(out);
  const mk = (w, h, depth) => {
    const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: depth ? samples : 0, depthBuffer: !!depth });
    t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
    if (depth) { t.depthTexture = new THREE.DepthTexture(w, h); t.depthTexture.type = THREE.FloatType; }
    return t;
  };
  let rtScene = mk(640, 400, true), fa = mk(640, 400), fb = mk(640, 400);
  const U = {
    tScene: { value: null }, tDepth: { value: null }, tPrev: { value: null }, tFrame: { value: null },
    res: { value: new THREE.Vector2(640, 400) }, outRes: { value: out.clone() }, time: { value: 0 }, exposure: { value: 1 },
    webcam: { value: 1 }, dof: { value: 1 }, focus: { value: 30 }, aperture: { value: 1 },
    near: { value: 0.1 }, far: { value: 30000 }, gain: { value: 0 }, glitch: { value: 0 }, glitchY: { value: 0.5 },
    signal: { value: 1 }, sunUV: { value: new THREE.Vector2(-9, -9) }, sunAmt: { value: 0 }, lag: { value: 0.5 },
    frameNo: { value: 0 }, burst: { value: 0 },
  };
  const common = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }`;

  // ---- stage 2: sensor (runs at feed resolution, only when a new frame is taken)
  const sensor = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv;
uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tPrev; uniform vec2 res; uniform float time;
uniform float webcam; uniform float dof; uniform float focus; uniform float aperture; uniform float near; uniform float far;
uniform float gain; uniform float lag; uniform float frameNo; uniform float exposure;
${common}
float linDepth(vec2 uv){ float z = texture2D(tDepth, uv).r * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
float coc(float d){ return clamp(abs(1.0 / focus - 1.0 / d) * aperture * 3.0, 0.0, 1.0); }
void main(){
  vec2 px = 1.0 / res;
  vec3 c = texture2D(tScene, vUv).rgb;
  // soft optics: always a little blur, more when out of focus
  float k = 0.8 + (dof > 0.5 ? coc(linDepth(vUv)) * 3.5 : 0.0);
  vec3 acc = c * 2.0; float ws = 2.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996 + hash(vUv * res) * 0.5; float r = sqrt(float(i) + 0.5) / 3.5 * k;
    acc += texture2D(tScene, vUv + vec2(cos(a), sin(a)) * r * px).rgb; ws += 1.0;
  }
  c = acc / ws;
  // blooming: bright areas bleed softly into their surroundings (round, a bit wider along the scan lines)
  vec3 bl = vec3(0.0);
  float rot = hash(vUv * res + 3.1) * 6.2832;
  for (int i = 0; i < 18; i++) {
    float a = float(i) * 2.39996 + rot; float r = 1.5 + float(i) * 0.55;
    bl += max(texture2D(tScene, vUv + vec2(cos(a) * 1.4, sin(a)) * r * px).rgb - 0.9, 0.0) / (1.0 + float(i) * 0.15);
  }
  bl *= 0.45;
  c += bl * 0.08;
  c *= exposure * 1.0;
  // harsh tube response: crushed blacks, clipped whites, high contrast
  vec3 t = 1.0 - exp(-c * 1.35);
  t = pow(t, vec3(1.0 / 2.0));
  t = smoothstep(0.04, 0.98, t);
  // washed-out colour of an old sensor, slightly warm-green
  float y = luma(t);
  t = mix(vec3(y), t, 0.35) * vec3(1.0, 1.0, 0.94);
  // noise baked into the frame (changes once per frame), stronger with gain
  float n = hash(floor(vUv * res) + frameNo * 1.731) - 0.5;
  t += n * (0.025 + 0.12 * gain);
  // vidicon lag: the tube keeps some of the last frame, bright things linger longest
  vec3 prev = texture2D(tPrev, vUv).rgb;
  t = max(mix(t, prev, lag), prev * (lag * 0.75));
  gl_FragColor = vec4(t, 1.0);
}`,
  });

  // ---- stage 3: display (runs every screen frame)
  const display = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv;
uniform sampler2D tFrame; uniform sampler2D tScene; uniform vec2 res; uniform vec2 outRes; uniform float time; uniform float webcam;
uniform float glitch; uniform float glitchY; uniform float signal; uniform vec2 sunUV; uniform float sunAmt; uniform float gain; uniform float burst;
uniform float exposure;
${common}
void main(){
  vec2 uv = vUv;
  if (webcam < 1.5) { // HD webcam (1) or completely clean (0): full-resolution picture
    vec2 c0 = vUv - 0.5; float rr = dot(c0 * vec2(outRes.x / outRes.y, 1.0), c0 * vec2(outRes.x / outRes.y, 1.0));
    vec2 u2 = vUv;
    if (webcam > 0.5) {
      u2 = 0.5 + c0 * (1.0 - 0.02 * rr);                      // slight barrel distortion
      float band = glitch * step(abs(u2.y - glitchY), 0.03);  // rare torn band
      u2.x += band * (hash(vec2(floor(u2.y * 90.0), floor(time * 20.0))) - 0.5) * 0.03;
    }
    vec3 c = texture2D(tScene, u2).rgb * exposure;
    if (webcam > 0.5) {
      // soft lens: a touch of blur and glow around highlights
      vec2 px = 1.0 / outRes;
      vec3 s = (texture2D(tScene, u2 + vec2(px.x, 0.0)).rgb + texture2D(tScene, u2 - vec2(px.x, 0.0)).rgb + texture2D(tScene, u2 + vec2(0.0, px.y)).rgb + texture2D(tScene, u2 - vec2(0.0, px.y)).rgb) * 0.25 * exposure;
      c = mix(c, s, 0.45);

      if (sunAmt > 0.0) {
        vec2 asp = vec2(outRes.x / outRes.y, 1.0); float ds = length((vUv - sunUV) * asp);
        c += vec3(0.85, 0.9, 1.0) * sunAmt * (0.025 + 0.2 * exp(-ds * 3.5) + 1.0 * exp(-ds * 14.0));
        vec2 axis = vec2(0.5) - sunUV;
        for (int i = 0; i < 3; i++) { float k = float(i) * 0.6 + 0.5; float rad = 0.05 + 0.05 * float(i);
          float gd = length((vUv - (sunUV + axis * k * 2.0)) * asp); c += vec3(0.8, 0.85, 1.0) * sunAmt * 0.05 * smoothstep(rad, rad * 0.5, gd); }
      }
    }
    c = pow(1.0 - exp(-c * 1.15), vec3(1.0 / 2.2));
    if (webcam > 0.5) {
      c *= 1.0 - 0.28 * rr;                                    // vignetting
      float n = hash(floor(vUv * outRes) + fract(time * 7.13) * 91.0) - 0.5;
      c += n * (0.018 + 0.06 * gain);                          // sensor noise, more at night
      c = 0.018 + c * 0.985;                                    // black is never quite black
      if (burst > 0.0) c = mix(c, vec3(hash(floor(vUv * outRes / 2.0) + time * 13.0)), burst * 0.5);
    }
    gl_FragColor = vec4(clamp(c, 0.0, 1.0) * signal, 1.0); return;
  }
  float line = floor(uv.y * res.y);
  // line jitter (sync wobble), stronger in a glitch band
  float jit = (hash(vec2(line, floor(time * 30.0))) - 0.5) * 0.0012;
  float band = glitch * step(abs(uv.y - glitchY), 0.05);
  jit += band * (hash(vec2(floor(uv.y * 60.0), floor(time * 20.0))) - 0.5) * 0.06;
  // slow vertical roll of a few pixels now and then
  uv.y += 0.003 * sin(time * 0.37) * step(0.97, fract(time * 0.05));
  uv.x += jit;
  // barrel distortion of the lens
  vec2 cc = uv - 0.5; float r2 = dot(cc * vec2(outRes.x / outRes.y, 1.0), cc * vec2(outRes.x / outRes.y, 1.0));
  uv = 0.5 + cc * (1.0 - 0.04 * r2);
  // horizontal chroma smear: colour comes from a wider horizontal window than brightness
  vec3 c = texture2D(tFrame, uv).rgb;
  vec3 cs = (texture2D(tFrame, uv + vec2(2.5 / res.x, 0.0)).rgb + texture2D(tFrame, uv - vec2(2.5 / res.x, 0.0)).rgb + c) / 3.0;
  float y = luma(c);
  c = y + (cs - luma(cs));
  // glare and ghosts when the Sun is near the frame
  if (sunAmt > 0.0) {
    vec2 asp = vec2(outRes.x / outRes.y, 1.0);
    float ds = length((vUv - sunUV) * asp);
    c += vec3(0.85, 0.9, 1.0) * sunAmt * (0.06 + 0.35 * exp(-ds * 3.0) + 1.2 * exp(-ds * 13.0));
    vec2 axis = vec2(0.5) - sunUV;
    for (int i = 0; i < 3; i++) {
      float k = float(i) * 0.6 + 0.5; float rad = 0.05 + 0.05 * float(i);
      float gd = length((vUv - (sunUV + axis * k * 2.0)) * asp);
      c += vec3(0.8, 0.85, 1.0) * sunAmt * 0.06 * smoothstep(rad, rad * 0.5, gd);
    }
    // vertical smear of the tube through the Sun
    c += vec3(0.9) * sunAmt * 0.35 * exp(-abs(vUv.x - sunUV.x) * outRes.x / 5.0);
  }
  // scan lines of the feed
  float sl = 0.82 + 0.18 * cos(uv.y * res.y * 6.2832);
  c *= sl;
  // slow hum bar rolling down the picture
  c *= 1.0 + 0.035 * sin((uv.y + time * 0.08) * 6.2832);
  // vignetting
  c *= 1.0 - 0.45 * r2;
  // snow: fine noise every screen frame, more at night
  float sn = hash(floor(vUv * outRes / 1.5) + fract(time * 7.13) * 91.0) - 0.5;
  c += sn * (0.03 + 0.06 * gain);
  // static burst: a moment of heavy snow and a torn band
  if (burst > 0.0) {
    float s2 = hash(floor(vUv * outRes / 2.0) + time * 13.0);
    c = mix(c, vec3(s2), burst * 0.55);
    c *= 1.0 - burst * 0.3 * step(0.5, hash(vec2(floor(uv.y * 30.0), floor(time * 25.0))));
  }
  c = 0.025 + c * 0.97;
  c *= signal;
  if (signal < 0.5) c = vec3(hash(floor(vUv * outRes / 2.0) + time * 31.0) * 0.35);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sensor);
  const pScene = new THREE.Scene(); pScene.add(quad);
  const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let last = -1e9, frameNo = 0, clean = false, aspect = 16 / 9;
  function sizeTargets() {
    const h = clean ? out.y : LINES, w = Math.round(clean ? out.x : LINES * aspect);
    for (const t of [rtScene, fa, fb]) t.setSize(w, h);
    U.res.value.set(w, h);
  }
  return {
    uniforms: U,
    setScale() {},
    setSize(w, h) { out.set(w, h); U.outRes.value.set(w, h); aspect = w / h; sizeTargets(); },
    // force: take a new frame now regardless of the frame hold
    render(sceneMain, camera, now = performance.now(), force = false) {
      const wantClean = U.webcam.value < 1.5;
      if (wantClean !== clean) { clean = wantClean; sizeTargets(); force = true; }
      if (force || now - last >= 1000 / (clean ? 15 : FPS)) {
        last = now; frameNo++;
        U.frameNo.value = frameNo % 1000;
        renderer.setRenderTarget(rtScene); renderer.render(sceneMain, camera);
        U.tScene.value = rtScene.texture; U.tDepth.value = rtScene.depthTexture; U.tPrev.value = fa.texture;
        quad.material = sensor; renderer.setRenderTarget(fb); renderer.render(pScene, ocam);
        const t = fa; fa = fb; fb = t;
      }
      U.tFrame.value = fa.texture; U.tScene.value = rtScene.texture;
      quad.material = display; renderer.setRenderTarget(null); renderer.render(pScene, ocam);
    },
  };
}
