// Camera look: the scene is rendered to an HDR target (4x MSAA, with depth), then one pass does
//   depth of field focused on the lander (circle of confusion from depth, 24-tap disc),
//   gentle sharpening where in focus, a filmic tone curve (ACES fit) and grade,
//   vignette, a little lateral chromatic aberration toward the corners, and film grain.
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
    time: { value: 0 }, dof: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tColor, tDepth; uniform vec2 res; uniform float near, far, focus, aperture, exposure, time, dof;
      float linZ(vec2 uv){ float d = texture2D(tDepth, uv).r; return near * far / (far - d * (far - near)); }
      // circle of confusion in pixels: thin-lens shape, capped
      float coc(float z){ float k = z < focus ? 0.35 : 1.0; return dof * clamp(k * aperture * abs(z - focus) / z * res.y * 0.006, 0.0, 6.0); }
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      const vec2 DISC[24] = vec2[24](
        vec2(0.0,1.0),vec2(0.71,0.71),vec2(1.0,0.0),vec2(0.71,-0.71),vec2(0.0,-1.0),vec2(-0.71,-0.71),vec2(-1.0,0.0),vec2(-0.71,0.71),
        vec2(0.0,0.6),vec2(0.52,0.3),vec2(0.52,-0.3),vec2(0.0,-0.6),vec2(-0.52,-0.3),vec2(-0.52,0.3),
        vec2(0.26,0.85),vec2(0.85,0.26),vec2(0.85,-0.26),vec2(0.26,-0.85),vec2(-0.26,-0.85),vec2(-0.85,-0.26),vec2(-0.85,0.26),vec2(-0.26,0.85),
        vec2(0.0,0.25),vec2(0.0,-0.25));
      void main(){
        vec2 px = 1.0 / res;
        float z = linZ(vUv), c = coc(z);
        vec3 col = texture2D(tColor, vUv).rgb;
        if (c > 0.6) {
          vec3 acc = col; float wsum = 1.0;
          for (int i = 0; i < 24; i++) {
            vec2 uv = vUv + DISC[i] * c * px;
            float cz = coc(linZ(uv));
            float w = smoothstep(0.0, 1.0, cz / max(c, 1e-3) + 0.2);   // keep sharp foreground from bleeding
            acc += texture2D(tColor, uv).rgb * w; wsum += w;
          }
          col = acc / wsum;
        } else {
          // light unsharp mask where in focus
          vec3 b = (texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb + texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb
                  + texture2D(tColor, vUv + vec2(0.0, px.y)).rgb + texture2D(tColor, vUv - vec2(0.0, px.y)).rgb) * 0.25;
          col += (col - b) * 0.45;
        }
        // lateral chromatic aberration toward the corners (cheap: shift red and blue a touch)
        vec2 dc = vUv - 0.5; float r2 = dot(dc, dc);
        col.r = mix(col.r, texture2D(tColor, vUv - dc * 0.0025).r, smoothstep(0.05, 0.4, r2));
        col.b = mix(col.b, texture2D(tColor, vUv + dc * 0.0025).b, smoothstep(0.05, 0.4, r2));
        col = aces(max(col, 0.0) * exposure);
        // grade: a touch of contrast, neutral-cool shadows, warm highlights
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, col * col * (3.0 - 2.0 * col), 0.25);
        col *= mix(vec3(0.97, 0.99, 1.03), vec3(1.03, 1.0, 0.96), smoothstep(0.2, 0.8, l));
        col *= 1.0 - 0.32 * smoothstep(0.12, 0.62, r2);                          // vignette
        col = pow(col, vec3(1.0 / 2.2));
        col += (hash(vUv * res + fract(time) * 91.7) - 0.5) * 0.035;            // grain
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
      rt.setSize(size.x, size.y);
      U.res.value.copy(size);
    },
    render(scene, camera) {
      U.near.value = camera.near; U.far.value = camera.far;
      U.time.value = performance.now() / 1000;
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(pScene, ocam);
    },
  };
}
