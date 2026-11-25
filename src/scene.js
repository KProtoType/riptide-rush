// Photoreal Marine Renderer for Riptide Rush:
//  - Physical Rayleigh/Mie Sky + Volumetric self-shadowed Clouds
//  - Dynamic HDR PMREM Environment Dome (blazing sun + sky + ocean bounce)
//  - Live Mirrored Planar Water Reflection Pass (sky + venue landmarks)
//  - Post-Processing: MSAA HalfFloat RT -> UnrealBloomPass -> AgX Filmic Tone Mapping,
//    Optical Sun Flare + Anamorphic Streak, Radial Speed Motion Blur, and
//    Physical Refractive Water-Droplet Lens Splashes!

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PERF } from './perf.js';

// Shared shader environment state
export const ENV_STATE = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() },
  uSunCol: { value: new THREE.Color('#fff5de') },
  uSkyTop: { value: new THREE.Color('#0e58b8') },
  uSkyHorizon: { value: new THREE.Color('#c9eef6') },
  uFogCol: { value: new THREE.Color('#b4e1ee') },
  uFogNear: { value: 260 },
  uFogFar: { value: 1750 },
  uWaterRefl: { value: null },
  uWaterReflOn: { value: 1.0 },
  uStorm: { value: 0.0 },
};

// Procedural seamless RGB tileable noise texture (for volumetric clouds & water micro-ripples)
let _noiseTex = null;
export function getNoiseTex() {
  if (_noiseTex) return _noiseTex;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const hash = (x, y, seed) => {
    const h = Math.sin(((x & 255) * 127.1 + (y & 255) * 311.7 + seed * 74.7)) * 43758.5453;
    return h - Math.floor(h);
  };
  const vnoise = (u, v, freq, seed) => {
    const x = u * freq, y = v * freq;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const p = freq;
    const a = hash((x0 % p + p) % p, (y0 % p + p) % p, seed);
    const b = hash(((x0 + 1) % p + p) % p, (y0 % p + p) % p, seed);
    const c = hash((x0 % p + p) % p, ((y0 + 1) % p + p) % p, seed);
    const d = hash(((x0 + 1) % p + p) % p, ((y0 + 1) % p + p) % p, seed);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n1 =
        vnoise(u, v, 8, 1) * 0.52 +
        vnoise(u, v, 16, 2) * 0.30 +
        vnoise(u, v, 32, 3) * 0.18;
      const n2 =
        vnoise(u, v, 12, 7) * 0.55 +
        vnoise(u, v, 24, 8) * 0.30 +
        vnoise(u, v, 48, 9) * 0.15;
      const n3 = vnoise(u, v, 32, 13) * 0.65 + vnoise(u, v, 64, 17) * 0.35;
      const idx = (y * S + x) * 4;
      data[idx] = Math.round(n1 * 255);
      data[idx + 1] = Math.round(n2 * 255);
      data[idx + 2] = Math.round(n3 * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  _noiseTex = tex;
  return tex;
}

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = `
uniform vec3 top;
uniform vec3 mid;
uniform vec3 horizon;
uniform vec3 groundCol;
uniform vec3 sunCol;
uniform vec3 sunDir;
uniform float sunAmt;
uniform float hdrSun;
uniform float cloudAmt;
uniform float cloudDark;
uniform float haze;
uniform float time;
uniform sampler2D tN;
varying vec3 vDir;

float cloudFbm(vec2 uv) {
  vec4 n1 = texture2D(tN, uv * 0.25 + vec2(time * 0.0024, time * 0.0014));
  vec4 n2 = texture2D(tN, uv * 0.72 + vec2(-time * 0.0032, time * 0.0018) + 0.37);
  vec4 n3 = texture2D(tN, uv * 2.05 + vec2(time * 0.0044, -time * 0.0016) + 0.71);
  return n1.r * 0.56 + n2.g * 0.30 + n3.b * 0.14;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sDir = normalize(sunDir);
  float cosT = max(dot(d, sDir), 0.0);

  // Rayleigh zenith-to-horizon scattering
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.20, max(h, 0.0)));
  c = mix(c, top, smoothstep(0.14, 0.78, max(h, 0.0)));

  if (h < 0.0) {
    float gd = smoothstep(0.0, -0.35, h);
    vec3 gCol = mix(horizon * 0.72, groundCol, gd);
    c = mix(horizon * 0.90, gCol, smoothstep(0.0, -0.07, h));
  }

  // Mie forward scattering & crisp HDR solar disc
  float horBand = exp(-max(h, 0.0) * 9.0);
  float mieGlow = pow(cosT, 5.0) * 0.34 + pow(cosT, 28.0) * 0.42;
  c = mix(c, horizon, haze * exp(-max(h, 0.0) * 13.0));
  c += sunCol * sunAmt * (mieGlow * (0.45 + 0.55 * horBand) + pow(cosT, 620.0) * hdrSun);

  // Volumetric-lit multi-layer clouds with Beer-Lambert self-shadowing & silver lining
  if (cloudAmt > 0.005 && h > 0.004) {
    vec2 uv = d.xz / (h + 0.14) * 0.48 + vec2(0.27, 0.19);
    float dens = cloudFbm(uv);
    float cov = clamp(cloudAmt, 0.0, 0.96);
    float cl = smoothstep(0.56 - cov * 0.34, 0.85 - cov * 0.18, dens) * smoothstep(0.01, 0.20, h);

    vec2 sunOff = sDir.xz / max(sDir.y + 0.32, 0.24) * 0.06;
    float densSun = cloudFbm(uv + sunOff);
    float lightTrans = exp(-max(densSun - 0.30, 0.0) * (2.6 + cloudDark * 2.5));
    vec3 litCol = mix(vec3(1.0), sunCol, 0.38) * (0.94 + 0.28 * lightTrans);
    vec3 shadCol = mix(mid * 0.62, horizon * 0.48, 0.5) * (1.0 - cloudDark * 0.44);
    vec3 cc = mix(shadCol, litCol, clamp(lightTrans * 1.15, 0.0, 1.0));
    float silver = pow(cosT, 14.0) * (1.0 - smoothstep(0.55, 0.90, dens)) * 1.35;
    cc += sunCol * silver * sunAmt;
    float farFade = smoothstep(0.012, 0.17, h);
    cc = mix(horizon, cc, farFade);
    c = mix(c, cc, cl * (0.88 + 0.1 * cloudDark));
  }

  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
}`;

function computeAtmosphere(venue, weather) {
  const base = venue.skyPalette.sunny;
  const out = Object.assign(
    {
      bloomStr: 0.22,
      bloomThresh: 1.28,
      sat: 1.06,
      contrast: 1.09,
      lift: 0.006,
      vig: 0.24,
      shadowTint: [0.92, 0.97, 1.06],
      highTint: [1.05, 1.01, 0.95],
      stormAmt: 0.0,
    },
    base
  );

  if (weather === 'sunset') {
    out.el = 0.15;
    out.az = venue.id === 'harbor' ? 2.65 : venue.id === 'fjord' ? 0.92 : 0.62;
    out.top = '#1b2b5e';
    out.mid = '#b05e56';
    out.horizon = '#ffab66';
    out.sun = '#ffc06e';
    out.ground = '#2b2024';
    out.fog = '#e39e74';
    out.fogNear = base.fogNear * 0.88;
    out.fogFar = base.fogFar * 0.85;
    out.sunInt = 5.6;
    out.hemiSky = '#f0a67c';
    out.hemiGround = '#303b48';
    out.hemiInt = 1.18;
    out.envInt = 1.42;
    out.exposure = 1.08;
    out.cloud = 0.50;
    out.cloudDark = 0.28;
    out.haze = 0.44;
    out.bloomStr = 0.30;
    out.bloomThresh = 1.12;
    out.sat = 1.14;
    out.contrast = 1.13;
    out.shadowTint = [0.87, 0.92, 1.14];
    out.highTint = [1.11, 1.00, 0.86];
    out.stormAmt = 0.0;
  } else if (weather === 'storm') {
    out.el = 0.34;
    out.top = '#1f2b3a';
    out.mid = '#485b6d';
    out.horizon = '#7c8f9e';
    out.sun = '#cfe0f0';
    out.ground = '#0d1a26';
    out.fog = '#697c8c';
    out.fogNear = base.fogNear * 0.54;
    out.fogFar = base.fogFar * 0.52;
    out.sunInt = 2.25;
    out.hemiSky = '#89a3b8';
    out.hemiGround = '#1b2a34';
    out.hemiInt = 1.55;
    out.envInt = 1.38;
    out.exposure = 1.14;
    out.cloud = 0.90;
    out.cloudDark = 0.74;
    out.haze = 0.56;
    out.bloomStr = 0.26;
    out.bloomThresh = 1.08;
    out.sat = 0.96;
    out.contrast = 1.14;
    out.shadowTint = [0.88, 0.95, 1.10];
    out.highTint = [0.97, 1.01, 1.06];
    out.stormAmt = 1.0;
  }
  return out;
}

const MAX_DROPS = 14;
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _t = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _camFwd = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _sunW = new THREE.Vector3();

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PERF.dprCap));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // AgX applied cleanly in final pass

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.35, 6500);

  // ---- Lights
  const hemi = new THREE.HemisphereLight('#98d4ff', '#1a6875', 1.45);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff5de', 5.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(PERF.shadowSize, PERF.shadowSize);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 2.4;
  const sc = sun.shadow.camera;
  sc.left = -PERF.shadowBox;
  sc.right = PERF.shadowBox;
  sc.top = PERF.shadowBox;
  sc.bottom = -PERF.shadowBox;
  sc.near = 1;
  sc.far = 360;
  scene.add(sun, sun.target);

  const sunDir = new THREE.Vector3(0.5, 0.7, 0.4).normalize();

  // ---- Visible Physical Sky Dome
  const skyU = {
    top: { value: new THREE.Color('#0e58b8') },
    mid: { value: new THREE.Color('#4a9ce6') },
    horizon: { value: new THREE.Color('#c9eef6') },
    groundCol: { value: new THREE.Color('#0d4a66') },
    sunCol: { value: new THREE.Color('#fff5de') },
    sunDir: { value: sunDir },
    sunAmt: { value: 1.0 },
    hdrSun: { value: 9.0 },
    cloudAmt: { value: 0.34 },
    cloudDark: { value: 0.1 },
    haze: { value: 0.22 },
    time: ENV_STATE.uTime,
    tN: { value: getNoiseTex() },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyU,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 40, 24), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // ---- HDR Environment Dome for PMREM Reflections
  const envU = {
    top: skyU.top,
    mid: skyU.mid,
    horizon: skyU.horizon,
    groundCol: skyU.groundCol,
    sunCol: skyU.sunCol,
    sunDir: skyU.sunDir,
    sunAmt: { value: 1.0 },
    hdrSun: { value: 36.0 },
    cloudAmt: skyU.cloudAmt,
    cloudDark: skyU.cloudDark,
    haze: skyU.haze,
    time: { value: 0 },
    tN: skyU.tN,
  };
  const envSky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 18),
    new THREE.ShaderMaterial({
      uniforms: envU,
      vertexShader: SKY_VERT.replace('gl_Position.z = gl_Position.w;', ''),
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  const envScene = new THREE.Scene();
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  // ---- Live Mirrored Planar Water Reflection Target
  let reflRT = new THREE.WebGLRenderTarget(
    PERF.waterReflectSize || 384,
    Math.round((PERF.waterReflectSize || 384) * 0.56),
    {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      type: THREE.HalfFloatType,
    }
  );
  const reflCam = camera.clone();
  const reflScene = new THREE.Scene();
  const reflSky = new THREE.Mesh(new THREE.SphereGeometry(4200, 28, 16), skyMat);
  reflSky.renderOrder = -10;
  reflSky.frustumCulled = false;
  reflScene.add(reflSky);
  const reflHemi = new THREE.HemisphereLight('#98d4ff', '#1a6875', 1.4);
  const reflSun = new THREE.DirectionalLight('#fff5de', 4.5);
  reflScene.add(reflHemi, reflSun);
  const reflWorldRoot = new THREE.Group();
  reflScene.add(reflWorldRoot);
  ENV_STATE.uWaterRefl.value = reflRT.texture;
  let reflFrame = 0;

  // ---- Water-Droplet Lens Splash state (14 droplets: xy, radius, life)
  const drops = Array.from({ length: MAX_DROPS }, () => ({
    x: 0,
    y: -2,
    r: 0,
    life: 0,
    maxLife: 1,
    vy: 0,
  }));
  const dropUniforms = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4(0, -2, 0, 0));
  let dropCursor = 0;

  function spawnLensSplash(strength = 0.8) {
    const count = Math.max(2, Math.round(strength * 7 * (PERF.droplets || 0.8)));
    for (let i = 0; i < count; i++) {
      const d = drops[dropCursor];
      dropCursor = (dropCursor + 1) % MAX_DROPS;
      // Favor edges & upper-mid lens so center remains crystal clear for racing!
      const side = Math.random() < 0.5 ? -1 : 1;
      const rx = 0.5 + side * (0.14 + Math.random() * 0.34);
      const ry = 0.22 + Math.random() * 0.68;
      d.x = Math.max(0.05, Math.min(0.95, rx));
      d.y = ry;
      d.r = 0.011 + Math.random() * 0.022 * Math.min(1.2, strength);
      d.maxLife = 1.15 + Math.random() * 1.45;
      d.life = d.maxLife;
      d.vy = 0.012 + Math.random() * 0.032;
    }
  }

  function updateDroplets(dt) {
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = drops[i];
      if (d.life > 0) {
        d.life = Math.max(0, d.life - dt);
        d.y -= d.vy * dt * (1.2 - 0.5 * (d.life / d.maxLife));
        const alpha = Math.min(1, d.life / 0.45);
        dropUniforms[i].set(d.x, d.y, d.r, alpha);
      } else {
        dropUniforms[i].set(0, -2, 0, 0);
      }
    }
  }

  // ---- Post-Processing Composer: MSAA HalfFloat -> Bloom -> AgX + Flare + Speed Blur + Lens Droplets
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), {
    type: THREE.HalfFloatType,
    samples: PERF.msaa,
  });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(Math.max(2, size.x), Math.max(2, size.y)),
    0.22,
    0.55,
    1.28
  );
  composer.addPass(bloom);
  const origBloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => origBloomSetSize(Math.ceil(w / 2), Math.ceil(h / 2));
  bloom.setSize(Math.max(2, size.x), Math.max(2, size.y));
  bloom.enabled = !!PERF.bloom;

  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      exposure: { value: 1.04 },
      lift: { value: 0.006 },
      sat: { value: 1.06 },
      contrast: { value: 1.09 },
      vig: { value: 0.24 },
      shadowTint: { value: new THREE.Vector3(0.92, 0.97, 1.06) },
      highTint: { value: new THREE.Vector3(1.05, 1.01, 0.95) },
      time: { value: 0 },
      aspect: { value: 16 / 9 },
      sunUv: { value: new THREE.Vector2(0.5, 0.75) },
      sunVis: { value: 0.0 },
      sunCol: { value: new THREE.Color('#fff5de') },
      sunGlareAmt: { value: PERF.sunGlare },
      speedBlur: { value: 0.0 },
      nitroGlow: { value: 0.0 },
      uDrops: { value: dropUniforms },
      uDropAmt: { value: PERF.droplets },
    },
    vertexShader:
      'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float exposure, lift, sat, contrast, vig, time, aspect;
    uniform float sunVis, sunGlareAmt, speedBlur, nitroGlow, uDropAmt;
    uniform vec2 sunUv;
    uniform vec3 shadowTint, highTint, sunCol;
    uniform vec4 uDrops[${MAX_DROPS}];
    varying vec2 vUv;

    // AgX filmic tone mapping
    vec3 agxDefaultContrastApprox(vec3 x) {
      vec3 x2 = x * x;
      vec3 x4 = x2 * x2;
      return + 15.5     * x4 * x2
             - 40.14    * x4 * x
             + 31.96    * x4
             - 6.868    * x2 * x
             + 0.4298   * x2
             + 0.1191   * x
             - 0.00232;
    }
    vec3 agx(vec3 val) {
      const mat3 agx_mat = mat3(
        0.842479062253094, 0.0423282422610123, 0.0423756549057051,
        0.0784335999999992,  0.878468636469772,  0.0784336,
        0.0792237451477643, 0.0791661274605434, 0.879142973793104
      );
      const mat3 agx_mat_inv = mat3(
        1.19687900512017, -0.0528968517574562, -0.0529716355144438,
        -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
        -0.0990297440797205, -0.0989611768448433, 1.15107367264116
      );
      val = max(val * exposure, vec3(1e-6));
      val = agx_mat * val;
      val = clamp(log2(val), -12.47393, 4.026069);
      val = (val - (-12.47393)) / (4.026069 - (-12.47393));
      val = agxDefaultContrastApprox(val);
      val = agx_mat_inv * val;
      return clamp(val, 0.0, 1.0);
    }

    void main() {
      vec2 uv = vUv;
      float dropSpec = 0.0;
      float dropRim = 0.0;

      // Physical refractive water-droplet lens splashes
      if (uDropAmt > 0.05) {
        for (int i = 0; i < ${MAX_DROPS}; i++) {
          vec4 dp = uDrops[i];
          if (dp.w > 0.01 && dp.z > 0.001) {
            vec2 dv = uv - dp.xy;
            // Slightly tear-shaped vertical stretch
            vec2 scaled = vec2(dv.x * aspect, dv.y * 0.84);
            float dist = length(scaled);
            if (dist < dp.z) {
              float t = dist / dp.z;
              float dome = sqrt(max(0.0, 1.0 - t * t));
              // Convex droplet refraction
              uv -= dv * dome * 0.55 * dp.w * uDropAmt;
              // Crisp upper-edge specular highlight + lower bright crescent
              float hi = smoothstep(0.45, 0.95, dot(normalize(scaled + vec2(0.0001)), normalize(vec2(-0.4, 0.85)))) * smoothstep(0.55, 0.92, t);
              float bot = smoothstep(0.55, 0.95, dot(normalize(scaled + vec2(0.0001)), normalize(vec2(0.2, -0.95)))) * smoothstep(0.45, 0.90, t);
              dropSpec += (hi * 0.9 + bot * 0.45) * dp.w * uDropAmt;
              dropRim += smoothstep(0.72, 0.98, t) * 0.16 * dp.w * uDropAmt;
            }
          }
        }
      }

      vec3 hdr = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).rgb;

      // Speed-scaled radial camera-shutter motion blur
      if (speedBlur > 0.015) {
        vec2 center = vec2(0.5, 0.48);
        vec2 dir = uv - center;
        float dist = length(dir * vec2(1.0, 1.2));
        float edgeMask = smoothstep(0.24, 0.78, dist);
        if (edgeMask > 0.01) {
          vec2 stepV = dir * (0.022 * speedBlur * edgeMask);
          vec3 acc = hdr * 0.34;
          acc += texture2D(tDiffuse, clamp(uv - stepV * 0.36, 0.001, 0.999)).rgb * 0.24;
          acc += texture2D(tDiffuse, clamp(uv - stepV * 0.74, 0.001, 0.999)).rgb * 0.20;
          acc += texture2D(tDiffuse, clamp(uv - stepV * 1.15, 0.001, 0.999)).rgb * 0.13;
          acc += texture2D(tDiffuse, clamp(uv - stepV * 1.60, 0.001, 0.999)).rgb * 0.09;
          hdr = acc;
        }
      }

      // Subtle cyan-electric edge shimmer during Hydro Nitro boost
      if (nitroGlow > 0.01) {
        float ed = smoothstep(0.42, 0.95, length((vUv - 0.5) * vec2(1.15, 1.0)));
        hdr += vec3(0.05, 0.42, 0.62) * ed * nitroGlow * 0.45;
      }

      // Optical camera sun glare + anamorphic streak + iris ghost
      if (sunVis > 0.01 && sunGlareAmt > 0.01) {
        vec2 dS = (vUv - sunUv) * vec2(aspect, 1.0);
        float rS = length(dS);
        float halo = exp(-rS * 3.6) * 0.26 + exp(-rS * 14.0) * 0.44;
        float streak = exp(-abs(dS.y) * 32.0) * exp(-abs(dS.x) * 2.2) * 0.18;
        vec2 gUv = vec2(1.0) - sunUv;
        float gR = length((vUv - mix(sunUv, gUv, 0.72)) * vec2(aspect, 1.0));
        float ghost = exp(-pow((gR - 0.10) * 18.0, 2.0)) * 0.05;
        hdr += sunCol * (halo + streak + ghost) * sunVis * sunGlareAmt;
      }

      // Water droplet bright specular glint & subtle darkening rim
      hdr = hdr * (1.0 - dropRim * 0.5) + (sunCol * 0.7 + vec3(0.3)) * dropSpec * 0.65;

      vec3 c = agx(hdr);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(shadowTint, highTint, smoothstep(0.12, 0.82, l));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c = max(c, 0.0) * (1.0 - lift) + lift;
      float d = length((vUv - 0.5) * vec2(1.25, 1.0));
      c *= 1.0 - vig * smoothstep(0.40, 0.96, d);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
  });
  composer.addPass(grade);

  let ratio = Math.max(
    PERF.minRatio,
    Math.min(
      window.devicePixelRatio || 1,
      PERF.dprCap,
      Math.sqrt(PERF.pixels / Math.max(1, window.innerWidth * window.innerHeight))
    )
  );
  let lastVenue = null;

  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    grade.uniforms.aspect.value = w / h;
  }
  window.addEventListener('resize', resize);
  resize();

  const api = {
    renderer,
    scene,
    camera,
    composer,
    sun,
    hemi,
    sky,
    bloom,
    sunDir,
    grade,
    reflWorldRoot,
    envMap: null,
    spawnLensSplash,
    updateDroplets,

    setReflectionGroup(group) {
      while (reflWorldRoot.children.length) {
        reflWorldRoot.remove(reflWorldRoot.children[0]);
      }
      if (group) reflWorldRoot.add(group);
    },

    setVenueAtmosphere(venue) {
      lastVenue = venue;
      const a = computeAtmosphere(venue, PERF.weather);
      const col = (hex) => new THREE.Color(hex);

      skyU.top.value.copy(col(a.top));
      skyU.mid.value.copy(col(a.mid));
      skyU.horizon.value.copy(col(a.horizon));
      skyU.groundCol.value.copy(col(a.ground));
      skyU.sunCol.value.copy(col(a.sun));
      skyU.cloudAmt.value = a.cloud;
      skyU.cloudDark.value = a.cloudDark;
      skyU.haze.value = a.haze;
      skyU.hdrSun.value = PERF.weather === 'storm' ? 2.4 : 9.5;

      sunDir
        .set(
          Math.cos(a.el) * Math.sin(a.az),
          Math.sin(a.el),
          Math.cos(a.el) * Math.cos(a.az)
        )
        .normalize();

      sun.color.copy(col(a.sun));
      sun.intensity = a.sunInt;
      hemi.color.copy(col(a.hemiSky));
      hemi.groundColor.copy(col(a.hemiGround));
      hemi.intensity = a.hemiInt;

      reflSun.color.copy(sun.color);
      reflSun.intensity = a.sunInt * 0.9;
      reflSun.position.copy(sunDir).multiplyScalar(500);
      reflHemi.color.copy(hemi.color);
      reflHemi.groundColor.copy(hemi.groundColor);
      reflHemi.intensity = a.hemiInt;

      scene.fog = new THREE.Fog(col(a.fog), a.fogNear, a.fogFar);
      reflScene.fog = new THREE.Fog(col(a.fog), a.fogNear, a.fogFar);

      ENV_STATE.uSunDir.value.copy(sunDir);
      ENV_STATE.uSunCol.value.copy(col(a.sun));
      ENV_STATE.uSkyTop.value.copy(col(a.top));
      ENV_STATE.uSkyHorizon.value.copy(col(a.horizon));
      ENV_STATE.uFogCol.value.copy(col(a.fog));
      ENV_STATE.uFogNear.value = a.fogNear;
      ENV_STATE.uFogFar.value = a.fogFar;
      ENV_STATE.uStorm.value = a.stormAmt;
      ENV_STATE.uWaterReflOn.value = PERF.waterReflect ? 1.0 : 0.0;

      // Bake HDR PMREM reflections
      envU.sunAmt.value = PERF.weather === 'storm' ? 0.35 : 1.0;
      envU.hdrSun.value = PERF.weather === 'sunset' ? 42.0 : 34.0;
      if (api.envMap) api.envMap.dispose();
      api.envMap = pmrem.fromScene(envScene, 0.015).texture;
      scene.environment = api.envMap;
      scene.environmentIntensity = a.envInt;

      const U = grade.uniforms;
      U.exposure.value = a.exposure;
      U.lift.value = a.lift;
      U.sat.value = a.sat;
      U.contrast.value = a.contrast;
      U.vig.value = a.vig;
      U.shadowTint.value.set(...a.shadowTint);
      U.highTint.value.set(...a.highTint);
      U.sunCol.value.copy(col(a.sun));
      U.sunGlareAmt.value = PERF.sunGlare;
      U.uDropAmt.value = PERF.droplets;

      bloom.strength = a.bloomStr;
      bloom.threshold = a.bloomThresh;
      bloom.enabled = !!PERF.bloom;
    },

    applyQuality() {
      ratio = Math.max(
        PERF.minRatio,
        Math.min(
          window.devicePixelRatio || 1,
          PERF.dprCap,
          Math.sqrt(PERF.pixels / Math.max(1, window.innerWidth * window.innerHeight))
        )
      );
      sun.shadow.mapSize.set(PERF.shadowSize, PERF.shadowSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      sc.left = -PERF.shadowBox;
      sc.right = PERF.shadowBox;
      sc.top = PERF.shadowBox;
      sc.bottom = -PERF.shadowBox;
      sc.updateProjectionMatrix();
      bloom.enabled = !!PERF.bloom;
      grade.uniforms.sunGlareAmt.value = PERF.sunGlare;
      grade.uniforms.uDropAmt.value = PERF.droplets;
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = PERF.msaa;
        t.dispose();
      }
      if (PERF.waterReflect) {
        const rw = PERF.waterReflectSize || 384;
        const rh = Math.round(rw * 0.56);
        if (reflRT.width !== rw) {
          reflRT.dispose();
          reflRT = new THREE.WebGLRenderTarget(rw, rh, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: true,
            type: THREE.HalfFloatType,
          });
          ENV_STATE.uWaterRefl.value = reflRT.texture;
        }
      }
      ENV_STATE.uWaterReflOn.value = PERF.waterReflect ? 1.0 : 0.0;
      resize();
      if (lastVenue) api.setVenueAtmosphere(lastVenue);
    },

    follow(focusPos, camPos, speedNorm = 0, nitroGlow = 0) {
      camera.getWorldDirection(_camFwd);
      const fwdPush = PERF.shadowForward || 32;
      const fx = focusPos.x + _camFwd.x * fwdPush;
      const fy = focusPos.y;
      const fz = focusPos.z + _camFwd.z * fwdPush;
      const texel = (sc.right - sc.left) / PERF.shadowSize;
      const rx = _r.crossVectors(_up, sunDir).normalize();
      const ry = _u.crossVectors(sunDir, rx).normalize();
      _t.set(fx, fy, fz);
      const px = Math.round(_t.dot(rx) / texel) * texel;
      const py = Math.round(_t.dot(ry) / texel) * texel;
      const pd = _t.dot(sunDir);
      _t.set(0, 0, 0)
        .addScaledVector(rx, px)
        .addScaledVector(ry, py)
        .addScaledVector(sunDir, pd);
      sun.target.position.copy(_t);
      sun.position.copy(_t).addScaledVector(sunDir, 160);
      sun.target.updateMatrixWorld();
      sky.position.copy(camPos);

      // Project sun to screen space for optical flare
      if (PERF.weather !== 'storm') {
        const dotFwd = _camFwd.dot(sunDir);
        if (dotFwd > 0.14) {
          _sunW.copy(camPos).addScaledVector(sunDir, 2200).project(camera);
          grade.uniforms.sunUv.value.set(_sunW.x * 0.5 + 0.5, _sunW.y * 0.5 + 0.5);
          const inFrame =
            1.0 -
            Math.min(
              1.0,
              Math.max(Math.abs(_sunW.x) - 1.15, Math.abs(_sunW.y) - 1.15, 0) * 1.4
            );
          grade.uniforms.sunVis.value = Math.max(
            0,
            inFrame * Math.pow(Math.max(0, (dotFwd - 0.14) / 0.86), 1.3)
          );
        } else {
          grade.uniforms.sunVis.value = 0.0;
        }
      } else {
        grade.uniforms.sunVis.value = 0.0;
      }

      const blurK = Math.max(0, (speedNorm - 0.42) / 0.58);
      grade.uniforms.speedBlur.value = (blurK * blurK + nitroGlow * 0.45) * PERF.motionBlur;
      grade.uniforms.nitroGlow.value = nitroGlow;
    },

    renderWaterReflection() {
      if (!PERF.waterReflect) return;
      const rate = PERF.waterReflectRate || 2;
      if (reflFrame++ % rate !== 0) return;

      camera.getWorldDirection(_camFwd);
      _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      reflCam.fov = camera.fov;
      reflCam.aspect = camera.aspect;
      reflCam.near = camera.near;
      reflCam.far = camera.far;
      reflCam.updateProjectionMatrix();
      reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
      reflCam.up.set(-_camUp.x, _camUp.y, -_camUp.z).normalize();
      reflCam.lookAt(
        reflCam.position.x + _camFwd.x * 100,
        reflCam.position.y - _camFwd.y * 100,
        reflCam.position.z + _camFwd.z * 100
      );
      reflSky.position.copy(reflCam.position);

      const prevRT = renderer.getRenderTarget();
      const prevShadow = renderer.shadowMap.enabled;
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(reflRT);
      renderer.clear();
      renderer.render(reflScene, reflCam);
      renderer.setRenderTarget(prevRT);
      renderer.shadowMap.enabled = prevShadow;
    },

    render(dt = 0.016) {
      ENV_STATE.uTime.value += dt;
      updateDroplets(dt);
      grade.uniforms.time.value = ENV_STATE.uTime.value;
      composer.render();
    },

    resize,
  };

  return api;
}
