// Photoreal 3D Venue Builders + Course Buoys, Floating Jump Ramps & Start/Finish Arch:
//  1) Azure Atoll    — turquoise coral lagoon, volcanic peaks, yachts, swaying palms
//  2) Nordic Fjord   — sheer granite glacial cliffs, animated waterfalls, glowing icebergs, pines
//  3) Tempest Harbor — container cargo ships, striped lighthouse w/ rotating beam, breakwaters

import * as THREE from 'three';
import { minCourseDist, sampleCourse } from './venues.js';
import { sampleOcean, sampleOceanHeight } from './waves.js';
import { PERF } from './perf.js';

// Deterministic seeded PRNG for consistent photoreal venue layouts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _sharedTex = null;
function getTextures() {
  if (_sharedTex) return _sharedTex;
  const loader = new THREE.TextureLoader();
  const load = (file, srgb = true, rep = 4) => {
    const t = loader.load(`./assets/tex/${file}`);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = PERF.anisotropy || 8;
    return t;
  };
  _sharedTex = {
    sandDiff: load('coast_sand_02_diff_1k.jpg', true, 5),
    sandNor: load('coast_sand_02_nor_gl_1k.jpg', false, 5),
    rockDiff: load('rock_face_diff_1k.jpg', true, 4),
    rockNor: load('rock_face_nor_gl_1k.jpg', false, 4),
    grassDiff: load('grass_path_3_diff_1k.jpg', true, 4),
  };
  return _sharedTex;
}

// Create checkered canvas texture for floating jump ramps & start banner
function createCheckerTexture(colA, colB, cells = 6) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const s = 256 / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? colA : colB;
      g.fillRect(x * s, y * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Create banner canvas texture for Start/Finish Gantry
function createBannerTexture(title) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d');
  // Deep ocean gradient
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#07223d');
  grad.addColorStop(0.5, '#0c4f7a');
  grad.addColorStop(1, '#07223d');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 192);

  // Checkered top/bottom trim
  for (let i = 0; i < 32; i++) {
    g.fillStyle = i % 2 === 0 ? '#ffffff' : '#111827';
    g.fillRect(i * 32, 0, 32, 20);
    g.fillRect(i * 32, 172, 32, 20);
  }
  // Bold lettering
  g.fillStyle = '#38f8ff';
  g.font = '900 72px Impact, Arial Black, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`RIPTIDE RUSH  •  ${title}`, 512, 98);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sculpt organic craggy volcanic peak or sheer glacial cliff with ridged ridges, twin shoulders,
// and elevation/slope-driven photoreal vertex coloration (sand -> lush jungle/rock -> basalt/snow)!
function createMountainMesh(radius, height, seed, mat, steepness = 1.0, biome = 'volcanic') {
  const segsR = 36;
  const segsH = 36;
  const geo = new THREE.PlaneGeometry(radius * 2.2, radius * 2.2, segsR, segsH);
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.attributes.position;
  const shAng = seed * 1.7;
  const shX = Math.cos(shAng) * radius * 0.42;
  const shZ = Math.sin(shAng) * radius * 0.42;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const rMain = Math.hypot(x, z) / radius;
    const rSh = Math.hypot(x - shX, z - shZ) / (radius * 0.62);
    const ang = Math.atan2(z, x);

    const r1 = 1.0 - Math.abs(Math.sin(ang * 3.0 + seed + rMain * 2.2));
    const r2 = 1.0 - Math.abs(Math.cos(ang * 5.0 - seed * 1.3 + rMain * 3.8));
    const r3 = Math.sin(x * 0.045 + seed) * Math.cos(z * 0.045 - seed * 0.7);
    const ridgeNoise = r1 * 0.24 + r2 * 0.14 + r3 * 0.12;

    const falloff1 = Math.max(0, 1.0 - Math.pow(rMain, 1.15 + steepness * 0.35));
    const falloff2 = Math.max(0, 1.0 - Math.pow(rSh, 1.35)) * 0.62;
    let hNorm = Math.max(falloff1, falloff2);

    if (hNorm > 0.01) {
      hNorm = Math.pow(hNorm, 0.88) * (0.82 + ridgeNoise * 0.58);
    }
    const y = hNorm * height - 4.5;
    pos.setY(i, y);
  }
  geo.computeVertexNormals();

  // Elevation & slope-based natural biome shading
  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(
    biome === 'fjord' ? '#3a4a56' : biome === 'harbor' ? '#48525a' : '#d9c69e'
  );
  const cMid = new THREE.Color(
    biome === 'fjord' ? '#526270' : biome === 'harbor' ? '#5e6a6c' : '#3a7a36'
  );
  const cRock = new THREE.Color(
    biome === 'fjord' ? '#394652' : biome === 'harbor' ? '#444d54' : '#4a4e48'
  );
  const cHigh = new THREE.Color(
    biome === 'fjord' ? '#f2f8ff' : biome === 'harbor' ? '#6c777e' : '#36443a'
  );
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const ny = Math.max(0, Math.min(1, y / Math.max(1, height * 0.92)));
    const slope = 1.0 - Math.max(0, nor.getY(i)); // 0 = flat, 1 = vertical cliff

    if (biome === 'volcanic') {
      tmp.copy(cLow).lerp(cMid, Math.min(1, Math.max(0, (y - 1.5) / 8.0)));
      tmp.lerp(cRock, Math.min(1, Math.max(0, (slope - 0.25) * 2.2 + ny * 0.45)));
    } else if (biome === 'fjord') {
      tmp.copy(cLow).lerp(cMid, Math.min(1, ny * 1.4));
      const snowMask = Math.max(0, Math.min(1, (ny - 0.44) * 3.2 - slope * 1.15));
      tmp.lerp(cHigh, snowMask);
    } else {
      tmp.copy(cLow).lerp(cMid, Math.min(1, ny * 1.3));
      tmp.lerp(cHigh, Math.min(1, Math.max(0, (ny - 0.55) * 2.0)));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Build a Luxury White Motor Yacht (for Azure Atoll)
function createLuxuryYacht(rng) {
  const g = new THREE.Group();
  const whiteMat = new THREE.MeshPhysicalMaterial({
    color: '#f5f8fc',
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 0.9,
  });
  const teakMat = new THREE.MeshStandardMaterial({ color: '#9c6f44', roughness: 0.72 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0b1e30',
    roughness: 0.06,
    metalness: 0.75,
    clearcoat: 1.0,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: rng() < 0.5 ? '#0e6ba8' : '#d62828',
    roughness: 0.25,
  });

  // Lower hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.2, 24), whiteMat);
  hull.position.set(0, 1.1, 0);
  g.add(hull);
  // Pointed bow
  const bow = new THREE.Mesh(new THREE.ConeGeometry(4.8, 9.0, 4), whiteMat);
  bow.rotation.x = Math.PI * 0.5;
  bow.rotation.y = Math.PI * 0.25;
  bow.scale.set(1.0, 1.0, 0.46);
  bow.position.set(0, 1.35, 15.8);
  g.add(bow);
  // Accent hull stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.55, 22), stripeMat);
  stripe.position.set(0, 1.85, 0.5);
  g.add(stripe);
  // Teak deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.2, 22), teakMat);
  deck.position.set(0, 2.75, 0);
  g.add(deck);
  // Main cabin superstructure + tinted wrap windows
  const cab1 = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.5, 12.5), whiteMat);
  cab1.position.set(0, 4.0, -0.8);
  g.add(cab1);
  const win1 = new THREE.Mesh(new THREE.BoxGeometry(5.35, 1.1, 9.8), glassMat);
  win1.position.set(0, 4.15, -0.3);
  g.add(win1);
  // Flybridge upper deck
  const cab2 = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.7, 7.5), whiteMat);
  cab2.position.set(0, 6.0, -1.6);
  g.add(cab2);
  const win2 = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.8, 5.2), glassMat);
  win2.position.set(0, 6.1, -1.0);
  g.add(win2);
  // Radar mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 4.0, 8), whiteMat);
  mast.position.set(0, 8.6, -2.5);
  mast.rotation.x = -0.25;
  g.add(mast);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// Build a Tropical Swaying Palm Tree (for Azure Atoll islets)
function createPalmTree(rng) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5c3e', roughness: 0.9 });
  const frondMat = new THREE.MeshStandardMaterial({
    color: '#2d8a47',
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  const segs = 5;
  const h = 9 + rng() * 5;
  let curY = 0;
  let curX = 0;
  const lean = (rng() - 0.5) * 0.45;
  for (let i = 0; i < segs; i++) {
    const sh = h / segs;
    const rBot = 0.42 * (1 - i * 0.12);
    const rTop = 0.42 * (1 - (i + 1) * 0.12);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, sh + 0.15, 7), trunkMat);
    const ang = lean * (i + 0.5) * 0.35;
    seg.position.set(curX + Math.sin(ang) * sh * 0.5, curY + sh * 0.5, 0);
    seg.rotation.z = -ang;
    g.add(seg);
    curX += Math.sin(ang) * sh;
    curY += Math.cos(ang) * sh;
  }
  const crown = new THREE.Group();
  crown.position.set(curX, curY, 0);
  g.add(crown);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.3;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.95, 5.2, 4), frondMat);
    frond.scale.set(1.0, 1.0, 0.16);
    frond.rotation.order = 'YXZ';
    frond.rotation.y = a;
    frond.rotation.x = 1.15 + rng() * 0.25;
    frond.position.set(Math.sin(a) * 2.1, -0.3, Math.cos(a) * 2.1);
    crown.add(frond);
  }
  return { group: g, crown, phase: rng() * Math.PI * 2 };
}

// Build a Glowing Translucent Cyan Iceberg (for Nordic Fjord)
function createIceberg(radius, height, seed) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.2 + seed) * Math.cos(z * 0.2 - seed) * 0.28 + 1.0;
    pos.setX(i, x * n);
    pos.setZ(i, z * n);
    pos.setY(i, y > 0 ? y * (height / radius) * (0.8 + 0.35 * n) : y * 0.45);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#c8f4ff',
    emissive: '#148aa8',
    emissiveIntensity: 0.42,
    roughness: 0.16,
    metalness: 0.05,
    clearcoat: 0.9,
    flatShading: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Build an Alpine Pine Tree (for Nordic Fjord)
function createPineTree(scale = 1.0) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#473628', roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#1b3d2b', roughness: 0.85, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: '#e6f2f8', roughness: 0.72, flatShading: true });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 3.6, 6), trunkMat);
  trunk.position.y = 1.8;
  g.add(trunk);

  const tiers = [
    [3.4, 5.2, 4.4],
    [2.7, 4.6, 7.2],
    [1.9, 4.0, 9.6],
  ];
  for (const [r, h, y] of tiers) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), leafMat);
    cone.position.y = y;
    g.add(cone);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.65, h * 0.42, 7), snowMat);
    cap.position.y = y + h * 0.32;
    g.add(cap);
  }
  g.scale.setScalar(scale);
  return g;
}

// Build an Animated Cascading Fjord Waterfall
function createWaterfall(height, width) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec2 uv = vUv;
        float flow1 = noise(vec2(uv.x * 12.0, uv.y * 6.0 + uTime * 3.8));
        float flow2 = noise(vec2(uv.x * 24.0, uv.y * 12.0 + uTime * 6.2));
        float streaks = smoothstep(0.22, 0.85, flow1 * 0.6 + flow2 * 0.55);
        float edge = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.84, uv.x);
        float foamBot = smoothstep(0.25, 0.0, uv.y) * 0.7;
        float alpha = clamp((streaks * 0.75 + 0.25 + foamBot) * edge, 0.0, 0.92);
        vec3 col = mix(vec3(0.75, 0.92, 1.0), vec3(1.15, 1.2, 1.25), streaks + foamBot);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 4, 8), mat);
  sheet.position.y = height * 0.5;
  g.add(sheet);

  // Mist cloud puffs at the splash pool
  const mistMat = new THREE.MeshBasicMaterial({
    color: '#d8f2ff',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(width * 0.55, 10, 8), mistMat);
    puff.position.set((i - 1.5) * width * 0.32, 2.2 + (i % 2) * 1.4, 2.5);
    puff.scale.set(1.2, 0.7, 1.0);
    g.add(puff);
  }
  return { group: g, mat };
}

// Build a Massive Container Cargo Ship (for Tempest Harbor)
function createCargoShip(rng) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#1b2634', roughness: 0.65, metalness: 0.35 });
  const redBottom = new THREE.MeshStandardMaterial({ color: '#8f241e', roughness: 0.7 });
  const bridgeMat = new THREE.MeshStandardMaterial({ color: '#e6ecf0', roughness: 0.5 });
  const winMat = new THREE.MeshStandardMaterial({ color: '#102030', roughness: 0.1, metalness: 0.8 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 92), hullMat);
  hull.position.set(0, 6.5, 0);
  g.add(hull);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(20.4, 3.8, 90), redBottom);
  keel.position.set(0, 1.2, 0);
  g.add(keel);

  const bow = new THREE.Mesh(new THREE.ConeGeometry(14.1, 22, 4), hullMat);
  bow.rotation.x = Math.PI * 0.5;
  bow.rotation.y = Math.PI * 0.25;
  bow.scale.set(1.0, 1.0, 0.85);
  bow.position.set(0, 6.5, 55);
  g.add(bow);

  // Rear bridge tower + funnel
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(17, 18, 14), bridgeMat);
  bridge.position.set(0, 21, -34);
  g.add(bridge);
  const bWin = new THREE.Mesh(new THREE.BoxGeometry(17.4, 2.8, 4), winMat);
  bWin.position.set(0, 27.5, -28.5);
  g.add(bWin);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 9, 10), redBottom);
  funnel.position.set(0, 32, -37);
  g.add(funnel);

  // Stacked colorful shipping containers
  const palette = ['#c0392b', '#2980b9', '#d35400', '#16a085', '#e67e22', '#2c3e50', '#b7950b'];
  const cMats = palette.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.2 }));
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const stackH = 2 + Math.floor(rng() * 3);
      for (let h = 0; h < stackH; h++) {
        const cMesh = new THREE.Mesh(
          new THREE.BoxGeometry(5.2, 3.2, 11.4),
          cMats[Math.floor(rng() * cMats.length)]
        );
        cMesh.position.set((col - 1) * 5.8, 14.2 + h * 3.3, -18 + row * 12.6);
        g.add(cMesh);
      }
    }
  }
  return g;
}

// Build Iconic Striped Stone Lighthouse with Rotating Volumetric Beam (for Tempest Harbor)
function createLighthouse() {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: '#454e54', roughness: 0.92, flatShading: true });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#f0f3f5', roughness: 0.5 });
  const redMat = new THREE.MeshStandardMaterial({ color: '#cc2929', roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1b2229', roughness: 0.4, metalness: 0.6 });

  // Rocky islet base
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(26, 1), rockMat);
  base.scale.set(1.2, 0.55, 1.1);
  base.position.y = 4;
  g.add(base);

  // Striped tapered tower (5 alternating bands)
  const bands = 5;
  const totalH = 44;
  const bh = totalH / bands;
  for (let i = 0; i < bands; i++) {
    const r0 = 7.4 - i * 0.72;
    const r1 = 7.4 - (i + 1) * 0.72;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, bh + 0.05, 18),
      i % 2 === 0 ? whiteMat : redMat
    );
    seg.position.y = 12 + i * bh + bh * 0.5;
    seg.castShadow = true;
    g.add(seg);
  }

  // Gallery deck + lantern room + dome
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.6, 1.8, 18), darkMat);
  gallery.position.y = 56.5;
  g.add(gallery);

  const lanternMat = new THREE.MeshBasicMaterial({ color: '#fff3b0' });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 5.2, 16), lanternMat);
  lantern.position.y = 59.8;
  g.add(lantern);

  const dome = new THREE.Mesh(new THREE.ConeGeometry(4.2, 5.0, 16), redMat);
  dome.position.y = 64.8;
  g.add(dome);

  // Rotating Twin Volumetric Light Beams!
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 60.0;
  g.add(beamPivot);

  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ffe89a',
    transparent: true,
    opacity: 0.26,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (const dir of [-1, 1]) {
    const coneGeo = new THREE.ConeGeometry(28, 220, 20, 1, true);
    coneGeo.translate(0, -110, 0);
    coneGeo.rotateX(Math.PI * 0.5);
    const beam = new THREE.Mesh(coneGeo, beamMat);
    beam.rotation.y = dir > 0 ? 0 : Math.PI;
    beamPivot.add(beam);
  }

  return { group: g, beamPivot };
}

// Build Course Elements: Start/Finish Arch, Red/Yellow Slalom Buoys, Floating Jump Ramps
function buildCourseObjects(course, worldGroup) {
  const animated = {
    buoys: [],
    ramps: [],
  };

  // ---- 1. Start / Finish Floating Marina Gantry Arch
  const start = sampleCourse(course, 0);
  const arch = new THREE.Group();
  arch.position.set(start.x, 0, start.z);
  arch.rotation.y = start.heading;
  worldGroup.add(arch);

  const archSpan = course.width * 0.88;
  const pontoonMat = new THREE.MeshStandardMaterial({ color: '#223244', roughness: 0.55, metalness: 0.35 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#e6edf5', roughness: 0.25, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: '#00d8f5', emissive: '#00a8c8', emissiveIntensity: 0.8 });

  for (const s of [-1, 1]) {
    const px = s * (archSpan * 0.5);
    const floatBase = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 9.0), pontoonMat);
    floatBase.position.set(px, 0.2, 0);
    arch.add(floatBase);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 16.5, 10), pillarMat);
    pillar.position.set(px, 8.5, 0);
    pillar.castShadow = true;
    arch.add(pillar);

    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 13, 0.45), accentMat);
    lightBar.position.set(px - s * 0.72, 8.5, 0);
    arch.add(lightBar);
  }

  const bannerTex = createBannerTexture(course.venue.name);
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(archSpan + 1.5, 3.6, 1.1),
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.4, metalness: 0.1 })
  );
  banner.position.set(0, 15.6, 0);
  arch.add(banner);

  // ---- 2. Red / Yellow Slalom Buoys with Floating Directional Chevrons!
  // RED = Pass on RIGHT (▶), YELLOW = Pass on LEFT (◀)
  const redMat = new THREE.MeshPhysicalMaterial({
    color: '#ff2b2b',
    emissive: '#7a0a0a',
    emissiveIntensity: 0.45,
    roughness: 0.2,
    clearcoat: 0.8,
  });
  const yellowMat = new THREE.MeshPhysicalMaterial({
    color: '#ffd000',
    emissive: '#7a5c00',
    emissiveIntensity: 0.45,
    roughness: 0.2,
    clearcoat: 0.8,
  });
  const whiteBand = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
  const darkBase = new THREE.MeshStandardMaterial({ color: '#1b242d', roughness: 0.7 });

  const chevronGeo = new THREE.ConeGeometry(0.95, 1.85, 4);
  chevronGeo.rotateZ(-Math.PI * 0.5); // points +X (right in buoy local space if rotated correctly)

  for (const b of course.buoys) {
    const isRed = b.side === 'right';
    const bg = new THREE.Group();
    bg.position.set(b.x, 0, b.z);
    bg.rotation.y = b.heading;

    const bMat = isRed ? redMat : yellowMat;
    // Wide floating buoy collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 1.0, 14), bMat);
    collar.position.y = 0.2;
    bg.add(collar);

    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.2, 1.2, 14), darkBase);
    skirt.position.y = -0.6;
    bg.add(skirt);

    // Tall high-visibility racing cone spar
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 4.4, 14), bMat);
    cone.position.y = 2.7;
    cone.castShadow = true;
    bg.add(cone);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.96, 0.85, 14), whiteBand);
    stripe.position.y = 2.4;
    bg.add(stripe);

    // Glowing floating directional arrow chevron showing WHICH SIDE to pass!
    // In local space (+Z is course forward, +X is course LEFT because heading=atan2(tx,tz) puts local +X = (tz, -tx) = -right!)
    // Let's verify: local +Z = (sin h, cos h) = (tx, tz).
    // Local +X = (cos h, -sin h) = (tz, -tx) = -( -tz, tx ) = -right!
    // So course RIGHT is local -X, and course LEFT is local +X!
    const arrowMat = new THREE.MeshBasicMaterial({
      color: isRed ? '#ff4444' : '#ffe033',
      transparent: true,
      opacity: 0.92,
    });
    const arrow = new THREE.Mesh(chevronGeo, arrowMat);
    arrow.position.set(isRed ? -2.2 : 2.2, 4.2, 0);
    arrow.rotation.y = isRed ? Math.PI : 0; // points along local -X (course RIGHT) for RED, local +X (course LEFT) for YELLOW!
    bg.add(arrow);

    // Subtle target halo ring (illuminates brighter when this buoy is the player's next slalom target)
    const ringMat = new THREE.MeshBasicMaterial({
      color: isRed ? '#ff5555' : '#ffee55',
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.65, 24), ringMat);
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.y = 0.45;
    bg.add(ring);

    worldGroup.add(bg);
    animated.buoys.push({ data: b, mesh: bg, arrow, ring, ringMat });
  }

  // ---- 3. Floating Checkered Jump Ramps!
  const checkerTex = createCheckerTexture('#ff9500', '#161b22', 6);
  const rampTopMat = new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.45, metalness: 0.15 });
  const rampSideMat = new THREE.MeshStandardMaterial({ color: '#ff5500', roughness: 0.35, metalness: 0.25 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#38f8ff' });

  for (const r of course.ramps) {
    const rg = new THREE.Group();
    rg.position.set(r.x, 0, r.z);
    rg.rotation.y = r.heading;

    const L = r.length;
    const W = r.width;
    const H = r.height;

    // Wedge ramp geometry (slopes smoothly up from z = -L/2 at y = -0.35 to z = +L/2 at y = H)
    const shape = new THREE.Shape();
    shape.moveTo(-L * 0.5, -0.45);
    shape.lineTo(L * 0.5, -0.45);
    shape.lineTo(L * 0.5, H);
    shape.lineTo(-L * 0.5, 0.12);
    shape.closePath();

    const extrude = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
    // Shape X is along ramp Z, Shape Y is Y, Extrude Z is along ramp X
    extrude.translate(0, 0, -W * 0.5);
    extrude.rotateY(-Math.PI * 0.5); // maps Shape +X -> local +Z!
    const wedge = new THREE.Mesh(extrude, rampSideMat);
    wedge.castShadow = true;
    wedge.receiveShadow = true;
    rg.add(wedge);

    // Checkered inclined riding deck surface
    const slopeLen = Math.hypot(L, H - 0.12);
    const slopeAng = Math.atan2(H - 0.12, L);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.16, slopeLen), rampTopMat);
    deck.position.set(0, (H + 0.12) * 0.5 + 0.04, 0);
    deck.rotation.x = -slopeAng;
    rg.add(deck);

    // Side buoyant pontoons + glowing launch edge beacons
    for (const s of [-1, 1]) {
      const floatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, L + 1.2, 10), pontoonMat);
      floatTube.rotation.x = Math.PI * 0.5;
      floatTube.position.set(s * (W * 0.5 + 0.45), -0.1, 0);
      rg.add(floatTube);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.8, 8), beaconMat);
      post.position.set(s * (W * 0.5 + 0.25), H + 0.8, L * 0.46);
      rg.add(post);
    }

    worldGroup.add(rg);
    animated.ramps.push({ data: r, mesh: rg });
  }

  // ---- 4. Subtle Course Corridor Perimeter Guide Floats
  const guideMat = new THREE.MeshBasicMaterial({ color: '#9cf6ff', transparent: true, opacity: 0.72 });
  const guideGeo = new THREE.SphereGeometry(0.62, 8, 6);
  const guideCount = 34;
  const guideFloats = [];
  for (let i = 0; i < guideCount; i++) {
    const s = (i / guideCount) * course.totalLen;
    const sp = sampleCourse(course, s);
    for (const side of [-1, 1]) {
      const lat = side * (course.width * 0.68);
      const gx = sp.x + sp.rx * lat;
      const gz = sp.z + sp.rz * lat;
      const m = new THREE.Mesh(guideGeo, guideMat);
      m.position.set(gx, 0.2, gz);
      worldGroup.add(m);
      guideFloats.push({ mesh: m, x: gx, z: gz });
    }
  }
  animated.guideFloats = guideFloats;

  return animated;
}

// Build Full Photoreal 3D Venue + Mirror Reflection Group!
export function buildVenueWorld(course, scene, sceneApi) {
  const venue = course.venue;
  const tex = getTextures();
  const rng = mulberry32(venue.id === 'azure' ? 101 : venue.id === 'fjord' ? 202 : 303);

  const worldGroup = new THREE.Group();
  const reflGroup = new THREE.Group();
  const palms = [];
  const waterfalls = [];
  const icebergs = [];
  const yachts = [];
  let lighthouse = null;

  // Helper: add landmark to BOTH main scene and planar reflection group
  const addReflected = (mesh) => {
    worldGroup.add(mesh);
    const clone = mesh.clone();
    reflGroup.add(clone);
  };

  // Helper: find safe landmark position guaranteed outside the course corridor
  const placeOutsideCourse = (x, z, minClearance) => minCourseDist(course, x, z) >= minClearance;

  if (venue.id === 'azure') {
    // ========================================================
    // VENUE 1: AZURE ATOLL — Volcanic Peaks, Palm Islets, Yachts, Coral Heads
    // ========================================================
    const volcMat = new THREE.MeshStandardMaterial({
      map: tex.grassDiff,
      normalMap: tex.rockNor,
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.88,
    });
    const sandMat = new THREE.MeshStandardMaterial({
      map: tex.sandDiff,
      normalMap: tex.sandNor,
      color: '#f2e0ba',
      roughness: 0.84,
    });

    // Dramatic volcanic peaks framing the lagoon & center atoll
    const peaks = [
      [165, -20, 72, 118],
      [-235, -220, 125, 195],
      [480, -420, 140, 225],
      [620, 80, 130, 185],
      [380, 560, 145, 210],
      [-180, 480, 120, 175],
      [-340, 120, 110, 160],
      [180, -580, 150, 215],
    ];
    for (let i = 0; i < peaks.length; i++) {
      const [px, pz, rad, h] = peaks[i];
      if (!placeOutsideCourse(px, pz, rad + 26)) continue;
      // Sandy beach ring around volcanic island base
      const beach = new THREE.Mesh(
        new THREE.CylinderGeometry(rad * 0.92, rad * 1.18, 5.5, 24),
        sandMat
      );
      beach.position.set(px, 0.4, pz);
      addReflected(beach);

      const peak = createMountainMesh(rad * 0.9, h, i * 1.9 + 0.5, volcMat, 1.15, 'volcanic');
      peak.position.set(px, 0, pz);
      addReflected(peak);

      // Ring of swaying tropical palms on the sandy beach
      const palmN = i === 0 ? 10 : 6;
      for (let k = 0; k < palmN; k++) {
        const a = (k / palmN) * Math.PI * 2 + rng() * 0.4;
        const r = rad * (0.86 + rng() * 0.14);
        const palm = createPalmTree(rng);
        palm.group.position.set(px + Math.cos(a) * r, 2.2, pz + Math.sin(a) * r);
        worldGroup.add(palm.group);
        palms.push(palm);
      }
    }

    // Small sandy palm cays near the lagoon bends
    const cays = [
      [140, -175, 26],
      [145, 170, 28],
      [-125, -80, 30],
      [455, -205, 34],
      [165, 230, 24],
    ];
    for (const [cx, cz, rad] of cays) {
      if (!placeOutsideCourse(cx, cz, rad + 28)) continue;
      const cay = new THREE.Mesh(new THREE.SphereGeometry(rad, 18, 10), sandMat);
      cay.scale.set(1.0, 0.16, 0.88);
      cay.position.set(cx, 0.8, cz);
      addReflected(cay);
      for (let k = 0; k < 4; k++) {
        const a = rng() * Math.PI * 2;
        const r = rad * 0.45 * rng();
        const palm = createPalmTree(rng);
        palm.group.position.set(cx + Math.cos(a) * r, 2.2, cz + Math.sin(a) * r);
        worldGroup.add(palm.group);
        palms.push(palm);
      }
    }

    // Anchored Luxury White Motor Yachts bobbing gently around the lagoon!
    const yachtSpots = [
      [85, -80, 0.6],
      [255, -180, -0.9],
      [195, 105, 2.1],
      [-95, 60, 0.25],
      [395, 165, -1.8],
      [115, -260, 1.3],
    ];
    for (const [yx, yz, rot] of yachtSpots) {
      if (!placeOutsideCourse(yx, yz, 34)) continue;
      const yacht = createLuxuryYacht(rng);
      yacht.position.set(yx, 0, yz);
      yacht.rotation.y = rot;
      addReflected(yacht);
      yachts.push({ mesh: yacht, x: yx, z: yz, baseRot: rot });
    }
  } else if (venue.id === 'fjord') {
    // ========================================================
    // VENUE 2: NORDIC FJORD — Sheer Granite Cliffs, Waterfalls, Glowing Icebergs, Pines
    // ========================================================
    const cliffMat = new THREE.MeshStandardMaterial({
      map: tex.rockDiff,
      normalMap: tex.rockNor,
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.86,
    });

    const cliffs = [
      [175, -15, 78, 175, true],
      [-230, -180, 130, 260, true],
      [140, -560, 155, 285, true],
      [560, -340, 145, 265, false],
      [590, 60, 140, 240, true],
      [480, 460, 150, 255, false],
      [40, 540, 145, 245, true],
      [-260, 310, 135, 235, false],
      [-290, 40, 120, 220, true],
    ];
    for (let i = 0; i < cliffs.length; i++) {
      const [cx, cz, rad, h, hasFall] = cliffs[i];
      if (!placeOutsideCourse(cx, cz, rad + 28)) continue;
      const cliff = createMountainMesh(rad, h, i * 2.3 + 1.1, cliffMat, 0.72, 'fjord');
      cliff.position.set(cx, 0, cz);
      addReflected(cliff);

      // Cascading animated waterfall plunging toward course center!
      if (hasFall) {
        const wf = createWaterfall(h * 0.62, 11 + rng() * 6);
        const dirToCenter = Math.atan2(170 - cx, 0 - cz);
        wf.group.position.set(
          cx + Math.sin(dirToCenter) * rad * 0.72,
          0,
          cz + Math.cos(dirToCenter) * rad * 0.72
        );
        wf.group.rotation.y = dirToCenter;
        worldGroup.add(wf.group);
        waterfalls.push(wf);
      }

      // Pine forest cluster along rocky ledges
      const pineCount = Math.round(7 * (PERF.sceneryDensity || 0.9));
      for (let k = 0; k < pineCount; k++) {
        const a = rng() * Math.PI * 2;
        const r = rad * (0.76 + rng() * 0.16);
        const pine = createPineTree(1.0 + rng() * 0.8);
        pine.position.set(cx + Math.cos(a) * r, 4 + rng() * 14, cz + Math.sin(a) * r);
        worldGroup.add(pine);
      }
    }

    // Glowing Translucent Cyan Icebergs & Drift Floes!
    const bergSpots = [
      [120, -210, 15, 22],
      [250, -195, 18, 28],
      [180, 165, 16, 24],
      [-105, -60, 17, 25],
      [475, -180, 22, 34],
      [445, 245, 20, 30],
      [60, 240, 14, 20],
      [-110, 210, 18, 26],
      [295, -45, 12, 16],
    ];
    for (let i = 0; i < bergSpots.length; i++) {
      const [bx, bz, rad, h] = bergSpots[i];
      if (!placeOutsideCourse(bx, bz, rad + 26)) continue;
      const berg = createIceberg(rad, h, i * 3.1);
      berg.position.set(bx, 1.5, bz);
      addReflected(berg);
      icebergs.push({ mesh: berg, x: bx, z: bz, phase: i * 1.2 });
    }
  } else {
    // ========================================================
    // VENUE 3: TEMPEST HARBOR — Cargo Ships, Lighthouse w/ Rotating Beam, Breakwaters
    // ========================================================
    const stoneMat = new THREE.MeshStandardMaterial({
      map: tex.rockDiff,
      normalMap: tex.rockNor,
      color: '#5c666e',
      roughness: 0.9,
    });
    const steelMat = new THREE.MeshStandardMaterial({ color: '#c45628', roughness: 0.55, metalness: 0.45 });

    // Iconic Lighthouse with Rotating Volumetric Beam on central rocky promontory!
    lighthouse = createLighthouse();
    lighthouse.group.position.set(178, 0, -25);
    addReflected(lighthouse.group);

    // Massive Container Cargo Ships anchored around the shipping channel
    const shipSpots = [
      [165, -245, 0.35],
      [535, -140, 0.05],
      [225, 215, 1.35],
      [-175, 40, -0.18],
      [385, -445, 1.15],
      [-165, -280, -0.65],
    ];
    for (const [sx, sz, rot] of shipSpots) {
      if (!placeOutsideCourse(sx, sz, 56)) continue;
      const ship = createCargoShip(rng);
      ship.position.set(sx, 0, sz);
      ship.rotation.y = rot;
      addReflected(ship);
      yachts.push({ mesh: ship, x: sx, z: sz, baseRot: rot, heavy: true });
    }

    // Rugged Stone Breakwaters & Harbor Seawalls
    const breakwaters = [
      [-145, -135, 18, 120, 0.1],
      [155, 485, 165, 22, 0.08],
      [525, 180, 22, 165, -0.22],
      [160, -515, 180, 22, -0.06],
    ];
    for (const [bx, bz, w, d, rot] of breakwaters) {
      if (!placeOutsideCourse(bx, bz, 44)) continue;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 12, d), stoneMat);
      wall.position.set(bx, 3.8, bz);
      wall.rotation.y = rot;
      wall.castShadow = true;
      wall.receiveShadow = true;
      addReflected(wall);

      // Harbor industrial gantry crane on breakwater
      if (w > 100 || d > 100) {
        const crane = new THREE.Group();
        crane.position.set(bx, 9.8, bz);
        crane.rotation.y = rot;
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 26, 2.2), steelMat);
        leg1.position.set(-5, 13, 0);
        const leg2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 26, 2.2), steelMat);
        leg2.position.set(5, 13, 0);
        const boom = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 2.4), steelMat);
        boom.position.set(6, 25, 0);
        crane.add(leg1, leg2, boom);
        addReflected(crane);
      }
    }

    // Distant moody coastal headlands
    const headlandMat = new THREE.MeshStandardMaterial({
      map: tex.rockDiff,
      normalMap: tex.rockNor,
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.9,
    });
    const headlands = [
      [-390, -340, 145, 145],
      [680, -360, 160, 160],
      [640, 480, 150, 140],
      [-360, 440, 140, 135],
    ];
    for (let i = 0; i < headlands.length; i++) {
      const [hx, hz, rad, h] = headlands[i];
      const m = createMountainMesh(rad, h, i * 4.1, headlandMat, 1.0, 'harbor');
      m.position.set(hx, 0, hz);
      addReflected(m);
    }
  }

  const courseAnim = buildCourseObjects(course, worldGroup);

  scene.add(worldGroup);
  sceneApi.setReflectionGroup(reflGroup);

  const _wSample = { y: 0, nx: 0, ny: 1, nz: 0, vy: 0, crest: 0 };

  return {
    worldGroup,
    reflGroup,
    update(dt, time, nextBuoyId = -1) {
      // Animate swaying palms
      for (const p of palms) {
        p.crown.rotation.z = Math.sin(time * 1.45 + p.phase) * 0.09;
        p.crown.rotation.x = Math.cos(time * 1.15 + p.phase) * 0.06;
      }
      // Animate waterfalls
      for (const wf of waterfalls) {
        wf.mat.uniforms.uTime.value = time;
      }
      // Animate rotating lighthouse beam!
      if (lighthouse) {
        lighthouse.beamPivot.rotation.y = time * 0.65;
      }
      // Gentle bobbing for anchored yachts / ships
      for (const y of yachts) {
        const wy = sampleOceanHeight(y.x, y.z, time);
        const scale = y.heavy ? 0.28 : 0.62;
        y.mesh.position.y = wy * scale;
        y.mesh.rotation.z = Math.sin(time * 1.1 + y.x * 0.05) * (y.heavy ? 0.015 : 0.045);
        y.mesh.rotation.x = Math.cos(time * 0.85 + y.z * 0.05) * (y.heavy ? 0.01 : 0.03);
      }
      // Gentle bobbing for floating icebergs
      for (const b of icebergs) {
        const wy = sampleOceanHeight(b.x, b.z, time);
        b.mesh.position.y = 1.4 + wy * 0.35;
        b.mesh.rotation.z = Math.sin(time * 0.65 + b.phase) * 0.025;
      }
      // Synchronized Gerstner wave bobbing & tilting for ALL Slalom Buoys!
      for (const b of courseAnim.buoys) {
        sampleOcean(b.data.x, b.data.z, _wSample, time);
        b.mesh.position.y = _wSample.y;
        b.mesh.rotation.z = -_wSample.nx * 0.55;
        b.mesh.rotation.x = _wSample.nz * 0.55;
        // Bob arrow & pulse ring on the player's next upcoming buoy
        const isNext = b.data.id === nextBuoyId;
        b.arrow.position.y = 4.2 + Math.sin(time * 4.5 + b.data.id) * 0.32;
        b.arrow.scale.setScalar(isNext ? 1.38 + Math.sin(time * 7) * 0.14 : 1.0);
        b.ringMat.opacity = isNext ? 0.72 + Math.sin(time * 7) * 0.2 : 0.2;
        b.ring.scale.setScalar(isNext ? 1.25 + Math.sin(time * 6) * 0.12 : 1.0);
      }
      // Synchronized Gerstner wave bobbing for Floating Jump Ramps!
      for (const r of courseAnim.ramps) {
        sampleOcean(r.data.x, r.data.z, _wSample, time);
        r.mesh.position.y = _wSample.y * 0.75;
        r.mesh.rotation.z = -_wSample.nx * 0.22;
        r.mesh.rotation.x = _wSample.nz * 0.22;
      }
      // Guide floats
      for (const f of courseAnim.guideFloats) {
        f.mesh.position.y = sampleOceanHeight(f.x, f.z, time) + 0.18;
      }
    },
    dispose() {
      scene.remove(worldGroup);
      sceneApi.setReflectionGroup(null);
      worldGroup.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
    },
  };
}
