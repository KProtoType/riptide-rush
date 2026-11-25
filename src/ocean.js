// Photoreal 3D Gerstner Ocean Surface + Textured Sandy Seabed:
//  - Camera-following radially-graded ocean mesh (high vertex density near ski, extends to horizon)
//  - Exact 6-wave Gerstner displacement synced with src/waves.js
//  - Live mirrored planar water reflection (distorted by Gerstner + micro-ripple normals)
//  - Subsurface turquoise wave-crest scattering (SSS)
//  - Physical Beer-Lambert depth absorption + animated underwater caustics + sandy seabed
//  - Crisp sun glitter specular + dynamic whitecap crest foam + shoreline foam

import * as THREE from 'three';
import { WAVE_COUNT, waveState } from './waves.js';
import { ENV_STATE, getNoiseTex } from './scene.js';
import { PERF } from './perf.js';

// Build radially-graded plane geometry: dense near center (0..120m), smoothly expanding to horizon (2400m)
function buildOceanGeometry(segs) {
  const N = segs;
  const verts = [];
  const uvs = [];
  const indices = [];

  for (let iz = 0; iz <= N; iz++) {
    const vz = (iz / N) * 2 - 1; // -1..1
    for (let ix = 0; ix <= N; ix++) {
      const vx = (ix / N) * 2 - 1;
      // Smooth non-linear radial stretch: linear near player, cubic toward horizon
      const sx = Math.sign(vx) * (Math.abs(vx) * 140 + Math.pow(Math.abs(vx), 3.4) * 2150);
      const sz = Math.sign(vz) * (Math.abs(vz) * 140 + Math.pow(Math.abs(vz), 3.4) * 2150);
      verts.push(sx, 0, sz);
      uvs.push(ix / N, iz / N);
    }
  }
  const stride = N + 1;
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const a = iz * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

const OCEAN_VERT = `
uniform vec4 uWavesA[${WAVE_COUNT}];
uniform vec4 uWavesB[${WAVE_COUNT}];
uniform float uWaveTime;
uniform vec2 uCenter;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vWaveY;
varying vec4 vClipPos;

void main() {
  vec3 worldBase = vec3(position.x + uCenter.x, 0.0, position.z + uCenter.y);
  // Attenuate vertical displacement smoothly very far from camera to avoid horizon artifacts
  float dist = length(position.xz);
  float atten = 1.0 - smoothstep(420.0, 1550.0, dist);

  vec3 disp = vec3(0.0);
  vec3 T = vec3(1.0, 0.0, 0.0);
  vec3 B = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;

  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 wA = uWavesA[i];
    vec4 wB = uWavesB[i];
    vec2 D = wA.xy;
    float k = wA.z;
    float A = wA.w * atten;
    float Q = wB.x;
    float omega = wB.y;

    float phase = k * dot(D, worldBase.xz) - omega * uWaveTime;
    float c = cos(phase);
    float s = sin(phase);
    float QA = Q * A;
    float kA = k * A;
    float WA = k * QA * s;
    float WC = kA * c;

    disp.x += QA * D.x * c;
    disp.y += A * s;
    disp.z += QA * D.y * c;

    T += vec3(-D.x * D.x * WA, D.x * WC, -D.x * D.y * WA);
    B += vec3(-D.x * D.y * WA, D.y * WC, -D.y * D.y * WA);
    crest += max(0.0, s) * kA;
  }

  vec3 worldPos = worldBase + disp;
  vWorldPos = worldPos;
  vNormal = normalize(cross(B, T));
  vCrest = crest;
  vWaveY = disp.y;

  vec4 clip = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  vClipPos = clip;
  gl_Position = clip;
}
`;

const OCEAN_FRAG = `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uWaveChop;
uniform float uStorm;

uniform vec3 uShallowCol;
uniform vec3 uDeepCol;
uniform vec3 uAbsorb;
uniform vec3 uSssCol;
uniform vec3 uFoamCol;
uniform vec3 uSeabedTint;
uniform float uSeabedBase;
uniform float uSeabedShallow;

uniform sampler2D tNoise;
uniform sampler2D tSand;
uniform sampler2D tRefl;
uniform float uReflOn;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vWaveY;
varying vec4 vClipPos;

// Procedural sandbar & lagoon bathymetry (matches the visible seabed feel!)
float seabedDepthAt(vec2 xz) {
  float n1 = sin(xz.x * 0.0095 + 0.6) * cos(xz.y * 0.0085 - 0.4);
  float n2 = sin(xz.x * 0.021 - xz.y * 0.017) * 0.5;
  float bar = smoothstep(-0.35, 0.85, n1 * 0.68 + n2 * 0.32);
  float depth = mix(abs(uSeabedBase), abs(uSeabedShallow), bar);
  return max(0.75, depth + vWaveY);
}

// Micro-ripple normal perturbation from dual-scrolling seamless noise
vec3 microNormal(vec2 xz, float distFade) {
  vec2 uv1 = xz * 0.048 + vec2(uTime * 0.036, -uTime * 0.022);
  vec2 uv2 = xz * 0.135 + vec2(-uTime * 0.045, uTime * 0.038) + 0.37;
  vec2 uv3 = xz * 0.310 + vec2(uTime * 0.062, uTime * 0.051) + 0.71;

  float h1 = texture2D(tNoise, uv1).r;
  float h2 = texture2D(tNoise, uv2).g;
  float h3 = texture2D(tNoise, uv3).b;

  float e = 0.016;
  float hx = (texture2D(tNoise, uv1 + vec2(e, 0.0)).r - h1) * 0.55
           + (texture2D(tNoise, uv2 + vec2(e, 0.0)).g - h2) * 0.30
           + (texture2D(tNoise, uv3 + vec2(e, 0.0)).b - h3) * 0.15;
  float hz = (texture2D(tNoise, uv1 + vec2(0.0, e)).r - h1) * 0.55
           + (texture2D(tNoise, uv2 + vec2(0.0, e)).g - h2) * 0.30
           + (texture2D(tNoise, uv3 + vec2(0.0, e)).b - h3) * 0.15;

  float amp = (1.6 + uWaveChop * 1.1) * distFade;
  return vec3(-hx * amp, 0.0, -hz * amp);
}

// Animated underwater caustic shimmer projected on the sandy seabed
float caustics(vec2 xz) {
  vec2 p1 = xz * 0.11 + vec2(uTime * 0.055, uTime * 0.032);
  vec2 p2 = xz * 0.14 - vec2(uTime * 0.042, -uTime * 0.048);
  float c1 = texture2D(tNoise, p1).r;
  float c2 = texture2D(tNoise, p2).g;
  float v = 1.0 - abs(c1 - c2) * 3.4;
  return pow(clamp(v, 0.0, 1.0), 3.0);
}

void main() {
  vec3 toCam = cameraPosition - vWorldPos;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 0.001);
  vec3 L = normalize(uSunDir);

  float detailFade = 1.0 - smoothstep(45.0, 420.0, dist);
  vec3 N = normalize(vNormal + microNormal(vWorldPos.xz, detailFade));
  if (N.y < 0.08) N = normalize(vec3(N.x, 0.08, N.z));

  float NdotV = max(dot(N, V), 0.001);
  float NdotL = max(dot(N, L), 0.0);

  // Schlick Fresnel (F0 = 0.02 for seawater)
  float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  fresnel = clamp(fresnel * 1.05, 0.02, 0.96);

  // ---- 1. Physical Beer-Lambert Depth + Sandy Seabed & Underwater Caustics
  float depth = seabedDepthAt(vWorldPos.xz);
  // Path length through water increases at oblique viewing angles
  float viewPath = depth / max(0.32, NdotV);
  vec3 transmittance = exp(-viewPath * uAbsorb);

  // Sample real sandy seabed texture with refracted offset + sunlit caustics
  vec2 refractUv = (vWorldPos.xz - N.xz * depth * 0.45) * 0.055;
  vec3 sandTex = texture2D(tSand, refractUv).rgb;
  float caust = caustics(vWorldPos.xz - N.xz * 1.2) * (1.0 - uStorm * 0.72) * smoothstep(9.0, 1.0, depth);
  vec3 seabedCol = sandTex * uSeabedTint * (0.65 + 0.85 * max(L.y, 0.15) + caust * 0.95) * uSunCol;

  // Water body scatter transitions smoothly from turquoise shallows to deep ocean sapphire
  float depthMix = 1.0 - exp(-depth * 0.18);
  vec3 bodyCol = mix(uShallowCol, uDeepCol, depthMix) * (0.28 + 0.72 * max(L.y, 0.18));
  vec3 refractedCol = mix(bodyCol, seabedCol, transmittance * (1.0 - uStorm * 0.45));

  // ---- 2. Subsurface Turquoise Wave-Crest Scattering (SSS)
  // Backlit sun light glowing brightly through thin steep Gerstner crests!
  vec3 sssDir = normalize(L + N * 0.42);
  float backLight = pow(clamp(dot(V, -sssDir), 0.0, 1.0), 3.0);
  float sideGlow = pow(1.0 - NdotV, 2.2) * max(0.0, N.y);
  float crestFactor = smoothstep(-0.15, 0.75, vWaveY) * (0.45 + vCrest * 1.45);
  vec3 sss = uSssCol * uSunCol * (backLight * 1.15 + sideGlow * 0.35) * crestFactor * (1.0 - uStorm * 0.42);
  refractedCol += sss * 0.65;

  // ---- 3. Live Mirrored Planar Water Reflection + Sky Reflection Fallback
  vec3 R = reflect(-V, N);
  vec3 skyRefl = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.65, max(R.y, 0.0)));
  vec3 reflCol = skyRefl;

  if (uReflOn > 0.5) {
    vec2 ndc = vClipPos.xy / max(vClipPos.w, 0.001);
    vec2 reflUv = vec2(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
    // Wave-normal distortion on planar reflection (smaller at horizon to avoid clipping)
    vec2 distort = vec2(N.x, N.z) * (0.055 * (1.0 - smoothstep(80.0, 500.0, dist)));
    reflUv = clamp(reflUv + distort, vec2(0.005), vec2(0.995));
    vec3 planar = texture2D(tRefl, reflUv).rgb;
    float planarWeight = smoothstep(0.0, 0.08, reflUv.y) * smoothstep(1.0, 0.92, reflUv.y);
    reflCol = mix(skyRefl, planar, planarWeight * 0.92);
  }

  // ---- 4. Blazing Sun Specular Glitter Trail
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float specSharp = pow(NdotH, 420.0) * 8.5;
  float specBroad = pow(NdotH, 48.0) * 0.55;
  vec3 specCol = uSunCol * (specSharp + specBroad) * (1.0 - uStorm * 0.62) * smoothstep(0.02, 0.25, L.y);

  // Combine refracted ocean + reflections + sun specular
  vec3 col = mix(refractedCol, reflCol, fresnel) + specCol;

  // ---- 5. Dynamic Whitecap Foam on Steep Wave Crests + Micro-Lace
  float foamNoise = texture2D(tNoise, vWorldPos.xz * 0.085 + vec2(uTime * 0.02, -uTime * 0.015)).r;
  float foamFine = texture2D(tNoise, vWorldPos.xz * 0.28 - vec2(uTime * 0.03, uTime * 0.02)).g;
  float crestThresh = mix(0.68, 0.34, clamp(uStorm * 0.75 + (uWaveChop - 0.8) * 0.45, 0.0, 1.0));
  float foamMask = smoothstep(crestThresh, crestThresh + 0.32, vCrest + foamNoise * 0.32);
  foamMask *= smoothstep(0.25, 0.72, foamFine * 0.65 + foamNoise * 0.55);
  // Subtle sunlit shallow reef surf foam
  float shallowFoam = smoothstep(1.45, 0.85, depth) * smoothstep(0.45, 0.80, foamNoise) * 0.5;
  float totalFoam = clamp(foamMask + shallowFoam, 0.0, 0.92);

  vec3 foamLit = uFoamCol * (0.48 + 0.62 * max(NdotL, 0.25)) * mix(vec3(1.0), uSunCol, 0.35);
  col = mix(col, foamLit, totalFoam);

  // ---- 6. Atmospheric Horizon Fog
  float fogF = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogCol, fogF);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createOcean(scene) {
  const loader = new THREE.TextureLoader();
  const sandTex = loader.load('./assets/tex/coast_sand_02_diff_1k.jpg');
  sandTex.wrapS = THREE.RepeatWrapping;
  sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.colorSpace = THREE.SRGBColorSpace;
  sandTex.anisotropy = PERF.anisotropy || 8;

  const uniforms = {
    uWavesA: { value: waveState.uWavesA },
    uWavesB: { value: waveState.uWavesB },
    uWaveTime: waveState.uWaveTime,
    uWaveChop: waveState.uWaveChop,
    uCenter: { value: new THREE.Vector2(0, 0) },
    uTime: ENV_STATE.uTime,
    uSunDir: ENV_STATE.uSunDir,
    uSunCol: ENV_STATE.uSunCol,
    uSkyTop: ENV_STATE.uSkyTop,
    uSkyHorizon: ENV_STATE.uSkyHorizon,
    uFogCol: ENV_STATE.uFogCol,
    uFogNear: ENV_STATE.uFogNear,
    uFogFar: ENV_STATE.uFogFar,
    uStorm: ENV_STATE.uStorm,
    uShallowCol: { value: new THREE.Color('#1fd6c7') },
    uDeepCol: { value: new THREE.Color('#074e78') },
    uAbsorb: { value: new THREE.Vector3(0.34, 0.085, 0.048) },
    uSssCol: { value: new THREE.Color('#1cf0d8') },
    uFoamCol: { value: new THREE.Color('#f4fbff') },
    uSeabedTint: { value: new THREE.Color('#ead8b4') },
    uSeabedBase: { value: -7.5 },
    uSeabedShallow: { value: -2.2 },
    tNoise: { value: getNoiseTex() },
    tSand: { value: sandTex },
    tRefl: ENV_STATE.uWaterRefl,
    uReflOn: ENV_STATE.uWaterReflOn,
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERT,
    fragmentShader: OCEAN_FRAG,
    side: THREE.FrontSide,
    depthWrite: true,
    fog: false,
  });

  let currentSegs = PERF.oceanSegs || 156;
  const mesh = new THREE.Mesh(buildOceanGeometry(currentSegs), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  return {
    mesh,
    uniforms,
    setVenue(venue) {
      const wc = venue.waterColors;
      uniforms.uShallowCol.value.set(wc.shallow);
      uniforms.uDeepCol.value.set(wc.deep);
      uniforms.uAbsorb.value.set(...wc.absorb);
      uniforms.uSssCol.value.set(wc.sss);
      uniforms.uFoamCol.value.set(wc.foam);
      uniforms.uSeabedTint.value.set(wc.seabedTint);
      uniforms.uSeabedBase.value = venue.seabedBase;
      uniforms.uSeabedShallow.value = venue.seabedShallow;
    },
    rebuildQuality() {
      const targetSegs = PERF.oceanSegs || 156;
      if (targetSegs !== currentSegs) {
        currentSegs = targetSegs;
        mesh.geometry.dispose();
        mesh.geometry = buildOceanGeometry(currentSegs);
      }
      sandTex.anisotropy = PERF.anisotropy || 8;
    },
    update(camPos) {
      // Snap ocean mesh center to coarse grid step so vertices never shimmer
      const snap = 14.0;
      const cx = Math.round(camPos.x / snap) * snap;
      const cz = Math.round(camPos.z / snap) * snap;
      uniforms.uCenter.value.set(cx, cz);
      mesh.position.set(cx, 0, cz);
    },
  };
}
