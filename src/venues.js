// 3 Photoreal Venues:
//   1) Azure Atoll    — turquoise coral lagoon, volcanic peaks, yachts, palms
//   2) Nordic Fjord   — glacial cliffs, waterfalls, glowing icebergs, pines
//   3) Tempest Harbor — cargo ships, lighthouse w/ rotating beam, breakwaters, huge swells
//
// Each venue has a closed-loop 2D ocean circuit, Red/Yellow slalom buoys,
// floating jump ramps, seabed bathymetry (for Beer-Lambert water absorption),
// and safe non-overlapping landmark coordinates.

import * as THREE from 'three';

export const LAPS_PER_RACE = 3;

export const VENUES = [
  {
    id: 'azure',
    name: 'AZURE ATOLL',
    subtitle: 'Coral Lagoon & Volcanic Peaks',
    difficulty: 1,
    difficultyLabel: 'SUNLIT LAGOON',
    description:
      'Crystal-clear turquoise shallows over sunlit sandbars, swaying palm islets, anchored luxury yachts, and playful reef swells.',
    courseWidth: 46,
    seabedBase: -7.5,
    seabedShallow: -2.2,
    waterColors: {
      shallow: '#1fd6c7',
      deep: '#074e78',
      absorb: [0.34, 0.085, 0.048], // Beer-Lambert RGB extinction
      sss: '#1cf0d8',
      foam: '#f4fbff',
      seabedTint: '#ead8b4',
    },
    skyPalette: {
      sunny: {
        top: '#0e58b8',
        mid: '#4a9ce6',
        horizon: '#c9eef6',
        sun: '#fff5de',
        ground: '#0d4a66',
        fog: '#b4e1ee',
        fogNear: 260,
        fogFar: 1750,
        az: 0.78,
        el: 0.62,
        cloud: 0.34,
        cloudDark: 0.08,
        haze: 0.22,
        sunInt: 5.0,
        hemiSky: '#98d4ff',
        hemiGround: '#1a6875',
        hemiInt: 1.45,
        envInt: 1.3,
        exposure: 1.04,
      },
    },
    // Closed-loop waypoints (x, z) — ~1,580m perimeter
    waypoints: [
      [0, 0],
      [0, -175],
      [62, -310],
      [195, -355],
      [330, -280],
      [375, -140],
      [310, 10],
      [255, 130],
      [310, 260],
      [215, 345],
      [75, 315],
      [-20, 210],
      [-50, 105],
    ],
    // Buoy pattern along normalized lap fraction [t, side ('right'=RED, 'left'=YELLOW), lateralOffset]
    buoySpec: [
      [0.06, 'right', -4],
      [0.12, 'left', 5],
      [0.18, 'right', -6],
      [0.25, 'left', 4],
      [0.32, 'right', -5],
      [0.39, 'left', 6],
      [0.46, 'right', -4],
      [0.53, 'left', 5],
      [0.60, 'right', -6],
      [0.67, 'left', 5],
      [0.74, 'right', -4],
      [0.81, 'left', 6],
      [0.88, 'right', -5],
      [0.94, 'left', 4],
    ],
    // Floating jump ramps [t, lateralOffset]
    rampSpec: [
      [0.09, 2],
      [0.29, -3],
      [0.49, 4],
      [0.70, -2],
      [0.86, 3],
    ],
    cardGrad: 'linear-gradient(180deg, #1b7fd4 0%, #63cbe8 52%, #14b8a6 72%, #074e78 100%)',
    accentColor: '#1ee3cf',
  },
  {
    id: 'fjord',
    name: 'NORDIC FJORD',
    subtitle: 'Glacial Cliffs & Drift Icebergs',
    difficulty: 2,
    difficultyLabel: 'GLACIAL CHOP',
    description:
      'Sheer snow-dusted granite walls, thundering waterfalls, glowing cyan icebergs, pine-clad ledges, and brisk emerald-indigo swells.',
    courseWidth: 44,
    seabedBase: -16.0,
    seabedShallow: -5.0,
    waterColors: {
      shallow: '#148f9c',
      deep: '#062845',
      absorb: [0.42, 0.14, 0.085],
      sss: '#22d8c8',
      foam: '#edf8ff',
      seabedTint: '#596b75',
    },
    skyPalette: {
      sunny: {
        top: '#17488a',
        mid: '#5a8ec4',
        horizon: '#cce0ee',
        sun: '#fff4e0',
        ground: '#122c42',
        fog: '#b2cadb',
        fogNear: 240,
        fogFar: 1650,
        az: 1.18,
        el: 0.44,
        cloud: 0.46,
        cloudDark: 0.16,
        haze: 0.28,
        sunInt: 4.5,
        hemiSky: '#a8cbe8',
        hemiGround: '#243c4d',
        hemiInt: 1.5,
        envInt: 1.28,
        exposure: 1.05,
      },
    },
    // Dramatic sweeping fjord loop (~1,700m)
    waypoints: [
      [0, 0],
      [12, -195],
      [95, -345],
      [255, -370],
      [385, -260],
      [410, -90],
      [300, 45],
      [355, 195],
      [275, 345],
      [115, 355],
      [-30, 260],
      [-75, 130],
    ],
    buoySpec: [
      [0.055, 'left', 5],
      [0.115, 'right', -5],
      [0.175, 'left', 6],
      [0.24, 'right', -6],
      [0.305, 'left', 4],
      [0.37, 'right', -5],
      [0.44, 'left', 6],
      [0.51, 'right', -5],
      [0.58, 'left', 5],
      [0.65, 'right', -6],
      [0.72, 'left', 5],
      [0.79, 'right', -4],
      [0.86, 'left', 6],
      [0.93, 'right', -4],
    ],
    rampSpec: [
      [0.14, 0],
      [0.33, 3],
      [0.54, -4],
      [0.75, 2],
      [0.90, -2],
    ],
    cardGrad: 'linear-gradient(180deg, #27588c 0%, #86b3d4 52%, #126b78 72%, #062540 100%)',
    accentColor: '#56e0ff',
  },
  {
    id: 'harbor',
    name: 'TEMPEST HARBOR',
    subtitle: 'Cargo Ships, Lighthouse & Huge Swells',
    difficulty: 3,
    difficultyLabel: 'HEAVY SWELLS',
    description:
      'Thread towering container freighters, stone breakwaters, and a sweeping lighthouse beam through thunderous open-ocean rollers.',
    courseWidth: 48,
    seabedBase: -14.0,
    seabedShallow: -4.2,
    waterColors: {
      shallow: '#18888d',
      deep: '#07243b',
      absorb: [0.46, 0.16, 0.10],
      sss: '#1fd1ba',
      foam: '#eef6fa',
      seabedTint: '#4f5a5c',
    },
    skyPalette: {
      sunny: {
        top: '#1c4d8a',
        mid: '#6492bc',
        horizon: '#d0dce4',
        sun: '#fff0d4',
        ground: '#152938',
        fog: '#b2c4d0',
        fogNear: 230,
        fogFar: 1580,
        az: 2.35,
        el: 0.48,
        cloud: 0.56,
        cloudDark: 0.24,
        haze: 0.32,
        sunInt: 4.4,
        hemiSky: '#a4bed4',
        hemiGround: '#243540',
        hemiInt: 1.45,
        envInt: 1.32,
        exposure: 1.06,
      },
    },
    // Wide high-speed maritime shipping channel loop (~1,820m)
    waypoints: [
      [0, 0],
      [-15, -210],
      [85, -370],
      [265, -400],
      [420, -280],
      [435, -80],
      [355, 110],
      [380, 275],
      [250, 380],
      [80, 350],
      [-60, 250],
      [-70, 115],
    ],
    buoySpec: [
      [0.05, 'right', -6],
      [0.11, 'left', 6],
      [0.17, 'right', -5],
      [0.23, 'left', 5],
      [0.295, 'right', -6],
      [0.36, 'left', 6],
      [0.425, 'right', -5],
      [0.49, 'left', 5],
      [0.555, 'right', -6],
      [0.62, 'left', 6],
      [0.685, 'right', -5],
      [0.75, 'left', 5],
      [0.815, 'right', -6],
      [0.88, 'left', 5],
      [0.94, 'right', -4],
    ],
    rampSpec: [
      [0.08, 3],
      [0.26, -4],
      [0.45, 2],
      [0.65, -3],
      [0.84, 4],
      [0.96, 0],
    ],
    cardGrad: 'linear-gradient(180deg, #2b4563 0%, #6d8ba3 50%, #175c69 72%, #071e30 100%)',
    accentColor: '#ff9248',
  },
];

// Build runtime smooth spline, uniform arc-length lookup table, buoys & ramps for a venue
export function buildCourse(venue) {
  const pts = venue.waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  const SAMPLES = 360;
  const rawPts = curve.getSpacedPoints(SAMPLES); // length SAMPLES + 1 (last == first)

  // Compute cumulative arc length + tangents + right normals
  const nodes = [];
  let totalLen = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const p = rawPts[i];
    const next = rawPts[(i + 1) % SAMPLES];
    const prev = rawPts[(i - 1 + SAMPLES) % SAMPLES];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    const dirX = tx / tlen;
    const dirZ = tz / tlen;
    // Right vector in XZ plane (when facing (dirX, dirZ), right is (-dirZ, dirX))
    const rightX = -dirZ;
    const rightZ = dirX;
    nodes.push({
      s: totalLen,
      x: p.x,
      z: p.z,
      tx: dirX,
      tz: dirZ,
      rx: rightX,
      rz: rightZ,
      heading: Math.atan2(dirX, dirZ),
    });
    totalLen += Math.hypot(next.x - p.x, next.z - p.z);
  }

  const course = {
    venue,
    nodes,
    totalLen,
    width: venue.courseWidth,
    buoys: [],
    ramps: [],
    bounds: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  };

  for (const n of nodes) {
    if (n.x < course.bounds.minX) course.bounds.minX = n.x;
    if (n.x > course.bounds.maxX) course.bounds.maxX = n.x;
    if (n.z < course.bounds.minZ) course.bounds.minZ = n.z;
    if (n.z > course.bounds.maxZ) course.bounds.maxZ = n.z;
  }

  // Generate Red / Yellow Slalom Buoys
  course.buoys = venue.buoySpec.map(([frac, side, lat], idx) => {
    const s = frac * totalLen;
    const sp = sampleCourse(course, s);
    const x = sp.x + sp.rx * lat;
    const z = sp.z + sp.rz * lat;
    return {
      id: idx,
      s,
      frac,
      side, // 'right' => RED buoy (pass on its right), 'left' => YELLOW buoy (pass on its left)
      lat,
      x,
      z,
      tx: sp.tx,
      tz: sp.tz,
      rx: sp.rx,
      rz: sp.rz,
      heading: sp.heading,
      passedLap: -1,
    };
  });

  // Generate Floating Jump Ramps
  course.ramps = venue.rampSpec.map(([frac, lat], idx) => {
    const s = frac * totalLen;
    const sp = sampleCourse(course, s);
    const x = sp.x + sp.rx * lat;
    const z = sp.z + sp.rz * lat;
    return {
      id: idx,
      s,
      lat,
      x,
      z,
      tx: sp.tx,
      tz: sp.tz,
      rx: sp.rx,
      rz: sp.rz,
      heading: sp.heading,
      length: 13.5,
      width: 6.4,
      height: 3.1,
    };
  });

  return course;
}

export function wrapS(course, s) {
  const L = course.totalLen;
  let r = s % L;
  if (r < 0) r += L;
  return r;
}

export function deltaS(course, fromS, toS) {
  const L = course.totalLen;
  let d = (toS - fromS) % L;
  if (d > L * 0.5) d -= L;
  if (d < -L * 0.5) d += L;
  return d;
}

export function sampleCourse(course, s, out = {}) {
  const L = course.totalLen;
  const nodes = course.nodes;
  const N = nodes.length;
  const ws = wrapS(course, s);
  const f = (ws / L) * N;
  const i0 = Math.floor(f) % N;
  const i1 = (i0 + 1) % N;
  const a = f - Math.floor(f);
  const n0 = nodes[i0];
  const n1 = nodes[i1];

  out.s = ws;
  out.x = n0.x + (n1.x - n0.x) * a;
  out.z = n0.z + (n1.z - n0.z) * a;
  let tx = n0.tx + (n1.tx - n0.tx) * a;
  let tz = n0.tz + (n1.tz - n0.tz) * a;
  const tl = Math.hypot(tx, tz) || 1;
  tx /= tl;
  tz /= tl;
  out.tx = tx;
  out.tz = tz;
  out.rx = -tz;
  out.rz = tx;
  out.heading = Math.atan2(tx, tz);
  return out;
}

// Project arbitrary (x, z) onto closest course node (returns s, lateral offset, distance)
export function projectToCourse(course, x, z, hintS = null, out = {}) {
  const nodes = course.nodes;
  const N = nodes.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintS !== null) {
    const center = Math.floor((wrapS(course, hintS) / course.totalLen) * N) % N;
    const win = 26;
    for (let k = -win; k <= win; k++) {
      const idx = (center + k + N) % N;
      const n = nodes[idx];
      const dx = x - n.x;
      const dz = z - n.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = idx;
      }
    }
  }
  // Fallback full scan if far from hint
  if (bestDistSq > 110 * 110) {
    bestDistSq = Infinity;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const dx = x - n.x;
      const dz = z - n.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
  }

  const n = nodes[bestIdx];
  const dx = x - n.x;
  const dz = z - n.z;
  const along = dx * n.tx + dz * n.tz;
  const lateral = dx * n.rx + dz * n.rz;
  out.s = wrapS(course, n.s + along);
  out.lateral = lateral;
  out.dist = Math.abs(lateral);
  out.tx = n.tx;
  out.tz = n.tz;
  out.rx = n.rx;
  out.rz = n.rz;
  out.cx = n.x + n.tx * along;
  out.cz = n.z + n.tz * along;
  return out;
}

// Compute distance from (x, z) to nearest course centerline (used to keep islands/ships clear!)
export function minCourseDist(course, x, z) {
  const nodes = course.nodes;
  let best = Infinity;
  for (let i = 0; i < nodes.length; i += 2) {
    const n = nodes[i];
    const d2 = (x - n.x) * (x - n.x) + (z - n.z) * (z - n.z);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}
