// Wave Race meets Hydro Thunder Watercraft Physics & AI Engine:
//  - Real synchronized 3D Gerstner buoyancy, carving, wave-crest launches & ramp launches
//  - 4 Mid-Air Stunts (Superman, 360 Spin, Backflip, Grab) charging Hydro Nitro
//  - Red (Right) / Yellow (Left) Buoy Slalom Combo Multiplier (x1..x5)
//  - Rookie / Pro / Ace Difficulty with close pack AI & gentle course-alignment assist
//  - Live navigation angle & Wrong-Way detection for overhead arcade direction arrow

import { sampleOcean } from './waves.js';
import {
  LAPS_PER_RACE,
  sampleCourse,
  projectToCourse,
  deltaS,
  wrapS,
} from './venues.js';
import { AI_RIVALS } from './skis.js';
import { getDifficulty } from './perf.js';

export const STUNT_DEFS = {
  superman: { id: 'superman', label: 'SUPERMAN', duration: 0.70, nitro: 28, cash: 250 },
  spin360:  { id: 'spin360',  label: '360 SPIN', duration: 0.62, nitro: 26, cash: 220 },
  backflip: { id: 'backflip', label: 'BACKFLIP', duration: 0.78, nitro: 38, cash: 380 },
  grab:     { id: 'grab',     label: 'TAIL GRAB', duration: 0.54, nitro: 22, cash: 180 },
};

const GRAVITY = 27.5;
const _ocean = { y: 0, nx: 0, ny: 1, nz: 0, vy: 0, crest: 0 };
const _proj = {};
const _sp = {};

function createRacerState({ id, name, isPlayer, skiSpec, rivalSpec, startS, startLat, course, diff }) {
  const sp = sampleCourse(course, startS, {});
  const x = sp.x + sp.rx * startLat;
  const z = sp.z + sp.rz * startLat;
  const w = sampleOcean(x, z, {});

  const phys = isPlayer
    ? skiSpec.phys
    : {
        topSpeed: (46.5 + rivalSpec.skill * 7.8) * diff.aiSpeedMul,
        nitroBonus: 13.0 * diff.aiSpeedMul,
        accel: (27.5 + rivalSpec.skill * 4.5) * Math.max(0.9, diff.aiSpeedMul),
        turnRate: 2.38,
        carveGrip: 5.2,
        rampBoost: 1.08,
        stuntSpeed: 1.05,
        mass: 1.0,
        pitchPitch: 1.0,
      };

  return {
    id,
    name,
    isPlayer,
    skiSpec,
    rivalSpec,
    phys,
    x,
    y: w.y + 0.15,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: sp.heading,
    pitch: 0,
    roll: 0,
    steerSmooth: 0,
    throttle: 0,
    airborne: false,
    airTime: 0,
    peakAirH: 0,
    onRampId: -1,
    rampCooldown: 0,
    // Hydro Nitro (0..100)
    nitro: isPlayer ? 55 : 25,
    nitroActive: false,
    // Mid-Air Stunts
    stunt: null,
    stuntCount: 0,
    stuntCash: 0,
    bailTimer: 0,
    // Slalom Combo
    slalomCombo: 0,
    maxCombo: 0,
    buoysHit: 0,
    buoysTotal: 0,
    nextBuoyIdx: 0,
    // Navigation guidance for HUD overhead arrow & Wrong-Way alert
    navAngle: 0,
    wrongWay: false,
    wrongWayTimer: 0,
    // Lap & race progress
    s: wrapS(course, startS),
    prevS: wrapS(course, startS),
    lateral: startLat,
    lap: 1,
    lapStartTime: 0,
    bestLapTime: null,
    totalProgress: startS > course.totalLen * 0.5 ? startS - course.totalLen : startS,
    finished: false,
    finishTime: null,
    place: id + 1,
    // AI state
    aiTargetLat: startLat,
    aiLaneTimer: 0.6 + id * 0.35,
    aiNitroTimer: 2.5 + id * 1.1,
    bumpCooldown: 0,
    wakeJostle: 0,
    meshApi: null,
  };
}

export function createRaceSimulation(course, playerSkiSpec) {
  const diff = getDifficulty();
  const racers = [];

  // Staggered 2-row starting grid behind Start/Finish arch
  const gridSlots = [
    { sOff: -12, lat: -10.5 },
    { sOff: -12, lat: -3.5 },
    { sOff: -12, lat: 3.5 },
    { sOff: -12, lat: 10.5 },
    { sOff: -23, lat: -8.0 },
    { sOff: -23, lat: 0.0 },
    { sOff: -23, lat: 8.0 },
    { sOff: -23, lat: -14.0 },
  ];

  const playerSlotIdx = diff.startSlot != null ? diff.startSlot : 2;
  const pSlot = gridSlots[playerSlotIdx];

  racers.push(
    createRacerState({
      id: 0,
      name: 'YOU',
      isPlayer: true,
      skiSpec: playerSkiSpec,
      rivalSpec: null,
      startS: wrapS(course, course.totalLen + pSlot.sOff),
      startLat: pSlot.lat,
      course,
      diff,
    })
  );

  let aiIdx = 0;
  for (let slotIdx = 0; slotIdx < gridSlots.length && aiIdx < AI_RIVALS.length; slotIdx++) {
    if (slotIdx === playerSlotIdx) continue;
    const slot = gridSlots[slotIdx];
    racers.push(
      createRacerState({
        id: aiIdx + 1,
        name: AI_RIVALS[aiIdx].name,
        isPlayer: false,
        skiSpec: null,
        rivalSpec: AI_RIVALS[aiIdx],
        startS: wrapS(course, course.totalLen + slot.sOff),
        startLat: slot.lat,
        course,
        diff,
      })
    );
    aiIdx++;
  }

  racers[0].nextBuoyIdx = 0;

  return {
    course,
    diff,
    racers,
    player: racers[0],
    raceTime: 0,
    events: [],
  };
}

function angleDiff(target, current) {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function stepRaceSimulation(sim, dt, waveTime, input, racingActive) {
  const { course, racers, player, events, diff } = sim;
  events.length = 0;

  if (racingActive) {
    sim.raceTime += dt;
  }

  for (let i = 0; i < racers.length; i++) {
    const r = racers[i];
    r.bumpCooldown = Math.max(0, r.bumpCooldown - dt);
    r.rampCooldown = Math.max(0, r.rampCooldown - dt);
    r.bailTimer = Math.max(0, r.bailTimer - dt);
    r.wakeJostle = Math.max(0, r.wakeJostle - dt * 3.0);

    // ---- 1. Gather controls (Player vs AI Rival)
    let throttle = 0;
    let brake = 0;
    let steer = 0;
    let wantNitro = false;
    let wantJump = false;
    let wantStunt = null;

    if (!racingActive) {
      throttle = 0;
    } else if (r.isPlayer && !r.finished) {
      throttle = input.gas ? 1 : 0;
      brake = input.brake ? 1 : 0;
      steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      wantNitro = !!input.nitro;
      wantJump = !!input.jumpJustPressed;
      wantStunt = input.stuntJustPressed || null;

      // Gentle course-alignment assist on Rookie (and subtle on Pro) so bends feel intuitive & smooth!
      if (diff.steerAssist > 0.01 && !r.airborne && r.speed > 8) {
        const lookS = r.s + 34 + r.speed * 0.38;
        sampleCourse(course, lookS, _sp);
        const aimHeading = Math.atan2(_sp.x - r.x, _sp.z - r.z);
        const err = angleDiff(aimHeading, r.heading);
        // err > 0 => course is to the LEFT => steer negative; err < 0 => course is to the RIGHT => steer positive
        const assistSteer = Math.max(-0.55, Math.min(0.55, -err * 0.85));
        // Only apply strongly when player isn't actively turning away, or when heading far off course
        const weight = Math.abs(steer) < 0.1 ? diff.steerAssist : diff.steerAssist * 0.28;
        steer = Math.max(-1, Math.min(1, steer + assistSteer * weight));
      }
    } else {
      const ai = computeAIControls(r, player, course, dt, diff);
      throttle = ai.throttle;
      brake = ai.brake;
      steer = ai.steer;
      wantNitro = ai.nitro;
      wantStunt = ai.stunt;
    }

    r.throttle = throttle;
    r.steerSmooth += (steer - r.steerSmooth) * Math.min(1, dt * 9.5);

    // ---- 2. Hydro Nitro Activation
    if (wantNitro && r.nitro > 4 && r.bailTimer <= 0) {
      r.nitroActive = true;
    } else if (!wantNitro || r.nitro <= 0.5 || r.bailTimer > 0) {
      r.nitroActive = false;
    }
    if (r.nitroActive) {
      r.nitro = Math.max(0, r.nitro - dt * 24.5);
    } else if (racingActive && !r.airborne) {
      r.nitro = Math.min(100, r.nitro + dt * (r.isPlayer ? diff.nitroRegen : 1.4));
    }

    // ---- 3. Sample Synchronized Gerstner Ocean Surface
    sampleOcean(r.x, r.z, _ocean, waveTime);
    let surfaceY = _ocean.y;
    let onRamp = null;

    for (let k = 0; k < course.ramps.length; k++) {
      const rm = course.ramps[k];
      const dx = r.x - rm.x;
      const dz = r.z - rm.z;
      const along = dx * rm.tx + dz * rm.tz;
      const across = dx * rm.rx + dz * rm.rz;
      if (Math.abs(across) <= rm.width * 0.62 && along >= -rm.length * 0.55 && along <= rm.length * 0.58) {
        const rampBaseY = sampleOcean(rm.x, rm.z, {}, waveTime).y * 0.75;
        const frac = Math.max(0, Math.min(1, (along + rm.length * 0.5) / rm.length));
        const rampTopY = rampBaseY + 0.14 + frac * (rm.height - 0.14);
        if (r.y <= rampTopY + 1.4 && r.vy <= 14) {
          surfaceY = Math.max(surfaceY, rampTopY);
          onRamp = { rm, frac, rampTopY };
        }
      }
    }

    // ---- 4. Horizontal Velocity, Carving & Steering
    const fwdX = Math.sin(r.heading);
    const fwdZ = Math.cos(r.heading);

    const comboMult = 1.0 + Math.min(5, r.slalomCombo) * 0.036;
    const bailMult = r.bailTimer > 0 ? 0.52 : 1.0;
    const maxSpd =
      (r.phys.topSpeed * comboMult + (r.nitroActive ? r.phys.nitroBonus : 0)) * bailMult;

    if (!r.airborne) {
      const spdTurnFactor = 0.48 + 0.52 * Math.min(1, r.speed / 20);
      const turnRate = r.phys.turnRate * spdTurnFactor * (brake ? 1.25 : 1.0);
      r.heading -= r.steerSmooth * turnRate * dt;

      const nFwdX = Math.sin(r.heading);
      const nFwdZ = Math.cos(r.heading);
      const accelForce =
        throttle * r.phys.accel * (r.nitroActive ? 1.75 : 1.0) * bailMult -
        brake * 27.0;

      let vFwd = r.vx * nFwdX + r.vz * nFwdZ;
      let vRight = r.vx * -nFwdZ + r.vz * nFwdX;

      vFwd += accelForce * dt;
      const carveDrag = 1.0 + Math.abs(r.steerSmooth) * 0.12;
      vFwd -= vFwd * (0.46 * carveDrag) * dt;
      if (vFwd > maxSpd) vFwd += (maxSpd - vFwd) * Math.min(1, dt * 4.5);
      if (vFwd < -4) vFwd = -4;

      vRight *= Math.max(0, 1 - r.phys.carveGrip * dt);

      r.vx = nFwdX * vFwd + -nFwdZ * vRight;
      r.vz = nFwdZ * vFwd + nFwdX * vRight;
    } else {
      r.heading -= r.steerSmooth * r.phys.turnRate * 0.36 * dt;
      if (r.nitroActive) {
        r.vx += fwdX * 12.0 * dt;
        r.vz += fwdZ * 12.0 * dt;
      }
      r.vx *= 1 - dt * 0.15;
      r.vz *= 1 - dt * 0.15;
    }

    r.x += r.vx * dt;
    r.z += r.vz * dt;
    r.speed = Math.hypot(r.vx, r.vz);

    // ---- 5. Vertical Physics: Buoyancy, Ramp Launch & Wave-Crest / Wake Launches!
    if (onRamp && r.rampCooldown <= 0) {
      r.y = onRamp.rampTopY + 0.16;
      r.airborne = false;
      r.onRampId = onRamp.rm.id;
      if (onRamp.frac > 0.78 && r.speed > 17) {
        const launchV = (13.2 + r.speed * 0.23) * r.phys.rampBoost;
        r.vy = Math.max(r.vy, launchV);
        r.airborne = true;
        r.airTime = 0;
        r.peakAirH = 0;
        r.rampCooldown = 0.65;
        r.onRampId = -1;
        if (r.isPlayer) {
          events.push({ type: 'ramp_launch', x: r.x, y: r.y, z: r.z });
        }
      }
    } else if (r.airborne) {
      r.airTime += dt;
      r.vy -= GRAVITY * dt;
      r.y += r.vy * dt;
      const heightAboveWater = r.y - surfaceY;
      if (heightAboveWater > r.peakAirH) r.peakAirH = heightAboveWater;

      if (wantStunt && !r.stunt && r.airTime > 0.05 && (heightAboveWater > 1.25 || r.vy > 3.2)) {
        const def = STUNT_DEFS[wantStunt];
        if (def) {
          r.stunt = {
            id: def.id,
            label: def.label,
            progress: 0,
            duration: def.duration / r.phys.stuntSpeed,
            nitro: def.nitro,
            cash: def.cash,
            completed: false,
          };
          if (r.isPlayer) {
            events.push({ type: 'stunt_start', label: def.label });
          }
        }
      }

      if (r.stunt) {
        r.stunt.progress += dt / r.stunt.duration;
        if (r.stunt.progress >= 1.0 && !r.stunt.completed) {
          r.stunt.completed = true;
          r.stunt.progress = 1.0;
        }
      }

      if (r.y <= surfaceY + 0.12 && r.vy <= 0) {
        const impact = Math.min(1.4, Math.abs(r.vy) / 14.0);
        r.y = surfaceY + 0.12;
        r.vy = 0;
        r.airborne = false;

        if (r.stunt) {
          const minProg = diff.id === 'rookie' ? 0.72 : 0.82;
          if (r.stunt.completed || r.stunt.progress >= minProg) {
            r.nitro = Math.min(100, r.nitro + r.stunt.nitro);
            r.stuntCount++;
            r.stuntCash += r.stunt.cash;
            if (r.isPlayer) {
              events.push({
                type: 'stunt_land',
                label: r.stunt.label,
                nitro: r.stunt.nitro,
                cash: r.stunt.cash,
                x: r.x,
                y: r.y,
                z: r.z,
                impact,
              });
            }
          } else {
            r.bailTimer = 0.95;
            r.vx *= 0.55;
            r.vz *= 0.55;
            r.slalomCombo = 0;
            if (r.isPlayer) {
              events.push({
                type: 'stunt_bail',
                label: r.stunt.label,
                x: r.x,
                y: r.y,
                z: r.z,
              });
            }
          }
          r.stunt = null;
        } else if (r.airTime > 0.30) {
          const airBonus = Math.min(14, Math.round(r.airTime * 7));
          r.nitro = Math.min(100, r.nitro + airBonus);
          if (r.isPlayer) {
            events.push({
              type: 'splashdown',
              impact,
              airTime: r.airTime,
              x: r.x,
              y: r.y,
              z: r.z,
            });
          }
        }
        r.airTime = 0;
      }
    } else {
      const targetY = surfaceY + 0.14;
      const errY = targetY - r.y;
      r.vy += errY * 62.0 * dt;
      r.vy *= Math.max(0, 1 - 10.5 * dt);
      r.y += r.vy * dt;
      if (r.y < surfaceY - 0.45) r.y = surfaceY - 0.45;

      const waveSlopeFwd = -(_ocean.nx * fwdX + _ocean.nz * fwdZ);
      const bigCrestLaunch =
        r.speed > 34 && _ocean.crest > 0.44 && waveSlopeFwd > 0.11 && _ocean.vy > 0.15;
      const manualWavePop = wantJump && r.speed > 18;

      if (bigCrestLaunch || manualWavePop) {
        const popBoost = manualWavePop ? 12.2 + _ocean.crest * 4.5 : 8.2 + _ocean.crest * 6.5;
        r.vy = Math.max(r.vy, popBoost * r.phys.rampBoost);
        r.airborne = true;
        r.airTime = 0;
        r.peakAirH = 0;
        if (r.isPlayer && manualWavePop) {
          events.push({ type: 'ramp_launch', x: r.x, y: r.y, z: r.z });
        }
      }
    }

    // ---- 6. Hull Pitch & Roll Alignment
    const fwdSlope = -(_ocean.nx * fwdX + _ocean.nz * fwdZ);
    const sideSlope = _ocean.nx * -fwdZ + _ocean.nz * fwdX;
    let targetPitch = 0;
    let targetRoll = 0;

    if (onRamp) {
      targetPitch = -0.26;
      targetRoll = r.steerSmooth * 0.25;
    } else if (r.airborne) {
      targetPitch = Math.max(-0.52, Math.min(0.45, -r.vy * 0.032));
      targetRoll = r.steerSmooth * 0.35;
    } else {
      targetPitch = -fwdSlope * 0.85 - (r.speed / 58) * 0.11 - (r.nitroActive ? 0.08 : 0);
      targetRoll = r.steerSmooth * 0.56 + sideSlope * 0.45 + Math.sin(waveTime * 14) * r.wakeJostle * 0.16;
    }

    r.pitch += (targetPitch - r.pitch) * Math.min(1, dt * 8.5);
    r.roll += (targetRoll - r.roll) * Math.min(1, dt * 9.5);

    // ---- 7. Course Projection, Buoy Lane Rope Cushion & Lap Counting
    projectToCourse(course, r.x, r.z, r.s, _proj);
    const prevS = r.s;
    const ds = deltaS(course, prevS, _proj.s);
    r.prevS = prevS;
    r.s = _proj.s;
    r.lateral = _proj.lateral;

    // Buoyant lane-rope barrier keeps racers smoothly inside the marked water channel!
    const maxLat = course.width * 0.55;
    if (Math.abs(r.lateral) > maxLat) {
      const over = Math.abs(r.lateral) - maxLat;
      const pushDir = r.lateral > 0 ? -1 : 1;
      r.x += _proj.rx * pushDir * over * 0.65;
      r.z += _proj.rz * pushDir * over * 0.65;
      const outVel = r.vx * _proj.rx * Math.sign(r.lateral) + r.vz * _proj.rz * Math.sign(r.lateral);
      if (outVel > 0) {
        r.vx -= _proj.rx * Math.sign(r.lateral) * outVel * 0.82;
        r.vz -= _proj.rz * Math.sign(r.lateral) * outVel * 0.82;
      }
      // Gently align heading back parallel with the lane rope so players never get stuck sideways!
      if (r.isPlayer) {
        const courseH = Math.atan2(_proj.tx, _proj.tz);
        const hErr = angleDiff(courseH, r.heading);
        if (Math.abs(hErr) < 1.8) {
          r.heading += hErr * Math.min(1, dt * 2.8);
        }
      }
    }

    // Compute live Overhead Direction Arrow & Wrong-Way Alert for the player!
    if (r.isPlayer) {
      const guidePt = sampleCourse(course, r.s + 52, _sp);
      const targetH = Math.atan2(guidePt.x - r.x, guidePt.z - r.z);
      // angleDiff > 0 means target is to the LEFT; negate so positive navAngle = RIGHT for CSS rotate()!
      const relRight = -angleDiff(targetH, r.heading);
      r.navAngle = relRight;

      const courseH = Math.atan2(_proj.tx, _proj.tz);
      const trackErr = Math.abs(angleDiff(courseH, r.heading));
      if (racingActive && !r.finished && trackErr > 1.9) {
        r.wrongWayTimer += dt;
        r.wrongWay = r.wrongWayTimer > 0.35;
        // On Rookie, gently help spin player back around if stuck facing backwards > 1.8s
        if (diff.id === 'rookie' && r.wrongWayTimer > 1.8) {
          r.heading += angleDiff(courseH, r.heading) * Math.min(1, dt * 2.5);
        }
      } else {
        r.wrongWayTimer = 0;
        r.wrongWay = false;
      }
    }

    if (racingActive) {
      r.totalProgress += ds;
      const newLap = Math.floor(r.totalProgress / course.totalLen) + 1;
      if (newLap > r.lap && r.totalProgress > course.totalLen * 0.5) {
        const lapTime = sim.raceTime - r.lapStartTime;
        if (r.lap >= 1 && lapTime > 10) {
          if (r.bestLapTime === null || lapTime < r.bestLapTime) {
            r.bestLapTime = lapTime;
          }
        }
        r.lapStartTime = sim.raceTime;
        r.lap = newLap;

        if (r.lap > LAPS_PER_RACE && !r.finished) {
          r.finished = true;
          r.finishTime = sim.raceTime;
          if (r.isPlayer) {
            events.push({ type: 'race_finish', place: r.place, time: r.finishTime });
          }
        } else if (r.isPlayer) {
          events.push({ type: 'new_lap', lap: r.lap, finalLap: r.lap === LAPS_PER_RACE });
        }
      }
    }

    // ---- 8. Red / Yellow Buoy Slalom Detection (Player)
    if (r.isPlayer && racingActive && !r.finished) {
      checkBuoySlalom(r, course, prevS, r.s, events);
    }
  }

  // ---- 9. Wake-Spray Bumping Collisions & Wake Turbulence
  if (racingActive) {
    resolveRacerInteractions(racers, events);
  }

  // ---- 10. Update Live Standings (1st..8th)
  const sorted = [...racers].sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalProgress - a.totalProgress;
  });
  for (let idx = 0; idx < sorted.length; idx++) {
    sorted[idx].place = idx + 1;
  }

  // ---- 11. Sync 3D Meshes & Animated Rider Stunt Poses
  for (let i = 0; i < racers.length; i++) {
    const r = racers[i];
    if (!r.meshApi) continue;
    r.meshApi.root.position.set(r.x, r.y, r.z);
    r.meshApi.root.rotation.order = 'YXZ';
    r.meshApi.root.rotation.set(r.pitch, r.heading, r.roll);
    r.meshApi.updatePose({
      steer: r.steerSmooth,
      nitro: r.nitroActive ? 1.0 : 0.0,
      stuntType: r.stunt ? r.stunt.id : null,
      stuntProgress: r.stunt ? r.stunt.progress : 0,
      bob: r.airborne ? 0.05 : Math.sin(waveTime * 8 + i) * 0.015,
    });
  }
}

function checkBuoySlalom(player, course, prevS, curS, events) {
  const buoys = course.buoys;
  const ds = deltaS(course, prevS, curS);
  if (ds <= 0.05) return;

  for (let i = 0; i < buoys.length; i++) {
    const b = buoys[i];
    const dPrev = deltaS(course, prevS, b.s);
    const dCur = deltaS(course, curS, b.s);
    if (dPrev >= 0 && dCur < 0 && dPrev < 35) {
      const relRight = (player.x - b.x) * b.rx + (player.z - b.z) * b.rz;
      const dist = Math.abs(relRight);
      const correct = (b.side === 'right' && relRight > -1.0) || (b.side === 'left' && relRight < 1.0);

      player.buoysTotal++;
      if (correct && dist < course.width * 0.72) {
        player.slalomCombo = Math.min(5, player.slalomCombo + 1);
        if (player.slalomCombo > player.maxCombo) player.maxCombo = player.slalomCombo;
        player.buoysHit++;
        const nitroGain = 7 + player.slalomCombo * 2.5;
        player.nitro = Math.min(100, player.nitro + nitroGain);
        events.push({
          type: 'buoy_hit',
          side: b.side,
          combo: player.slalomCombo,
          nitro: Math.round(nitroGain),
        });
      } else {
        const hadCombo = player.slalomCombo > 0;
        player.slalomCombo = 0;
        events.push({
          type: 'buoy_miss',
          side: b.side,
          hadCombo,
        });
      }
    }
  }

  let bestIdx = 0;
  let bestAhead = Infinity;
  for (let i = 0; i < buoys.length; i++) {
    let ahead = buoys[i].s - curS;
    if (ahead < 0) ahead += course.totalLen;
    if (ahead < bestAhead) {
      bestAhead = ahead;
      bestIdx = i;
    }
  }
  player.nextBuoyIdx = bestIdx;
}

function resolveRacerInteractions(racers, events) {
  for (let i = 0; i < racers.length; i++) {
    const a = racers[i];
    for (let j = i + 1; j < racers.length; j++) {
      const b = racers[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      const minDist = 2.65;

      if (distSq < minDist * minDist && distSq > 1e-4 && Math.abs(a.y - b.y) < 2.2) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minDist - dist;

        const totalMass = a.phys.mass + b.phys.mass;
        const aShare = b.phys.mass / totalMass;
        const bShare = a.phys.mass / totalMass;

        a.x -= nx * overlap * aShare;
        a.z -= nz * overlap * aShare;
        b.x += nx * overlap * bShare;
        b.z += nz * overlap * bShare;

        const relVx = b.vx - a.vx;
        const relVz = b.vz - a.vz;
        const sepVel = relVx * nx + relVz * nz;
        if (sepVel < 2.0) {
          const impulse = (7.2 - sepVel) * 0.76;
          a.vx -= nx * impulse * aShare;
          a.vz -= nz * impulse * aShare;
          b.vx += nx * impulse * bShare;
          b.vz += nz * impulse * bShare;
        }

        if (a.bumpCooldown <= 0 || b.bumpCooldown <= 0) {
          a.bumpCooldown = 0.45;
          b.bumpCooldown = 0.45;
          a.wakeJostle = 1.0;
          b.wakeJostle = 1.0;
          events.push({
            type: 'wake_bump',
            involvesPlayer: a.isPlayer || b.isPlayer,
            x: (a.x + b.x) * 0.5,
            y: (a.y + b.y) * 0.5,
            z: (a.z + b.z) * 0.5,
          });
        }
      } else if (a.isPlayer && !a.airborne && !b.airborne && b.speed > 20 && distSq < 18 * 18) {
        const bFwdX = Math.sin(b.heading);
        const bFwdZ = Math.cos(b.heading);
        const behind = -(a.x - b.x) * bFwdX - (a.z - b.z) * bFwdZ;
        const across = Math.abs((a.x - b.x) * -bFwdZ + (a.z - b.z) * bFwdX);
        if (behind > 2.5 && behind < 15.0 && across < 3.2) {
          a.wakeJostle = Math.max(a.wakeJostle, 0.72);
          if (Math.random() < 0.08) {
            events.push({ type: 'wake_spray_lens', strength: 0.35 });
          }
        }
      }
    }
  }
}

function computeAIControls(r, player, course, dt, diff) {
  r.aiLaneTimer -= dt;
  if (r.aiLaneTimer <= 0) {
    r.aiLaneTimer = 1.6 + Math.random() * 2.2;
    r.aiTargetLat = (Math.random() - 0.5) * (course.width * 0.48);
  }

  let targetLat = r.aiTargetLat;
  for (let i = 0; i < course.buoys.length; i++) {
    const b = course.buoys[i];
    const ahead = deltaS(course, r.s, b.s);
    if (ahead > 4 && ahead < 68) {
      targetLat = b.lat + (b.side === 'right' ? 6.5 : -6.5);
      break;
    }
  }
  for (let i = 0; i < course.ramps.length; i++) {
    const rm = course.ramps[i];
    const ahead = deltaS(course, r.s, rm.s);
    if (ahead > 4 && ahead < 52 && Math.abs(rm.lat - r.lateral) < 11) {
      targetLat = rm.lat;
      break;
    }
  }

  const lookDist = 26 + r.speed * 0.48;
  sampleCourse(course, r.s + lookDist, _sp);
  const aimX = _sp.x + _sp.rx * targetLat;
  const aimZ = _sp.z + _sp.rz * targetLat;
  const desiredH = Math.atan2(aimX - r.x, aimZ - r.z);
  const d = angleDiff(desiredH, r.heading);
  const steer = Math.max(-1, Math.min(1, -d * 1.9));

  // Tight exciting pack racing! Leaders never run away out of sight; clean driving earns 1st!
  let throttle = 1.0;
  let nitro = false;
  if (!r.isPlayer) {
    const gap = r.totalProgress - player.totalProgress;
    if (gap > diff.aiRubberGap) {
      throttle = diff.aiRubberLead;
    } else if (gap > diff.aiRubberGap * 0.45) {
      throttle = (1.0 + diff.aiRubberLead) * 0.5;
    } else if (gap < -65) {
      throttle = 1.0;
      if (r.nitro > 22 && diff.id !== 'rookie') nitro = true;
    } else {
      r.aiNitroTimer -= dt;
      if (r.aiNitroTimer <= 0 && Math.abs(steer) < 0.25 && r.nitro > 40 && diff.id !== 'rookie') {
        nitro = true;
        if (r.aiNitroTimer < -1.2) r.aiNitroTimer = 5.0 + Math.random() * 5.0;
      }
    }
  }

  let stunt = null;
  if (r.airborne && !r.stunt && r.airTime > 0.14 && r.vy > 4.5 && Math.random() < 0.08) {
    const keys = ['superman', 'spin360', 'backflip', 'grab'];
    stunt = keys[r.id % keys.length];
  }

  return { throttle, brake: Math.abs(d) > 1.25 ? 0.5 : 0, steer, nitro, stunt };
}
