// Synchronized 6-component 3D Gerstner Ocean Wave engine.
// Evaluates IDENTICAL math on CPU (buoyancy, hull pitch/roll, buoys, ramps, wake launches)
// and packs GPU uniforms (uWavesA[6], uWavesB[6]) for the photoreal Ocean Shader.

import * as THREE from 'three';

export const WAVE_COUNT = 6;
const GRAVITY = 9.81;

// Base 6 directional wave components: [dirX, dirZ, wavelength, baseAmp, baseSteep, speedMul]
// Designed for rich, non-repeating ocean swells with crisp cross-chop and launchable crests.
const BASE_WAVES = [
  { dx: 0.86, dz: 0.51, wl: 68.0, amp: 0.62, steep: 0.34, speedMul: 1.0 },
  { dx: -0.44, dz: 0.90, wl: 43.0, amp: 0.42, steep: 0.30, speedMul: 1.08 },
  { dx: 0.32, dz: -0.95, wl: 29.0, amp: 0.28, steep: 0.26, speedMul: 1.12 },
  { dx: -0.92, dz: -0.39, wl: 19.5, amp: 0.19, steep: 0.24, speedMul: 1.18 },
  { dx: 0.64, dz: -0.77, wl: 12.2, amp: 0.12, steep: 0.20, speedMul: 1.24 },
  { dx: -0.21, dz: 0.98, wl: 7.4, amp: 0.075, steep: 0.18, speedMul: 1.32 },
];

// Venue wave character multipliers
const VENUE_SWELL = {
  azure: { amp: 0.82, steep: 0.85, speed: 0.95, chop: 0.78 },
  fjord: { amp: 1.02, steep: 0.98, speed: 1.02, chop: 0.95 },
  harbor: { amp: 1.48, steep: 1.24, speed: 1.14, chop: 1.25 },
};

// Weather swell modifiers
const WEATHER_SWELL = {
  sunny: { amp: 1.0, steep: 1.0, speed: 1.0, chop: 1.0 },
  sunset: { amp: 0.88, steep: 0.82, speed: 0.92, chop: 0.82 },
  storm: { amp: 1.62, steep: 1.36, speed: 1.26, chop: 1.45 },
};

export const waveState = {
  venueId: 'azure',
  weather: 'sunny',
  time: 0,
  // Live smoothed parameters
  ampScale: 0.82,
  steepScale: 0.85,
  speedScale: 0.95,
  chopScale: 0.78,
  targetAmp: 0.82,
  targetSteep: 0.85,
  targetSpeed: 0.95,
  targetChop: 0.78,
  // Precomputed active wave array used by BOTH CPU & GPU
  waves: BASE_WAVES.map((w) => {
    const len = Math.hypot(w.dx, w.dz) || 1;
    const dx = w.dx / len;
    const dz = w.dz / len;
    const k = (Math.PI * 2) / w.wl;
    const omega = Math.sqrt(GRAVITY * k) * w.speedMul;
    return { dx, dz, wl: w.wl, k, omega, amp: w.amp, steep: w.steep, baseAmp: w.amp, baseSteep: w.steep };
  }),
  // GPU uniform arrays (vec4[6])
  // uWavesA[i] = (dirX, dirZ, k, amplitude)
  // uWavesB[i] = (steepnessQ, omega, 0, 0) where Q = steep / (k * amp * WAVE_COUNT) clamped
  uWavesA: Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4()),
  uWavesB: Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4()),
  uWaveTime: { value: 0 },
  uWaveChop: { value: 0.8 },
};

function syncUniforms() {
  for (let i = 0; i < WAVE_COUNT; i++) {
    const w = waveState.waves[i];
    const amp = w.baseAmp * waveState.ampScale;
    // Keep steepness physically non-looping: sum(Q_i * k_i * A_i) <= 0.85
    const steepEff = Math.min(0.82, w.baseSteep * waveState.steepScale);
    const q = amp > 1e-4 ? steepEff / (w.k * amp * WAVE_COUNT) : 0;
    w.amp = amp;
    w.q = q;
    w.qa = q * amp;
    w.omegaEff = w.omega * waveState.speedScale;
    waveState.uWavesA[i].set(w.dx, w.dz, w.k, amp);
    waveState.uWavesB[i].set(q, w.omegaEff, steepEff, waveState.chopScale);
  }
  waveState.uWaveChop.value = waveState.chopScale;
}

export function setWaveProfile(venueId, weather, immediate = false) {
  waveState.venueId = venueId || waveState.venueId;
  waveState.weather = weather || waveState.weather;
  const v = VENUE_SWELL[waveState.venueId] || VENUE_SWELL.azure;
  const w = WEATHER_SWELL[waveState.weather] || WEATHER_SWELL.sunny;
  waveState.targetAmp = v.amp * w.amp;
  waveState.targetSteep = v.steep * w.steep;
  waveState.targetSpeed = v.speed * w.speed;
  waveState.targetChop = v.chop * w.chop;
  if (immediate) {
    waveState.ampScale = waveState.targetAmp;
    waveState.steepScale = waveState.targetSteep;
    waveState.speedScale = waveState.targetSpeed;
    waveState.chopScale = waveState.targetChop;
    syncUniforms();
  }
}

export function stepWaves(dt) {
  waveState.time += dt;
  const k = Math.min(1, dt * 2.2);
  waveState.ampScale += (waveState.targetAmp - waveState.ampScale) * k;
  waveState.steepScale += (waveState.targetSteep - waveState.steepScale) * k;
  waveState.speedScale += (waveState.targetSpeed - waveState.speedScale) * k;
  waveState.chopScale += (waveState.targetChop - waveState.chopScale) * k;
  waveState.uWaveTime.value = waveState.time;
  syncUniforms();
}

// Raw Gerstner displacement at undisplaced grid coordinates (gx, gz)
function evalGerstnerRaw(gx, gz, t, out) {
  let dx = 0, dy = 0, dz = 0;
  let tx = 1, ty = 0, tz = 0;
  let bx = 0, by = 0, bz = 1;
  let crest = 0;

  const waves = waveState.waves;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const w = waves[i];
    const phase = w.k * (w.dx * gx + w.dz * gz) - w.omegaEff * t;
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    const ka = w.k * w.amp;
    const qa = w.qa;

    dx += qa * w.dx * c;
    dy += w.amp * s;
    dz += qa * w.dz * c;

    const wa = w.k * qa * s; // Q*k*A*sin
    const wc = ka * c;       // k*A*cos

    tx -= w.dx * w.dx * wa;
    ty += w.dx * wc;
    tz -= w.dx * w.dz * wa;

    bx -= w.dx * w.dz * wa;
    by += w.dz * wc;
    bz -= w.dz * w.dz * wa;

    // Crestiness metric for whitecaps & launch detection
    crest += Math.max(0, s) * ka;
  }

  // Normal = cross(B, T) normalized (pointing +Y)
  let nx = by * tz - bz * ty;
  let ny = bz * tx - bx * tz;
  let nz = bx * ty - by * tx;
  const invLen = 1 / (Math.hypot(nx, ny, nz) || 1);
  nx *= invLen;
  ny *= invLen;
  nz *= invLen;

  out.dx = dx;
  out.y = dy;
  out.dz = dz;
  out.nx = nx;
  out.ny = ny;
  out.nz = nz;
  out.crest = crest;
  return out;
}

const _tmp = { dx: 0, y: 0, dz: 0, nx: 0, ny: 1, nz: 0, crest: 0 };

// Evaluates exact ocean surface height, normal, vertical wave velocity, and crestiness
// at WORLD coordinates (wx, wz) by inverting horizontal Gerstner displacement (2 iterations).
export function sampleOcean(wx, wz, out = { y: 0, nx: 0, ny: 1, nz: 0, vy: 0, crest: 0 }, t = waveState.time) {
  // Iteration 1
  evalGerstnerRaw(wx, wz, t, _tmp);
  let gx = wx - _tmp.dx;
  let gz = wz - _tmp.dz;
  // Iteration 2 (high accuracy match to GPU vertex shader!)
  evalGerstnerRaw(gx, gz, t, _tmp);
  gx = wx - _tmp.dx;
  gz = wz - _tmp.dz;
  evalGerstnerRaw(gx, gz, t, _tmp);

  out.y = _tmp.y;
  out.nx = _tmp.nx;
  out.ny = _tmp.ny;
  out.nz = _tmp.nz;
  out.crest = _tmp.crest;

  // Approximate vertical wave velocity dy/dt for realistic wave-crest launches
  let vy = 0;
  const waves = waveState.waves;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const w = waves[i];
    const phase = w.k * (w.dx * gx + w.dz * gz) - w.omegaEff * t;
    vy += -w.amp * w.omegaEff * Math.cos(phase);
  }
  out.vy = vy;
  return out;
}

// Fast single-iteration height query for wakes/buoys/distant objects
export function sampleOceanHeight(wx, wz, t = waveState.time) {
  let y = 0;
  const waves = waveState.waves;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const w = waves[i];
    const phase = w.k * (w.dx * wx + w.dz * wz) - w.omegaEff * t;
    y += w.amp * Math.sin(phase);
  }
  return y;
}

// Initialize uniforms immediately
syncUniforms();
