// Camera look: the scene is rendered to an HDR target (4x MSAA, with depth), then one pass does
//   depth of field focused on the lander (circle of confusion from depth, 24-tap disc),
//   gentle sharpening where in focus, a filmic tone curve (ACES fit) and grade,
//   vignette, a little lateral chromatic aberration toward the corners, and film grain.
// Looks (G cycles): TV transmission (default: everything rendered at about half resolution and run
// through the same video chain, lander and ground alike: horizontal bandwidth smear, bloom on bright
// foil, scan lines, snow, line jitter), 16 mm film, clean.
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.
import * as THREE from 'three';

export function createPost(renderer) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
  rt.depthTexture.type = THREE.FloatType;

  const U = {
    tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture },
    res: { value: size.clone() }, near: { value: 0.5 }, far: { value: 40000 },
    focus: { value: 100 }, aperture: { value: 1 }, exposure: { value: 1 },
    time: { value: 0 }, dof: { value: 1 }, film: { value: 0 }, tv: { value: 1 }, frame: { value: 0 }, outRes: { value: size.clone() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float near, far, focus, aperture, exposure, time, dof, film, tv, frame; uniform vec2 outRes;
      float linZ(vec2 uv){ float d = texture2D(tDepth, uv).r; return near * far / (far - d * (far - near)); }
      // circle of confusion in pixels: thin-lens shape, capped
      float coc(float z){ float k = z < focus ? 0.15 : 1.0; return dof * clamp(k * aperture * abs(z - focus) / z * res.y * 0.006, 0.0, 6.0); }
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }   // no sine: no banding
      const vec2 DISC[24] = vec2[24](
        vec2(0.0,1.0),vec2(0.71,0.71),vec2(1.0,0.0),vec2(0.71,-0.71),vec2(0.0,-1.0),vec2(-0.71,-0.71),vec2(-1.0,0.0),vec2(-0.71,0.71),
        vec2(0.0,0.6),vec2(0.52,0.3),vec2(0.52,-0.3),vec2(0.0,-0.6),vec2(-0.52,-0.3),vec2(-0.52,0.3),
        vec2(0.26,0.85),vec2(0.85,0.26),vec2(0.85,-0.26),vec2(0.26,-0.85),vec2(-0.26,-0.85),vec2(-0.85,-0.26),vec2(-0.85,0.26),vec2(-0.26,0.85),
        vec2(0.0,0.25),vec2(0.0,-0.25));
      void main(){
        vec2 px = 1.0 / res;
        // 16 mm film: gate weave (the frame wanders by a pixel or two, changing 24 times a second)
        vec2 uv0 = vUv + film * (vec2(hash(vec2(frame, 1.3)), hash(vec2(frame, 7.1))) - 0.5) * px * 0.9;
        // TV: each scan line lands a little early or late (sync jitter), now and then a torn band
        float line = floor(vUv.y * 262.0);
        uv0.x += tv * ((hash(vec2(line, frame)) - 0.5) * 0.0011 + step(0.985, hash(vec2(floor(line / 9.0), floor(frame / 3.0)))) * 0.004);
        float z = linZ(uv0), c = coc(z);
        vec3 col = texture2D(tColor, uv0).rgb;
        if (c > 0.6) {
          vec3 acc = col; float wsum = 1.0;
          for (int i = 0; i < 24; i++) {
            vec2 uv = uv0 + DISC[i] * c * px;
            float cz = coc(linZ(uv));
            float w = smoothstep(0.0, 1.0, cz / max(c, 1e-3) + 0.2);   // keep sharp foreground from bleeding
            acc += texture2D(tColor, uv).rgb * w; wsum += w;
          }
          col = acc / wsum;
        } else if (tv < 0.5) {
          // light unsharp mask where in focus
          vec3 b = (texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb + texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb
                  + texture2D(tColor, vUv + vec2(0.0, px.y)).rgb + texture2D(tColor, vUv - vec2(0.0, px.y)).rgb) * 0.25;
          col += (col - b) * 0.45;
        }
        // lateral chromatic aberration toward the corners (cheap: shift red and blue a touch)
        vec2 dc = vUv - 0.5; float r2 = dot(dc, dc);
        col.r = mix(col.r, texture2D(tColor, vUv - dc * 0.0025).r, smoothstep(0.05, 0.4, r2));
        col.b = mix(col.b, texture2D(tColor, vUv + dc * 0.0025).b, smoothstep(0.05, 0.4, r2));
        if (tv > 0.5) {
          // video bandwidth: a soft horizontal smear; bright foil blooms on the camera tube
          vec3 h1 = texture2D(tColor, uv0 + vec2(px.x * 1.5, 0.0)).rgb, h2 = texture2D(tColor, uv0 - vec2(px.x * 1.5, 0.0)).rgb;
          col = col * 0.5 + (h1 + h2) * 0.25;
          vec3 bl = vec3(0.0);
          for (int i = 0; i < 8; i++) bl += max(texture2D(tColor, uv0 + DISC[i] * px * 4.0).rgb - 1.1, 0.0);
          col += bl * 0.08;
        }
        float flick = 1.0 + (film * 0.02 + tv * 0.015) * (hash(vec2(frame, 3.7)) - 0.5);   // exposure flicker
        col = aces(max(col, 0.0) * exposure * flick);
        // grade: a touch of contrast, neutral-cool shadows, warm highlights
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, col * col * (3.0 - 2.0 * col), 0.25);
        col *= mix(vec3(0.97, 0.99, 1.03), vec3(1.03, 1.0, 0.96), smoothstep(0.2, 0.8, l));
        col *= 1.0 - 0.32 * smoothstep(0.12, 0.62, r2);                          // vignette
        if (film > 0.5) {
          // colour reversal film: slightly less saturation, warm mids; blacks stay black
          col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.9);
          col *= vec3(1.02, 1.0, 0.96);
        }
        col = pow(col, vec3(1.0 / 2.2));
        // fine grain, strongest in the mid-tones (film grain hardly shows in deep black or bright white)
        float lum = dot(col, vec3(0.3, 0.59, 0.11));
        float gs = (film > 0.5 ? 0.045 : 0.02) * smoothstep(0.02, 0.25, lum) * (1.2 - lum);
        col += (hash(floor(gl_FragCoord.xy) + vec2(frame * 37.0, frame * 17.0)) - 0.5) * gs;
        if (film > 0.5) col = mix(col, vec3(0.05), step(0.99996, hash(floor(vUv * res / 2.0) + frame * 0.37)) * 0.6);   // rare dust specks
        if (tv > 0.5) {
          // broadcast picture: greyish blacks, softer colour, scan lines, snow
          col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.8) * 0.94 + 0.035;
          float sl = 0.5 + 0.5 * cos(gl_FragCoord.y * 3.14159 * 0.5);          // one dark row in two (at 2 px per line)
          col *= mix(0.74, 1.0, sl);
          col += (hash(floor(gl_FragCoord.xy / vec2(2.0, 1.0)) + frame * 11.3) - 0.5) * 0.06;
          col *= 1.0 - 0.18 * smoothstep(0.15, 0.6, r2);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const pScene = new THREE.Scene(); pScene.add(quad);
  const ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms: U,
    setSize() {
      renderer.getDrawingBufferSize(size);
      const k = U.tv.value > 0.5 ? 0.55 : 1;                  // TV: about half resolution, like the video
      rt.setSize(Math.round(size.x * k), Math.round(size.y * k));
      U.res.value.set(Math.round(size.x * k), Math.round(size.y * k));
      U.outRes.value.copy(size);
    },
    // cycle the look: TV -> film -> clean -> TV
    cycleLook() {
      const tv = U.tv.value > 0.5, film = U.film.value > 0.5;
      U.tv.value = !tv && !film ? 1 : 0;
      U.film.value = tv ? 1 : 0;
      this.setSize();
      return U.tv.value > 0.5 ? 'tv' : U.film.value > 0.5 ? 'film' : 'clean';
    },
    render(scene, camera) {
      U.near.value = camera.near; U.far.value = camera.far;
      U.time.value = performance.now() / 1000;
      U.frame.value = Math.floor(U.time.value * 24) % 1000;
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(pScene, ocam);
    },
  };
}
