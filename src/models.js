// Procedural Photoreal PBR 3D Jet Ski & Sculpted Athletic Stunt Rider Builder.
// Features contoured fiberglass clearcoat hulls, 4 distinct silhouettes,
// articulated two-segment arms gripping the chrome handlebars, bent-knee stance,
// and live animated poses for all 4 mid-air stunts (Superman, 360 Spin, Backflip, Grab).

import * as THREE from 'three';

function createHullGeometry(style) {
  const lenScale =
    style === 'bullet' ? 1.12 : style === 'freestyle' ? 0.94 : style === 'offshore' ? 1.07 : 1.0;
  const widScale = style === 'offshore' ? 1.10 : style === 'bullet' ? 0.94 : 1.0;

  // [z, halfWidth, bottomY, chineY, deckY, crownY]
  const slices = [
    [-1.68, 0.54, -0.14, 0.08, 0.31, 0.36],
    [-1.15, 0.63, -0.20, 0.08, 0.39, 0.46],
    [-0.30, 0.66, -0.23, 0.10, 0.43, 0.54],
    [0.52,  0.59, -0.19, 0.14, 0.46, 0.62],
    [1.14,  0.40, -0.09, 0.19, 0.42, 0.52],
    [1.58,  0.18,  0.03, 0.23, 0.35, 0.40],
    [1.90,  0.02,  0.15, 0.24, 0.29, 0.30],
  ];

  const positions = [];
  const indices = [];
  const ringPts = 7;

  for (let i = 0; i < slices.length; i++) {
    const [zRaw, hwRaw, by, cy, dy, crY] = slices[i];
    const z = zRaw * lenScale;
    const hw = hwRaw * widScale;
    const ring = [
      [0, by, z],
      [-hw, cy, z],
      [-hw * 0.84, dy, z],
      [0, crY, z],
      [hw * 0.84, dy, z],
      [hw, cy, z],
      [0, by, z],
    ];
    for (const p of ring) positions.push(p[0], p[1], p[2]);
  }

  for (let i = 0; i < slices.length - 1; i++) {
    const r0 = i * ringPts;
    const r1 = (i + 1) * ringPts;
    for (let j = 0; j < ringPts - 1; j++) {
      const a = r0 + j;
      const b = r0 + j + 1;
      const c = r1 + j;
      const d = r1 + j + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }
  const centerIdx = positions.length / 3;
  positions.push(0, 0.12, -1.68 * lenScale);
  for (let j = 0; j < ringPts - 1; j++) {
    indices.push(centerIdx, j, j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createJetSkiMesh(spec) {
  const root = new THREE.Group();
  const craft = new THREE.Group();
  root.add(craft);

  const colors = spec.colors || {
    hull: spec.hull || '#0d9eb8',
    deck: spec.deck || '#f2f7fa',
    accent: spec.accent || '#ff5d3a',
    seat: '#161f29',
    stripe: spec.accent || '#22f0df',
    riderSuit: '#142030',
    riderTrim: spec.hull || '#00d4ff',
    helmet: spec.helmet || '#ff5d3a',
  };
  const style = spec.hullStyle || spec.style || 'sleek';

  const hullMat = new THREE.MeshPhysicalMaterial({
    color: colors.hull,
    roughness: 0.14,
    metalness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
  const deckMat = new THREE.MeshPhysicalMaterial({
    color: colors.deck,
    roughness: 0.16,
    metalness: 0.14,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08,
  });
  const accentMat = new THREE.MeshPhysicalMaterial({
    color: colors.accent,
    roughness: 0.2,
    metalness: 0.35,
    clearcoat: 0.9,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: colors.seat || '#141a22',
    roughness: 0.85,
    metalness: 0.04,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#e0ecf5',
    roughness: 0.1,
    metalness: 0.95,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#071422',
    roughness: 0.04,
    metalness: 0.3,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.86,
  });

  // ---- Main Sculpted Fiberglass Hull
  const hull = new THREE.Mesh(createHullGeometry(style), hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  craft.add(hull);

  // ---- Sculpted Rounded Aero Upper Cowling
  const cowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.40, 1.05, 8, 14), deckMat);
  cowl.rotation.x = Math.PI * 0.5 + 0.14;
  cowl.scale.set(1.16, 1.0, 0.55);
  cowl.position.set(0, 0.50, 0.68);
  cowl.castShadow = true;
  craft.add(cowl);

  // Forward fairing nacelle around steering column
  const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 6, 12), deckMat);
  nacelle.rotation.x = 0.55;
  nacelle.scale.set(1.25, 1.0, 0.72);
  nacelle.position.set(0, 0.68, 0.52);
  craft.add(nacelle);

  // Racing side stripes, integrated bumper rub-rails & aero mirrors
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 2.05, 4, 8), accentMat);
    rail.rotation.x = Math.PI * 0.5;
    rail.position.set(s * 0.63, 0.22, -0.15);
    craft.add(rail);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 1.55), accentMat);
    stripe.position.set(s * 0.47, 0.48, 0.42);
    stripe.rotation.y = -s * 0.12;
    craft.add(stripe);

    const mirror = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.12, 4, 8), accentMat);
    mirror.rotation.x = Math.PI * 0.5;
    mirror.position.set(s * 0.42, 0.66, 0.64);
    craft.add(mirror);
  }

  // Curved tinted aero windscreen
  const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.36, 14, 1, true, -Math.PI * 0.36, Math.PI * 0.72), glassMat);
  screen.position.set(0, 0.74, 0.56);
  screen.rotation.x = -0.58;
  craft.add(screen);

  // Contoured bolstered racing seat + rear grab wing
  const seatMain = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 1.05, 6, 12), seatMat);
  seatMain.rotation.x = Math.PI * 0.5;
  seatMain.scale.set(1.08, 1.0, 0.78);
  seatMain.position.set(0, 0.54, -0.56);
  seatMain.castShadow = true;
  craft.add(seatMain);

  const seatBolster = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.26, 6, 10), seatMat);
  seatBolster.rotation.z = Math.PI * 0.5;
  seatBolster.position.set(0, 0.62, -1.06);
  craft.add(seatBolster);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.22), accentMat);
  tailWing.position.set(0, 0.58, -1.36);
  craft.add(tailWing);

  // ---- Steering Column & Swept Chrome Handlebars
  const steerPivot = new THREE.Group();
  steerPivot.position.set(0, 0.74, 0.36);
  craft.add(steerPivot);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.26, 10), seatMat);
  stem.rotation.x = -0.32;
  steerPivot.add(stem);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.80, 10), chromeMat);
  bar.rotation.z = Math.PI * 0.5;
  bar.position.set(0, 0.13, -0.06);
  steerPivot.add(bar);

  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 10), seatMat);
    grip.rotation.z = Math.PI * 0.5;
    grip.position.set(s * 0.35, 0.13, -0.06);
    steerPivot.add(grip);
  }

  // ---- Rear Hydro-Jet Nozzle & Glowing Nitro Ring
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.34, 14), chromeMat);
  nozzle.rotation.x = Math.PI * 0.5;
  nozzle.position.set(0, 0.12, -1.74);
  craft.add(nozzle);

  const nitroRingMat = new THREE.MeshBasicMaterial({
    color: '#22f6ff',
    transparent: true,
    opacity: 0.28,
  });
  const nitroRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.034, 8, 18), nitroRingMat);
  nitroRing.position.set(0, 0.12, -1.89);
  craft.add(nitroRing);

  // ---- Sculpted Athletic Rider (properly crouched & gripping the handlebars!)
  const rider = new THREE.Group();
  rider.position.set(0, 0.64, -0.46);
  craft.add(rider);

  const suitMat = new THREE.MeshStandardMaterial({
    color: colors.riderSuit || '#132032',
    roughness: 0.65,
    metalness: 0.08,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: colors.riderTrim || colors.hull,
    roughness: 0.42,
    metalness: 0.14,
  });
  const helmetMat = new THREE.MeshPhysicalMaterial({
    color: colors.helmet || '#ff5d3a',
    roughness: 0.12,
    metalness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: '#091524',
    roughness: 0.04,
    metalness: 0.88,
    clearcoat: 1.0,
  });

  // Pelvis / seated hips
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.16, 6, 10), suitMat);
  hips.rotation.z = Math.PI * 0.5;
  hips.position.set(0, 0.08, -0.02);
  rider.add(hips);

  // Athletic forward-leaning torso + PFD life vest
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.12, 0.0);
  rider.add(torsoPivot);

  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.28, 6, 12), vestMat);
  chest.scale.set(1.16, 1.0, 0.72);
  chest.position.set(0, 0.28, 0.12);
  chest.rotation.x = 0.42;
  chest.castShadow = true;
  torsoPivot.add(chest);

  // Broad wetsuit shoulders
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 6, 10), suitMat);
  shoulders.rotation.z = Math.PI * 0.5;
  shoulders.position.set(0, 0.46, 0.20);
  torsoPivot.add(shoulders);

  // Aero Full-Face Marine Helmet + Reflective Visor
  const head = new THREE.Group();
  head.position.set(0, 0.64, 0.28);
  torsoPivot.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 18, 14), helmetMat);
  helmet.scale.set(0.94, 1.0, 1.15);
  helmet.castShadow = true;
  head.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.165, 0.095, 14, 1, true, -Math.PI * 0.35, Math.PI * 0.7),
    visorMat
  );
  visor.position.set(0, 0.01, 0.04);
  head.add(visor);

  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.12), helmetMat);
  chin.position.set(0, -0.08, 0.13);
  head.add(chin);

  // Two-segment Articulated Arms angled DOWN and FORWARD onto the handlebar grips!
  // Shoulder at (s*0.22, 0.45, 0.20) in torsoPivot -> Grip in rider space is approx (s*0.35, 0.23, 0.76)
  function buildArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.22, 0.45, 0.20);
    // Upper arm angled forward & down toward elbow
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.22, 5, 8), suitMat);
    upper.position.set(side * 0.06, -0.10, 0.15);
    upper.rotation.x = 1.98;
    upper.rotation.z = -side * 0.28;
    pivot.add(upper);

    // Forearm angling right onto the grip
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.24, 5, 8), suitMat);
    fore.position.set(side * 0.11, -0.20, 0.38);
    fore.rotation.x = 1.72;
    fore.rotation.z = -side * 0.14;
    pivot.add(fore);

    // Racing glove on grip
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), accentMat);
    glove.position.set(side * 0.13, -0.22, 0.54);
    pivot.add(glove);
    return pivot;
  }

  const armL = buildArm(-1);
  const armR = buildArm(1);
  torsoPivot.add(armL, armR);

  // Sculpted Bent-Knee Legs straddling the seat with boots in the footwells!
  const legsPivot = new THREE.Group();
  legsPivot.position.set(0, 0.06, 0.0);
  rider.add(legsPivot);

  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.28, 5, 8), suitMat);
    thigh.position.set(s * 0.24, -0.06, 0.14);
    thigh.rotation.x = 1.15;
    thigh.rotation.z = s * 0.18;
    legsPivot.add(thigh);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.28, 5, 8), suitMat);
    shin.position.set(s * 0.29, -0.28, 0.14);
    shin.rotation.x = -0.32;
    legsPivot.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.22), accentMat);
    boot.position.set(s * 0.30, -0.44, 0.14);
    legsPivot.add(boot);
  }

  return {
    root,
    craft,
    steerPivot,
    rider,
    torsoPivot,
    legsPivot,
    armL,
    armR,
    nitroRingMat,
    updatePose({ steer = 0, nitro = 0, stuntType = null, stuntProgress = 0, bob = 0 }) {
      steerPivot.rotation.y = -steer * 0.48;
      nitroRingMat.opacity = 0.24 + nitro * 0.76;
      nitroRingMat.color.setHex(nitro > 0.1 ? 0x38f8ff : 0x1688a8);

      let craftPitch = 0;
      let craftYaw = 0;
      let craftRoll = 0;
      let riderZ = -0.46;
      let riderY = 0.64 + bob;
      let torsoPitch = 0.0;
      let torsoRoll = -steer * 0.36;
      let legsPitch = 0.0;
      let armLPitch = 0;
      let armRPitch = 0;
      let armRRoll = 0;

      if (stuntType) {
        const p = Math.max(0, Math.min(1, stuntProgress));
        const bell = Math.sin(p * Math.PI);
        if (stuntType === 'superman') {
          riderZ = -0.46 - bell * 0.78;
          riderY = 0.64 + bell * 0.42;
          torsoPitch = -bell * 1.1;
          legsPitch = -bell * 1.48;
          armLPitch = bell * 0.55;
          armRPitch = bell * 0.55;
          craftPitch = -bell * 0.20;
        } else if (stuntType === 'spin360') {
          craftYaw = p * Math.PI * 2;
          craftRoll = bell * 0.24;
          armRPitch = -bell * 1.2;
          armRRoll = bell * 0.45;
        } else if (stuntType === 'backflip') {
          craftPitch = -p * Math.PI * 2;
          torsoPitch = -bell * 0.32;
        } else if (stuntType === 'grab') {
          craftYaw = bell * 0.62;
          craftRoll = bell * 0.58;
          torsoRoll = -bell * 0.55;
          armLPitch = bell * 0.75;
          armRPitch = -bell * 1.45;
          armRRoll = bell * 0.62;
        }
      }

      craft.rotation.set(craftPitch, craftYaw, craftRoll);
      rider.position.set(0, riderY, riderZ);
      torsoPivot.rotation.set(torsoPitch, 0, torsoRoll);
      legsPivot.rotation.set(legsPitch, 0, 0);
      armL.rotation.set(armLPitch, 0, 0);
      armR.rotation.set(armRPitch, 0, armRRoll);
    },
  };
}
