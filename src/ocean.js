// Photoreal 3D Gerstner Ocean Surface + Textured Sandy Seabed + Live GPU Hull Wake:
//  - Smoothly snapped high-density camera-following ocean mesh (zero wave popping at 75 MPH!)
//  - Exact 6-wave Gerstner displacement synced with src/waves.js
//  - Live mirrored planar water reflection (distorted by Gerstner + dual-band micro-ripples)
//  - Rich grazing-angle-balanced Beer-Lambert turquoise clarity + animated underwater caustics
//  - Vivid subsurface turquoise wave-crest scattering (SSS)
//  - Integrated GPU bow-wash & prop-wash churning foam directly on the ocean surface!

import * as THREE from 'three';
import { WAVE_COUNT, waveState } from './waves.js';
import { ENV_STATE, getNoiseTex } from './scene.js';
import { PERF } from './perf.js';

// Dense near-field mesh (fine ~1.2m cells around the jet ski) expanding smoothly to the horizon (2400m)
function buildOceanGeometry(segs) {
  const N = segs;
  const verts = [];
  const uvs = [];
  const indices = [];

  for (let iz = 0; iz <= N; iz++) {
    const vz = (iz / N) * 2 - 1;
    for (let ix = 0; ix <= N; ix++) {
      const vx = (ix / N) * 2 - 1;
      const ax = Math.abs(vx);
      const az = Math.abs(vz);
      const sx = Math.sign(vx) * (ax * 96 + Math.pow(ax, 3.6) * 2250);
      const sz = Math.sign(vz) * (az * 96 + Math.pow(az, 3.6) * 2250);
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
  float dist = length(position.xz);
  float atten = 1.0 - smoothstep(460.0, 1650.0, dist);

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

// Live player hull interaction for seamless zero-clipping bow wash & prop churn!
uniform vec4 uPlayerWave; // xy = world xz, z = speedNorm (0..1.3), w = active (0/1)
uniform vec2 uPlayerFwd;  // normalized forward xz

uniform sampler2D tNoise;
uniform sampler2D tSand;
uniform sampler2D tRefl;
uniform float uReflOn;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vCrest;
varying float vWaveY;
varying vec4 vClipPos;

float seabedDepthAt(vec2 xz) {
  float n1 = sin(xz.x * 0.0095 + 0.6) * cos(xz.y * 0.0085 - 0.4);
  float n2 = sin(xz.x * 0.021 - xz.y * 0.017) * 0.5;
  float bar = smoothstep(-0.35, 0.85, n1 * 0.68 + n2 * 0.32);
  float depth = mix(abs(uSeabedBase), abs(uSeabedShallow), bar);
  return max(0.75, depth + vWaveY);
}

// Crisp multi-scale wind ripple & capillary wave normal perturbation
vec3 microNormal(vec2 xz, float distFade) {
  vec2 uv1 = xz * 0.052 + vec2(uTime * 0.042, -uTime * 0.026);
  vec2 uv2 = xz * 0.145 + vec2(-uTime * 0.054, uTime * 0.044) + 0.37;
  vec2 uv3 = xz * 0.360 + vec2(uTime * 0.072, uTime * 0.060) + 0.71;

  float h1 = texture2D(tNoise, uv1).r;
  float h2 = texture2D(tNoise, uv2).g;
  float h3 = texture2D(tNoise, uv3).b;

  float e = 0.014;
  float hx = (texture2D(tNoise, uv1 + vec2(e, 0.0)).r - h1) * 0.52
           + (texture2D(tNoise, uv2 + vec2(e, 0.0)).g - h2) * 0.30
           + (texture2D(tNoise, uv3 + vec2(e, 0.0)).b - h3) * 0.18;
  float hz = (texture2D(tNoise, uv1 + vec2(0.0, e)).r - h1) * 0.52
           + (texture2D(tNoise, uv2 + vec2(0.0, e)).g - h2) * 0.30
           + (texture2D(tNoise, uv3 + vec2(0.0, e)).b - h3) * 0.18;

  float amp = (2.1 + uWaveChop * 1.35) * distFade;
  return vec3(-hx * amp, 0.0, -hz * amp);
}

float caustics(vec2 xz) {
  vec2 p1 = xz * 0.11 + vec2(uTime * 0.06, uTime * 0.036);
  vec2 p2 = xz * 0.145 - vec2(uTime * 0.045, -uTime * 0.052);
  float c1 = texture2D(tNoise, p1).r;
  float c2 = texture2D(tNoise, p2).g;
  float v = 1.0 - abs(c1 - c2) * 3.2;
  return pow(clamp(v, 0.0, 1.0), 2.8);
}

void main() {
  vec3 toCam = cameraPosition - vWorldPos;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 0.001);
  vec3 L = normalize(uSunDir);

  float detailFade = 1.0 - smoothstep(55.0, 480.0, dist);
  vec3 mN = microNormal(vWorldPos.xz, detailFade);

  // Seamless GPU bow-wave & V-wake ripple normal disturbance right around the player jet ski!
  float hullFoam = 0.0;
  if (uPlayerWave.w > 0.5 && dist < 85.0) {
    vec2 rel = vWorldPos.xz - uPlayerWave.xy;
    vec2 fwd = uPlayerFwd;
    vec2 right = vec2(-fwd.y, fwd.x);
    float along = dot(rel, fwd);    // + in front of ski, - behind ski
    float across = dot(rel, right);
    float spd = uPlayerWave.z;

    // 1. Expanding Kelvin V-wake ripples & frothy side arms behind hull
    if (along < 2.2 && along > -36.0) {
      float behind = max(0.0, 1.6 - along);
      float armW = 0.72 + behind * 0.34;
      float armDist = abs(abs(across) - armW);
      float armMask = exp(-armDist * armDist * 0.65) * smoothstep(36.0, 2.0, behind) * smoothstep(0.0, 1.2, behind);
      // Center turbulent prop-wash churn
      float propMask = exp(-across * across * 0.55) * exp(-behind * 0.11) * smoothstep(0.0, 1.0, behind);
      // Ripple wavelets along Kelvin arms
      float rip = sin(armDist * 3.8 - uTime * 11.0) * armMask * 0.28 * spd;
      mN.xz += right * sign(across) * rip;

      float fN = texture2D(tNoise, vWorldPos.xz * 0.24 - fwd * uTime * 0.55).r;
      float fN2 = texture2D(tNoise, vWorldPos.xz * 0.58 + vec2(uTime * 0.12)).g;
      float lacy = smoothstep(0.24, 0.76, fN * 0.6 + fN2 * 0.55);
      hullFoam += (armMask * 0.92 + propMask * 0.85) * lacy * clamp(spd * 1.25, 0.0, 1.15);
    }

    // 2. Crisp bow collar foam ring right where hull slices water
    float bowD = length(vec2(across * 1.25, (along - 0.6) * 0.65));
    float bowRing = exp(-pow(bowD - 1.15, 2.0) * 3.2) * (0.35 + spd * 0.85);
    hullFoam += bowRing * 0.55;
  }

  vec3 N = normalize(vNormal + mN);
  if (N.y < 0.08) N = normalize(vec3(N.x, 0.08, N.z));

  float NdotV = max(dot(N, V), 0.001);
  float NdotL = max(dot(N, L), 0.0);

  // Balanced Fresnel: preserves rich turquoise lagoon depth & caustics even from low chase camera!
  float fresnel = 0.03 + 0.78 * pow(1.0 - NdotV, 4.2);
  fresnel = clamp(fresnel, 0.03, 0.82);

  // ---- 1. Physical Beer-Lambert Depth + Sandy Seabed & Underwater Caustics
  float depth = seabedDepthAt(vWorldPos.xz);
  float viewPath = depth / max(0.46, NdotV);
  vec3 transmittance = exp(-viewPath * uAbsorb);

  vec2 refractUv = (vWorldPos.xz - N.xz * depth * 0.42) * 0.055;
  vec3 sandTex = texture2D(tSand, refractUv).rgb;
  float caust = caustics(vWorldPos.xz - N.xz * 1.1) * (1.0 - uStorm * 0.68) * smoothstep(10.0, 1.0, depth);
  vec3 seabedCol = sandTex * uSeabedTint * (0.70 + 0.90 * max(L.y, 0.18) + caust * 1.15) * uSunCol;

  float depthMix = 1.0 - exp(-depth * 0.16);
  // Crisp directional wave-face shading so every 3D swell has sculptural bright crest & deep trough contrast!
  float waveShade = 0.42 + 0.58 * NdotL;
  vec3 bodyCol = mix(uShallowCol, uDeepCol, depthMix) * (0.36 + 0.72 * max(L.y, 0.22)) * waveShade;
  vec3 refractedCol = mix(bodyCol, seabedCol, transmittance * (1.0 - uStorm * 0.42));

  // ---- 2. Vivid Subsurface Turquoise Wave-Crest Scattering (SSS)
  vec3 sssDir = normalize(L + N * 0.38);
  float backLight = pow(clamp(dot(V, -sssDir), 0.0, 1.0), 2.6);
  float rimGlow = pow(1.0 - NdotV, 2.0) * max(0.0, N.y);
  float crestFactor = smoothstep(-0.18, 0.68, vWaveY) * (0.55 + vCrest * 1.75);
  vec3 sss = uSssCol * uSunCol * (backLight * 1.35 + rimGlow * 0.45) * crestFactor * (1.0 - uStorm * 0.35);
  refractedCol += sss * 0.78;

  // ---- 3. Live Mirrored Planar Water Reflection + Sky Reflection Fallback
  vec3 R = reflect(-V, N);
  vec3 skyRefl = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.62, max(R.y, 0.0)));
  vec3 reflCol = skyRefl;

  if (uReflOn > 0.5) {
    vec2 ndc = vClipPos.xy / max(vClipPos.w, 0.001);
    vec2 reflUv = vec2(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
    vec2 distort = vec2(N.x, N.z) * (0.048 * (1.0 - smoothstep(85.0, 500.0, dist)));
    reflUv = clamp(reflUv + distort, vec2(0.005), vec2(0.995));
    vec3 planar = texture2D(tRefl, reflUv).rgb;
    float planarWeight = smoothstep(0.0, 0.06, reflUv.y) * smoothstep(1.0, 0.94, reflUv.y);
    reflCol = mix(skyRefl, planar, planarWeight * 0.92);
  }

  // ---- 4. Blazing Sun Specular Glitter Trail + Sparkling Micro-Glints
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float specSharp = pow(NdotH, 460.0) * 9.5;
  float specMid = pow(NdotH, 68.0) * 0.72;
  vec3 specCol = uSunCol * (specSharp + specMid) * (1.0 - uStorm * 0.58) * smoothstep(0.02, 0.22, L.y);

  vec3 col = mix(refractedCol, reflCol, fresnel) + specCol;

  // ---- 5. Dynamic Whitecap Foam + Integrated GPU Hull Wake Foam!
  float foamNoise = texture2D(tNoise, vWorldPos.xz * 0.085 + vec2(uTime * 0.02, -uTime * 0.015)).r;
  float foamFine = texture2D(tNoise, vWorldPos.xz * 0.30 - vec2(uTime * 0.03, uTime * 0.02)).g;
  float crestThresh = mix(0.64, 0.32, clamp(uStorm * 0.75 + (uWaveChop - 0.8) * 0.45, 0.0, 1.0));
  float foamMask = smoothstep(crestThresh, crestThresh + 0.30, vCrest + foamNoise * 0.32);
  foamMask *= smoothstep(0.24, 0.70, foamFine * 0.65 + foamNoise * 0.55);
  float shallowFoam = smoothstep(1.42, 0.85, depth) * smoothstep(0.45, 0.80, foamNoise) * 0.45;
  float totalFoam = clamp(foamMask + shallowFoam + hullFoam, 0.0, 0.95);

  vec3 foamLit = uFoamCol * (0.58 + 0.55 * max(NdotL, 0.30)) * mix(vec3(1.0), uSunCol, 0.32);
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
    uPlayerWave: { value: new THREE.Vector4(0, 0, 0, 0) },
    uPlayerFwd: { value: new THREE.Vector2(0, 1) },
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
    setPlayerWake(racer) {
      if (!racer || racer.airborne) {
        uniforms.uPlayerWave.value.set(0, 0, 0, 0);
        return;
      }
      const speedNorm = Math.min(1.3, racer.speed / 44.0) * (racer.nitroActive ? 1.25 : 1.0);
      uniforms.uPlayerWave.value.set(racer.x, racer.z, speedNorm, 1.0);
      uniforms.uPlayerFwd.value.set(Math.sin(racer.heading), Math.cos(racer.heading));
    },
    update(camPos) {
      // Fine 2.0m grid snap matches dense inner mesh spacing -> ZERO popping at 75 MPH!
      const snap = 2.0;
      const cx = Math.round(camPos.x / snap) * snap;
      const cz = Math.round(camPos.z / snap) * snap;
      uniforms.uCenter.value.set(cx, cz);
    },
  };
}
