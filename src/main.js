// Riptide Rush — Main Application Controller & Game Loop
// Ties together the photoreal ocean engine, 3 venues, 4 jet skis, 7 AI rivals,
// Gerstner physics, mid-air stunts, Web Audio synth, HUD, and mobile touch controls.

import * as THREE from 'three';
import {
  PERF,
  cycleQualityTier,
  cycleWeatherMode,
  WEATHER_LABELS,
  QUALITY_TIERS,
} from './perf.js';
import { setWaveProfile, stepWaves, waveState, sampleOcean } from './waves.js';
import { VENUES, buildCourse, sampleCourse } from './venues.js';
import { JET_SKIS, loadSave, persistSave } from './skis.js';
import { MarineAudio } from './audio.js';
import { createScene } from './scene.js';
import { createOcean } from './ocean.js';
import { buildVenueWorld } from './world.js';
import { createJetSkiMesh } from './models.js';
import { createOceanFX } from './fx.js';
import { createRaceSimulation, stepRaceSimulation } from './physics.js';
import { createUI } from './ui.js';
import { createTouchControls } from './touch.js';

const PODIUM_PRIZES = [2500, 1600, 1100, 750, 500, 350, 250, 150];

// Catch and display any unexpected startup errors gracefully
window.addEventListener('error', (e) => {
  const box = document.getElementById('errbox');
  if (box) {
    box.hidden = false;
    box.textContent = `Runtime error: ${e.message}`;
  }
});

const canvas = document.getElementById('game');
const bootEl = document.getElementById('boot');
const bootMsg = document.getElementById('bootmsg');

const save = loadSave();
const audio = new MarineAudio();
const sceneApi = createScene(canvas);
const ocean = createOcean(sceneApi.scene);

let state = 'title'; // 'title' | 'select' | 'garage' | 'countdown' | 'race' | 'results'
let paused = false;
let selectedVenueIdx = 0;
let activeWorld = null;
let activeCourse = null;
let sim = null;
let fx = null;
let racerMeshes = [];
let showcaseGroup = null;
let showcaseSki = null;
let countdownTimer = 0;
let lastCountdownStep = 4;
let nitroGlowSmooth = 0;
let camPosSmooth = new THREE.Vector3(0, 8, -16);
let camLookSmooth = new THREE.Vector3(0, 1, 10);
let camShake = 0;
let stormSplashTimer = 1.5;

// Unified keyboard + touch input state
const keys = new Set();
const input = {
  gas: false,
  brake: false,
  left: false,
  right: false,
  nitro: false,
  touchLeft: false,
  touchRight: false,
  touchGas: false,
  touchBrake: false,
  touchNitro: false,
  autoGasActive: false,
  queueJump: false,
  queueStunt: null,
  jumpJustPressed: false,
  stuntJustPressed: null,
};

function clearRacers() {
  for (const m of racerMeshes) {
    sceneApi.scene.remove(m.root);
  }
  racerMeshes = [];
  if (fx) {
    fx.dispose();
    fx = null;
  }
}

function clearShowcase() {
  if (showcaseGroup) {
    sceneApi.scene.remove(showcaseGroup);
    showcaseGroup = null;
    showcaseSki = null;
  }
}

function loadVenue(venueIdx) {
  selectedVenueIdx = (venueIdx + VENUES.length) % VENUES.length;
  const venue = VENUES[selectedVenueIdx];

  if (activeWorld) {
    activeWorld.dispose();
    activeWorld = null;
  }
  activeCourse = buildCourse(venue);
  setWaveProfile(venue.id, PERF.weather, true);
  sceneApi.setVenueAtmosphere(venue);
  ocean.setVenue(venue);
  activeWorld = buildVenueWorld(activeCourse, sceneApi.scene, sceneApi);
}

function buildMarinaShowcase() {
  clearShowcase();
  clearRacers();
  const skiSpec = JET_SKIS[save.selectedSki];
  showcaseGroup = new THREE.Group();
  showcaseSki = createJetSkiMesh(skiSpec);
  showcaseGroup.add(showcaseSki.root);
  sceneApi.scene.add(showcaseGroup);
}

function startRace() {
  audio.init();
  clearShowcase();
  clearRacers();

  const skiSpec = JET_SKIS[save.selectedSki];
  sim = createRaceSimulation(activeCourse, skiSpec);
  fx = createOceanFX(sceneApi.scene, sim.racers.length);

  for (let i = 0; i < sim.racers.length; i++) {
    const r = sim.racers[i];
    const m = createJetSkiMesh(r.isPlayer ? r.skiSpec : r.rivalSpec);
    r.meshApi = m;
    racerMeshes.push(m);
    sceneApi.scene.add(m.root);
    // Initial transform
    m.root.position.set(r.x, r.y, r.z);
    m.root.rotation.order = 'YXZ';
    m.root.rotation.set(0, r.heading, 0);
  }

  // Snap chase camera cleanly behind player on starting grid
  const p = sim.player;
  const fxDir = Math.sin(p.heading);
  const fzDir = Math.cos(p.heading);
  camPosSmooth.set(p.x - fxDir * 10.5, p.y + 4.4, p.z - fzDir * 10.5);
  camLookSmooth.set(p.x + fxDir * 14, p.y + 1.4, p.z + fzDir * 14);

  paused = false;
  state = 'countdown';
  countdownTimer = 3.2;
  lastCountdownStep = 4;
  ui.showScreen('hud');
  ui.setPaused(false);
  ui.setCountdown('3');
  ui.updateHUD(sim);
}

function goTitle() {
  paused = false;
  clearRacers();
  clearShowcase();
  sim = null;
  state = 'title';
  ui.showScreen('title');
  ui.setPaused(false);
}

function goSelect() {
  paused = false;
  clearRacers();
  clearShowcase();
  sim = null;
  state = 'select';
  ui.renderVenueSelect(selectedVenueIdx, save);
  ui.showScreen('select');
  ui.setPaused(false);
}

function goGarage() {
  paused = false;
  sim = null;
  state = 'garage';
  buildMarinaShowcase();
  ui.renderGarage(save.selectedSki, save);
  ui.showScreen('garage');
  ui.setPaused(false);
}

function togglePause() {
  if (state !== 'race' && state !== 'countdown') return;
  paused = !paused;
  ui.setPaused(paused);
  if (paused) {
    touch.releaseAll();
  }
}

function finishRace() {
  state = 'results';
  const p = sim.player;
  const venue = activeCourse.venue;
  const podium = PODIUM_PRIZES[Math.max(0, Math.min(7, p.place - 1))];
  const stunts = p.stuntCash;
  const slalom = p.buoysHit * 75 + p.maxCombo * 120;
  const total = podium + stunts + slalom;

  save.cash += total;
  save.racesCompleted += 1;
  if (p.place === 1) save.wins += 1;

  const rec = save.records[venue.id] || (save.records[venue.id] = { bestTime: null, bestLap: null, bestPos: null });
  let isNewRecord = false;
  if (rec.bestTime === null || p.finishTime < rec.bestTime) {
    rec.bestTime = p.finishTime;
    isNewRecord = true;
  }
  if (p.bestLapTime !== null && (rec.bestLap === null || p.bestLapTime < rec.bestLap)) {
    rec.bestLap = p.bestLapTime;
  }
  if (rec.bestPos === null || p.place < rec.bestPos) {
    rec.bestPos = p.place;
  }
  persistSave(save);

  audio.playLap(true);
  ui.renderResults(sim, { podium, stunts, slalom, total }, isNewRecord, save);
  ui.showScreen('results');
}

function handleCycleWeather() {
  audio.init();
  const mode = cycleWeatherMode();
  setWaveProfile(VENUES[selectedVenueIdx].id, mode, false);
  sceneApi.setVenueAtmosphere(VENUES[selectedVenueIdx]);
  ui.syncGfxBar(audio.muted);
  if (state === 'race' || state === 'countdown') {
    ui.addToast(`WEATHER: ${WEATHER_LABELS[mode]}`, 'info');
  }
}

function handleCycleQuality() {
  audio.init();
  const tier = cycleQualityTier();
  sceneApi.applyQuality();
  ocean.rebuildQuality();
  ui.syncGfxBar(audio.muted);
  if (state === 'race' || state === 'countdown') {
    ui.addToast(`QUALITY: ${QUALITY_TIERS[tier].label}`, 'info');
  }
}

function handleToggleMute() {
  audio.init();
  audio.toggleMute();
  ui.syncGfxBar(audio.muted);
}

// ---- UI Callbacks
const ui = createUI({
  onAction(act) {
    audio.init();
    audio.playMenu();
    switch (act) {
      case 'play':
        goSelect();
        break;
      case 'garage':
        goGarage();
        break;
      case 'back-title':
        goTitle();
        break;
      case 'back-select':
      case 'quit-select':
        goSelect();
        break;
      case 'start-race':
      case 'restart':
        startRace();
        break;
      case 'resume':
        togglePause();
        break;
      case 'toggle-mute':
        handleToggleMute();
        break;
    }
  },
  onSelectVenue(idx) {
    audio.init();
    audio.playMenu();
    if (idx === selectedVenueIdx && state === 'select') {
      startRace();
      return;
    }
    loadVenue(idx);
    ui.renderVenueSelect(selectedVenueIdx, save);
  },
  onSelectSki(idx) {
    audio.init();
    audio.playMenu();
    save.selectedSki = idx;
    persistSave(save);
    if (state === 'garage') {
      buildMarinaShowcase();
      ui.renderGarage(save.selectedSki, save);
    }
  },
  onCycleWeather: handleCycleWeather,
  onCycleQuality: handleCycleQuality,
  onToggleMute: handleToggleMute,
});

// ---- Touch Controls
const touch = createTouchControls({
  input,
  onAction(act) {
    if (act === 'pause') togglePause();
  },
  onUnlockAudio() {
    audio.init();
  },
});

// ---- Keyboard Controls
window.addEventListener('keydown', (e) => {
  audio.init();
  const code = e.code;

  if (
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)
  ) {
    e.preventDefault();
  }

  // Global live hotkeys: O (Weather), U (Quality), M (Mute)
  if (!e.repeat) {
    if (code === 'KeyO') {
      handleCycleWeather();
      return;
    }
    if (code === 'KeyU') {
      handleCycleQuality();
      return;
    }
    if (code === 'KeyM') {
      handleToggleMute();
      return;
    }
    if (code === 'KeyP' || (code === 'Escape' && (state === 'race' || state === 'countdown'))) {
      togglePause();
      return;
    }

    // Menu quick keyboard navigation
    if (state === 'title') {
      if (code === 'Enter' || code === 'Space') {
        audio.playMenu();
        goSelect();
        return;
      }
      if (code === 'KeyG') {
        audio.playMenu();
        goGarage();
        return;
      }
    } else if (state === 'select') {
      if (code === 'ArrowLeft' || code === 'KeyA') {
        audio.playMenu();
        loadVenue(selectedVenueIdx - 1);
        ui.renderVenueSelect(selectedVenueIdx, save);
        return;
      }
      if (code === 'ArrowRight' || code === 'KeyD') {
        audio.playMenu();
        loadVenue(selectedVenueIdx + 1);
        ui.renderVenueSelect(selectedVenueIdx, save);
        return;
      }
      if (code === 'KeyG') {
        audio.playMenu();
        goGarage();
        return;
      }
      if (code === 'Enter' || code === 'Space') {
        audio.playMenu();
        startRace();
        return;
      }
      if (code === 'Escape') {
        audio.playMenu();
        goTitle();
        return;
      }
    } else if (state === 'garage') {
      if (code === 'ArrowLeft' || code === 'KeyA') {
        audio.playMenu();
        save.selectedSki = (save.selectedSki - 1 + JET_SKIS.length) % JET_SKIS.length;
        persistSave(save);
        buildMarinaShowcase();
        ui.renderGarage(save.selectedSki, save);
        return;
      }
      if (code === 'ArrowRight' || code === 'KeyD') {
        audio.playMenu();
        save.selectedSki = (save.selectedSki + 1) % JET_SKIS.length;
        persistSave(save);
        buildMarinaShowcase();
        ui.renderGarage(save.selectedSki, save);
        return;
      }
      if (code === 'Enter') {
        audio.playMenu();
        startRace();
        return;
      }
      if (code === 'Escape') {
        audio.playMenu();
        goSelect();
        return;
      }
    } else if (state === 'results') {
      if (code === 'Enter' || code === 'Space') {
        audio.playMenu();
        startRace();
        return;
      }
      if (code === 'Escape') {
        audio.playMenu();
        goSelect();
        return;
      }
    } else if (state === 'race' && !paused) {
      // One-shot Jump Pop & 4 Mid-Air Stunts!
      if (code === 'Space') input.queueJump = true;
      if (code === 'Digit1' || code === 'KeyZ' || code === 'KeyJ') input.queueStunt = 'superman';
      if (code === 'Digit2' || code === 'KeyX' || code === 'KeyK') input.queueStunt = 'spin360';
      if (code === 'Digit3' || code === 'KeyC' || code === 'KeyL') input.queueStunt = 'backflip';
      if (code === 'Digit4' || code === 'KeyV' || code === 'KeyI') input.queueStunt = 'grab';
    }
  }

  keys.add(code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});
window.addEventListener('blur', () => {
  keys.clear();
});

function pollControls() {
  input.gas = keys.has('ArrowUp') || keys.has('KeyW') || input.touchGas || input.autoGasActive;
  input.brake = keys.has('ArrowDown') || keys.has('KeyS') || input.touchBrake;
  input.left = keys.has('ArrowLeft') || keys.has('KeyA') || input.touchLeft;
  input.right = keys.has('ArrowRight') || keys.has('KeyD') || input.touchRight;
  input.nitro =
    keys.has('ShiftLeft') ||
    keys.has('ShiftRight') ||
    keys.has('KeyN') ||
    keys.has('KeyE') ||
    input.touchNitro;
  input.jumpJustPressed = input.queueJump;
  input.stuntJustPressed = input.queueStunt;
  input.queueJump = false;
  input.queueStunt = null;
}

// Handle simulation events -> audio + 3D spray FX + water-droplet lens splashes + HUD toasts!
function processSimEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'ramp_launch':
        audio.playRampLaunch();
        if (fx) fx.spawnSplash(ev.x, ev.y, ev.z, 0.75);
        sceneApi.spawnLensSplash(0.45);
        break;
      case 'stunt_start':
        audio.playStuntStart();
        break;
      case 'stunt_land':
        audio.playStuntLand();
        audio.playSplash(Math.max(0.85, ev.impact));
        if (fx) fx.spawnSplash(ev.x, ev.y, ev.z, 1.35);
        sceneApi.spawnLensSplash(1.0);
        camShake = Math.max(camShake, 0.35);
        ui.addToast(`${ev.label}!  +${ev.nitro}% NITRO  +$${ev.cash}`, 'stunt');
        break;
      case 'stunt_bail':
        audio.playStuntBail();
        if (fx) fx.spawnSplash(ev.x, ev.y, ev.z, 1.6);
        sceneApi.spawnLensSplash(1.3);
        camShake = Math.max(camShake, 0.6);
        ui.addToast(`WIPEOUT! (${ev.label})`, 'miss');
        break;
      case 'splashdown':
        audio.playSplash(Math.max(0.55, ev.impact));
        if (fx) fx.spawnSplash(ev.x, ev.y, ev.z, 0.9 + ev.impact * 0.4);
        sceneApi.spawnLensSplash(0.55 + ev.impact * 0.45);
        camShake = Math.max(camShake, 0.22 * ev.impact);
        break;
      case 'buoy_hit':
        audio.playBuoyHit(ev.combo);
        ui.addToast(
          `SLALOM x${ev.combo}!  +${ev.nitro}% NITRO`,
          ev.side === 'right' ? 'buoy-red' : 'buoy-yellow'
        );
        break;
      case 'buoy_miss':
        if (ev.hadCombo) {
          audio.playBuoyMiss();
          ui.addToast(
            ev.side === 'right' ? 'MISSED RED BUOY (PASS RIGHT ▶)' : 'MISSED YELLOW BUOY (PASS ◀ LEFT)',
            'miss'
          );
        }
        break;
      case 'wake_bump':
        if (fx) fx.spawnBumpSpray(ev.x, ev.y, ev.z);
        if (ev.involvesPlayer) {
          audio.playWakeBump();
          sceneApi.spawnLensSplash(0.85);
          camShake = Math.max(camShake, 0.45);
          ui.addToast('WAKE BUMP!', 'info');
        }
        break;
      case 'wake_spray_lens':
        sceneApi.spawnLensSplash(ev.strength || 0.4);
        break;
      case 'new_lap':
        audio.playLap(ev.finalLap);
        ui.addToast(ev.finalLap ? 'FINAL LAP!' : `LAP ${ev.lap}`, 'lap');
        break;
      case 'race_finish':
        finishRace();
        break;
    }
  }
}

// ---- Boot Initial Venue
bootMsg.textContent = 'Building Gerstner ocean & venues...';
loadVenue(0);
ui.syncGfxBar(false);
ui.showScreen('title');
setTimeout(() => {
  bootEl.classList.add('gone');
  setTimeout(() => (bootEl.style.display = 'none'), 450);
}, 260);

// ---- Main Animation Loop
let lastNow = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
const _focus = new THREE.Vector3();
const _oceanTmp = { y: 0, nx: 0, ny: 1, nz: 0, vy: 0, crest: 0 };

function tick(now) {
  requestAnimationFrame(tick);
  const rawDt = (now - lastNow) / 1000;
  lastNow = now;
  const dt = Math.min(0.05, Math.max(0.001, rawDt));

  fpsAccum += rawDt;
  fpsFrames++;
  if (fpsAccum >= 0.45) {
    ui.setFps(Math.round(fpsFrames / fpsAccum));
    fpsAccum = 0;
    fpsFrames = 0;
  }

  if (!paused) {
    stepWaves(dt);
  }
  const wt = waveState.time;
  const cam = sceneApi.camera;

  if (state === 'title' || state === 'select') {
    // Sweeping scenic helicopter flyover camera gliding along the live venue lagoon!
    const flyS = (wt * 18) % activeCourse.totalLen;
    const sp = sampleCourse(activeCourse, flyS, {});
    const ahead = sampleCourse(activeCourse, flyS + 68, {});
    const camY = 14.5 + Math.sin(wt * 0.45) * 3.0;
    cam.position.set(sp.x + sp.rx * 18, camY, sp.z + sp.rz * 18);
    cam.fov = 60;
    cam.updateProjectionMatrix();
    cam.lookAt(ahead.x, 3.5, ahead.z);
    _focus.set(ahead.x, 0, ahead.z);

    if (activeWorld) activeWorld.update(dt, wt, -1);
    ocean.update(cam.position);
    sceneApi.follow(_focus, cam.position, 0, 0);
    audio.update({ active: false, stormAmt: PERF.weather === 'storm' ? 1 : 0 });
    touch.update(false, false, 0);
  } else if (state === 'garage') {
    // Interactive Marina Garage floating turntable showcase on live sparkling water!
    const sp = sampleCourse(activeCourse, 22, {});
    const gx = sp.x;
    const gz = sp.z;
    sampleOcean(gx, gz, _oceanTmp, wt);
    if (showcaseSki) {
      showcaseSki.root.position.set(gx, _oceanTmp.y + 0.16, gz);
      showcaseSki.root.rotation.order = 'YXZ';
      showcaseSki.root.rotation.set(
        _oceanTmp.nz * 0.35,
        wt * 0.48,
        -_oceanTmp.nx * 0.35
      );
      showcaseSki.updatePose({
        steer: Math.sin(wt * 1.1) * 0.25,
        nitro: 0.4 + 0.3 * Math.sin(wt * 3.0),
        bob: Math.sin(wt * 4.2) * 0.015,
      });
    }
    cam.position.set(gx + 5.8, _oceanTmp.y + 2.75, gz + 5.6);
    cam.fov = 48;
    cam.updateProjectionMatrix();
    cam.lookAt(gx - 0.85, _oceanTmp.y + 0.72, gz);
    _focus.set(gx, _oceanTmp.y, gz);

    if (activeWorld) activeWorld.update(dt, wt, -1);
    ocean.update(cam.position);
    sceneApi.follow(_focus, cam.position, 0, 0);
    audio.update({ active: false, stormAmt: PERF.weather === 'storm' ? 1 : 0 });
    touch.update(false, false, 0);
  } else if (sim) {
    // Countdown, Racing, or Results victory cruise
    pollControls();

    if (!paused) {
      if (state === 'countdown') {
        countdownTimer -= dt;
        const step = Math.ceil(countdownTimer);
        if (step !== lastCountdownStep && step >= 1 && step <= 3) {
          lastCountdownStep = step;
          ui.setCountdown(String(step));
          audio.playCountdown(false);
        }
        if (countdownTimer <= 0) {
          state = 'race';
          ui.setCountdown('GO!');
          audio.playCountdown(true);
          setTimeout(() => ui.setCountdown(null), 850);
        }
      }

      const racingActive = state === 'race' || state === 'results';
      stepRaceSimulation(sim, dt, wt, input, racingActive);
      if (state === 'race') {
        processSimEvents(sim.events);
      }

      if (fx) fx.update(dt, wt, sim.racers);
      if (activeWorld) activeWorld.update(dt, wt, sim.player.nextBuoyIdx);

      // Storm Swell ambient sea-spray lens droplets!
      if (PERF.weather === 'storm' && state === 'race') {
        stormSplashTimer -= dt;
        if (stormSplashTimer <= 0) {
          stormSplashTimer = 1.6 + Math.random() * 2.2;
          sceneApi.spawnLensSplash(0.35);
        }
      }
    }

    // Dynamic Chase Camera (pulls back & widens FOV during Hydro Nitro + lifts cleanly on big jumps!)
    const p = sim.player;
    const fwdX = Math.sin(p.heading);
    const fwdZ = Math.cos(p.heading);
    const speedNorm = Math.min(1.25, p.speed / 56.0);
    const targetNitro = p.nitroActive ? 1.0 : 0.0;
    nitroGlowSmooth += (targetNitro - nitroGlowSmooth) * Math.min(1, dt * 6.5);
    camShake = Math.max(0, camShake - dt * 1.9);

    const distBack = 9.2 + speedNorm * 2.1 + nitroGlowSmooth * 1.8 + (p.airborne ? 1.6 : 0);
    const heightUp = 3.65 + speedNorm * 0.45 + (p.airborne ? 1.25 : 0);
    const sideSwing = -p.steerSmooth * 1.65;
    const rightX = -fwdZ;
    const rightZ = fwdX;

    const desiredCamX = p.x - fwdX * distBack + rightX * sideSwing;
    const desiredCamY = Math.max(sampleOcean(p.x, p.z, _oceanTmp, wt).y + 2.0, p.y + heightUp);
    const desiredCamZ = p.z - fwdZ * distBack + rightZ * sideSwing;

    const camLerp = Math.min(1, dt * 8.0);
    camPosSmooth.x += (desiredCamX - camPosSmooth.x) * camLerp;
    camPosSmooth.y += (desiredCamY - camPosSmooth.y) * Math.min(1, dt * 6.5);
    camPosSmooth.z += (desiredCamZ - camPosSmooth.z) * camLerp;

    const shakeX = (Math.random() - 0.5) * camShake * 0.55;
    const shakeY = (Math.random() - 0.5) * camShake * 0.42;
    cam.position.set(camPosSmooth.x + shakeX, camPosSmooth.y + shakeY, camPosSmooth.z);

    const lookX = p.x + fwdX * 15.0;
    const lookY = p.y + 1.35 + (p.airborne ? 0.45 : 0);
    const lookZ = p.z + fwdZ * 15.0;
    camLookSmooth.x += (lookX - camLookSmooth.x) * Math.min(1, dt * 11.0);
    camLookSmooth.y += (lookY - camLookSmooth.y) * Math.min(1, dt * 9.0);
    camLookSmooth.z += (lookZ - camLookSmooth.z) * Math.min(1, dt * 11.0);
    cam.lookAt(camLookSmooth);

    const targetFov = 62 + speedNorm * 10 + nitroGlowSmooth * 11;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 6.0);
    cam.updateProjectionMatrix();

    _focus.set(p.x, p.y, p.z);
    ocean.update(cam.position);
    sceneApi.follow(_focus, cam.position, speedNorm, nitroGlowSmooth);

    audio.update({
      active: !paused && (state === 'race' || state === 'countdown'),
      speedNorm,
      throttle: state === 'race' ? p.throttle : 0.15,
      carveAmt: Math.abs(p.steerSmooth) * Math.min(1, speedNorm),
      airborne: p.airborne,
      nitroActive: p.nitroActive,
      pitchMul: p.skiSpec.phys.pitchPitch || 1.0,
      stormAmt: PERF.weather === 'storm' ? 1 : 0,
    });

    if (state === 'race' || state === 'countdown') {
      ui.updateHUD(sim);
    }
    touch.update((state === 'race' || state === 'countdown') && !paused, p.airborne, p.nitro);
  }

  // Render live planar water reflection + final AgX photoreal frame!
  sceneApi.renderWaterReflection();
  sceneApi.render(paused ? 0 : dt);
}

requestAnimationFrame(tick);
