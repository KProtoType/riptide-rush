// Photoreal 3D Ocean Spray & Foam FX for Riptide Rush:
//  - Frothy noise-textured V-Wake Foam Ribbons synced accurately with 2-iteration Gerstner wave height
//  - Crisp multi-droplet sparkling sea-spray sprite (no blurry cotton balls!)
//  - Dynamic bow-chop spray + dramatic outer-chine carving spray sheets
//  - Compact, glistening Rooster-Tail hydro jet (turns blazing cyan-white on Hydro Nitro)
//  - Huge water-crown splashdowns & wake-spray bumping explosions

import * as THREE from 'three';
import { sampleOcean } from './waves.js';
import { getNoiseTex } from './scene.js';
import { PERF } from './perf.js';

// Crisp organic sea-spray droplet cluster texture (replaces flat fuzzy circle!)
function createSprayDropletTexture() {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 96, 96);

  // Subtle airy mist core
  const mist = g.createRadialGradient(48, 48, 2, 48, 48, 42);
  mist.addColorStop(0.0, 'rgba(255,255,255,0.68)');
  mist.addColorStop(0.42, 'rgba(225,248,255,0.34)');
  mist.addColorStop(0.82, 'rgba(180,235,255,0.08)');
  mist.addColorStop(1.0, 'rgba(180,235,255,0.0)');
  g.fillStyle = mist;
  g.fillRect(0, 0, 96, 96);

  // Crisp glistening water droplets scattered inside the spray puff
  const drops = [
    [48, 46, 9], [36, 40, 6], [60, 42, 6.5], [44, 58, 5.5], [56, 56, 5],
    [30, 52, 4], [66, 52, 4], [48, 30, 4.5], [38, 66, 3.5], [58, 30, 3.8],
    [26, 36, 2.8], [70, 38, 3.0], [50, 70, 3.0], [34, 28, 2.6], [64, 65, 2.8],
  ];
  for (const [x, y, r] of drops) {
    const dg = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 0.5, x, y, r);
    dg.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    dg.addColorStop(0.6, 'rgba(235,252,255,0.85)');
    dg.addColorStop(1.0, 'rgba(200,242,255,0.0)');
    g.fillStyle = dg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _wTmp = { y: 0, nx: 0, ny: 1, nz: 0, vy: 0, crest: 0 };

// Organic frothy foam wake ribbon conforming cleanly to exact Gerstner waves!
class WakeRibbon {
  constructor(scene, maxPoints = 46, isPlayer = false) {
    this.maxPoints = maxPoints;
    this.isPlayer = isPlayer;
    this.points = [];
    this.emitAccum = 0;
    this.uvScroll = 0;

    const vertCount = maxPoints * 2;
    this.positions = new Float32Array(vertCount * 3);
    this.alphas = new Float32Array(vertCount);
    this.uvs = new Float32Array(vertCount * 2);

    const indices = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    geo.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color('#f4fbff') },
        tNoise: { value: getNoiseTex() },
        uTime: { value: 0 },
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          vAlpha = aAlpha;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform sampler2D tNoise;
        uniform float uTime;
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          // Frothy lacy foam using multi-scale noise (never looks like a flat white plastic stripe!)
          float edge = abs(vUv.x - 0.5) * 2.0;
          float n1 = texture2D(tNoise, vec2(vUv.x * 2.2, vUv.y * 5.5 - uTime * 0.25)).r;
          float n2 = texture2D(tNoise, vec2(vUv.x * 5.2 + 0.3, vUv.y * 12.0 + uTime * 0.18)).g;
          float froth = smoothstep(0.22, 0.78, n1 * 0.62 + n2 * 0.52);

          // Twin V-wake crest arms + frothy turbulent prop-wash center
          float twin = smoothstep(0.18, 0.68, edge) * (1.0 - smoothstep(0.76, 1.0, edge));
          float center = (1.0 - smoothstep(0.0, 0.58, edge)) * 0.58;
          float shape = (twin * 1.05 + center) * froth;
          // Dissolve smoothly at outer edges & tail
          float alpha = shape * vAlpha * (1.0 - smoothstep(0.84, 1.0, edge));
          if (alpha < 0.015) discard;
          gl_FragColor = vec4(uColor, clamp(alpha * 0.88, 0.0, 0.88));
        }`,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.geo = geo;
    this.mat = mat;
  }

  reset() {
    this.points.length = 0;
    this.alphas.fill(0);
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  update(dt, time, racer) {
    this.mat.uniforms.uTime.value = time;
    const maxAge = this.isPlayer ? 2.1 : 1.5;

    for (let i = this.points.length - 1; i >= 0; i--) {
      this.points[i].age += dt;
      if (this.points[i].age > maxAge) {
        this.points.splice(i, 1);
      }
    }

    this.emitAccum += dt;
    const speed = racer.speed;
    const emitInterval = this.isPlayer ? 0.024 : 0.042;
    if (!racer.airborne && speed > 3.5 && this.emitAccum >= emitInterval) {
      this.emitAccum = 0;
      const fwdX = Math.sin(racer.heading);
      const fwdZ = Math.cos(racer.heading);
      const rightX = -fwdZ;
      const rightZ = fwdX;
      this.points.unshift({
        x: racer.x - fwdX * 1.45,
        z: racer.z - fwdZ * 1.45,
        rx: rightX,
        rz: rightZ,
        age: 0,
        intensity: Math.min(1.1, speed / 30.0) * (racer.nitroActive ? 1.35 : 1.0),
      });
      if (this.points.length > this.maxPoints) this.points.pop();
    }

    const count = this.points.length;
    for (let i = 0; i < this.maxPoints; i++) {
      const p = count > 0 ? this.points[Math.min(i, count - 1)] : null;
      const vi = i * 2;
      if (!p || i >= count) {
        this.alphas[vi] = 0;
        this.alphas[vi + 1] = 0;
        continue;
      }
      const life = Math.max(0, 1.0 - p.age / maxAge);
      const spread = 0.78 + p.age * 4.2;
      const lx = p.x - p.rx * spread;
      const lz = p.z - p.rz * spread;
      const rx = p.x + p.rx * spread;
      const rz = p.z + p.rz * spread;

      // Accurate 2-iteration Gerstner surface match so wake NEVER clips underwater!
      const ly = sampleOcean(lx, lz, _wTmp, time).y + 0.16;
      const ry = sampleOcean(rx, rz, _wTmp, time).y + 0.16;

      this.positions[vi * 3] = lx;
      this.positions[vi * 3 + 1] = ly;
      this.positions[vi * 3 + 2] = lz;

      this.positions[(vi + 1) * 3] = rx;
      this.positions[(vi + 1) * 3 + 1] = ry;
      this.positions[(vi + 1) * 3 + 2] = rz;

      const headFade = i === 0 ? 0.35 : i === 1 ? 0.75 : 1.0;
      const fade = life * life * p.intensity * headFade;
      this.alphas[vi] = fade;
      this.alphas[vi + 1] = fade;

      const v = i / (this.maxPoints - 1);
      this.uvs[vi * 2] = 0;
      this.uvs[vi * 2 + 1] = v;
      this.uvs[(vi + 1) * 2] = 1;
      this.uvs[(vi + 1) * 2 + 1] = v;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

export function createOceanFX(scene, racerCount = 8) {
  const MAX_PARTICLES = Math.round(1350 * (PERF.particles || 0.85));
  const posArr = new Float32Array(MAX_PARTICLES * 3);
  const colArr = new Float32Array(MAX_PARTICLES * 3);
  const sizeArr = new Float32Array(MAX_PARTICLES);
  const alphaArr = new Float32Array(MAX_PARTICLES);

  const particles = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0,
    y: -999,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    age: 99,
    maxAge: 1,
    size0: 1,
    size1: 2,
    r: 1,
    g: 1,
    b: 1,
    gravity: 16,
  }));
  let cursor = 0;

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(sizeArr, 1));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(alphaArr, 1));

  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      tSprite: { value: createSprayDropletTexture() },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Keep close-to-camera spray crisp rather than huge blurry blobs
        gl_PointSize = clamp(aSize * (270.0 / max(2.2, -mv.z)), 2.5, 68.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D tSprite;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(tSprite, gl_PointCoord);
        float a = t.a * vAlpha;
        if (a < 0.015) discard;
        gl_FragColor = vec4(vColor * t.rgb, a);
      }`,
  });

  const pointsMesh = new THREE.Points(pGeo, pMat);
  pointsMesh.frustumCulled = false;
  pointsMesh.renderOrder = 4;
  scene.add(pointsMesh);

  // Create noise-textured frothy wake ribbons for all racers
  const ribbons = Array.from({ length: racerCount }, (_, i) =>
    new WakeRibbon(scene, i === 0 ? 48 : 26, i === 0)
  );

  function spawnParticle({
    x,
    y,
    z,
    vx,
    vy,
    vz,
    maxAge = 0.55,
    size0 = 0.8,
    size1 = 2.4,
    r = 0.94,
    g = 0.99,
    b = 1.0,
    gravity = 19.0,
  }) {
    const p = particles[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.age = 0;
    p.maxAge = maxAge;
    p.size0 = size0;
    p.size1 = size1;
    p.r = r;
    p.g = g;
    p.b = b;
    p.gravity = gravity;
  }

  return {
    reset() {
      for (const rb of ribbons) rb.reset();
      for (const p of particles) p.age = 99;
    },

    spawnSplash(x, y, z, intensity = 1.0) {
      const count = Math.round(38 * intensity * (PERF.particles || 0.85));
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (4.0 + Math.random() * 12.5) * intensity;
        spawnParticle({
          x: x + Math.cos(ang) * 0.8,
          y: y + 0.25,
          z: z + Math.sin(ang) * 0.8,
          vx: Math.cos(ang) * spd,
          vy: (7.5 + Math.random() * 11.5) * intensity,
          vz: Math.sin(ang) * spd,
          maxAge: 0.45 + Math.random() * 0.42,
          size0: 1.0,
          size1: 3.4 * intensity,
          r: 0.94,
          g: 0.99,
          b: 1.0,
          gravity: 23.0,
        });
      }
    },

    spawnBumpSpray(x, y, z) {
      const count = Math.round(32 * (PERF.particles || 0.85));
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 4.5 + Math.random() * 11.0;
        spawnParticle({
          x,
          y: y + 0.35,
          z,
          vx: Math.cos(ang) * spd,
          vy: 5.5 + Math.random() * 9.5,
          vz: Math.sin(ang) * spd,
          maxAge: 0.38 + Math.random() * 0.32,
          size0: 0.9,
          size1: 2.9,
          r: 0.90,
          g: 0.98,
          b: 1.0,
          gravity: 21,
        });
      }
    },

    update(dt, time, racers) {
      const pMul = PERF.particles || 0.85;
      for (let idx = 0; idx < racers.length; idx++) {
        const r = racers[idx];
        if (ribbons[idx]) ribbons[idx].update(dt, time, r);

        const fwdX = Math.sin(r.heading);
        const fwdZ = Math.cos(r.heading);
        // True world right vector (fwd × up = (-fwdZ, fwdX))
        const rightX = -fwdZ;
        const rightZ = fwdX;

        if (!r.airborne && r.speed > 6) {
          // 1. Glistening Rooster-Tail Arc behind impeller!
          const tailCount =
            idx === 0 ? (r.nitroActive ? 5 : 3) : Math.random() < 0.6 * pMul ? 1 : 0;
          const tailX = r.x - fwdX * 1.9;
          const tailZ = r.z - fwdZ * 1.9;
          for (let k = 0; k < tailCount; k++) {
            const isNitro = r.nitroActive;
            const jetSpd = 7 + r.speed * 0.22 + Math.random() * 4;
            spawnParticle({
              x: tailX + (Math.random() - 0.5) * 0.28,
              y: r.y + 0.24 + Math.random() * 0.16,
              z: tailZ + (Math.random() - 0.5) * 0.28,
              vx: -fwdX * jetSpd + rightX * (Math.random() - 0.5) * 2.0,
              vy: 3.6 + r.speed * 0.08 + Math.random() * 2.2 + (isNitro ? 2.2 : 0),
              vz: -fwdZ * jetSpd + rightZ * (Math.random() - 0.5) * 2.0,
              maxAge: isNitro ? 0.44 : 0.36,
              size0: isNitro ? 1.05 : 0.72,
              size1: isNitro ? 2.8 : 2.1,
              r: isNitro ? 0.35 : 0.94,
              g: isNitro ? 0.97 : 0.99,
              b: 1.0,
              gravity: isNitro ? 14.0 : 21.0,
            });
          }

          // 2. Dynamic Twin Bow-Chop Spray throwing droplets out from hull bow!
          if (idx === 0 && r.speed > 18) {
            const bowX = r.x + fwdX * 1.25;
            const bowZ = r.z + fwdZ * 1.25;
            for (const side of [-1, 1]) {
              if (Math.random() < 0.75 * pMul) {
                const outSpd = 3.2 + r.speed * 0.10 + Math.random() * 2.5;
                spawnParticle({
                  x: bowX + rightX * side * 0.55,
                  y: r.y + 0.12,
                  z: bowZ + rightZ * side * 0.55,
                  vx: rightX * side * outSpd + fwdX * (r.speed * 0.32),
                  vy: 2.2 + r.speed * 0.055 + Math.random() * 1.8,
                  vz: rightZ * side * outSpd + fwdZ * (r.speed * 0.32),
                  maxAge: 0.30 + Math.random() * 0.18,
                  size0: 0.62,
                  size1: 1.95,
                  r: 0.94,
                  g: 0.99,
                  b: 1.0,
                  gravity: 22.0,
                });
              }
            }
          }

          // 3. Dramatic Sunlit Outer-Chine Carving Spray Sheets!
          const carve = Math.abs(r.steerSmooth || 0);
          if (r.speed > 13 && carve > 0.20) {
            // Turning right (steerSmooth > 0) pushes the LEFT (-right) chine hard into the water!
            const outerSide = r.steerSmooth > 0 ? -1 : 1;
            const count = idx === 0 ? 4 : Math.random() < 0.5 ? 1 : 0;
            for (let k = 0; k < count; k++) {
              const outSpd = 6.5 + carve * 11.5 + Math.random() * 3.5;
              spawnParticle({
                x: r.x + rightX * outerSide * 0.72 + fwdX * (Math.random() - 0.5) * 1.2,
                y: r.y + 0.16,
                z: r.z + rightZ * outerSide * 0.72 + fwdZ * (Math.random() - 0.5) * 1.2,
                vx: rightX * outerSide * outSpd + fwdX * (r.speed * 0.25),
                vy: 3.8 + carve * 5.8 + Math.random() * 2.4,
                vz: rightZ * outerSide * outSpd + fwdZ * (r.speed * 0.25),
                maxAge: 0.36 + Math.random() * 0.22,
                size0: 0.85,
                size1: 2.8,
                r: 0.93,
                g: 0.99,
                b: 1.0,
                gravity: 21.0,
              });
            }
          }
        } else if (r.airborne && r.nitroActive && idx === 0) {
          const tailX = r.x - fwdX * 1.9;
          const tailZ = r.z - fwdZ * 1.9;
          for (let k = 0; k < 3; k++) {
            spawnParticle({
              x: tailX,
              y: r.y + 0.14,
              z: tailZ,
              vx: -fwdX * 12 + (Math.random() - 0.5) * 1.5,
              vy: (Math.random() - 0.5) * 1.2,
              vz: -fwdZ * 12 + (Math.random() - 0.5) * 1.5,
              maxAge: 0.24,
              size0: 1.0,
              size1: 2.5,
              r: 0.28,
              g: 0.96,
              b: 1.0,
              gravity: 3.0,
            });
          }
        }
      }

      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i];
        if (p.age < p.maxAge) {
          p.age += dt;
          p.vy -= p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.vx *= 1 - dt * 1.3;
          p.vz *= 1 - dt * 1.3;

          const t = Math.min(1, p.age / p.maxAge);
          posArr[i * 3] = p.x;
          posArr[i * 3 + 1] = p.y;
          posArr[i * 3 + 2] = p.z;
          colArr[i * 3] = p.r;
          colArr[i * 3 + 1] = p.g;
          colArr[i * 3 + 2] = p.b;
          sizeArr[i] = p.size0 + (p.size1 - p.size0) * t;
          alphaArr[i] = Math.sin(t * Math.PI) * (1 - t * 0.25) * 0.88;
        } else {
          posArr[i * 3 + 1] = -999;
          alphaArr[i] = 0;
        }
      }

      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      pGeo.attributes.aSize.needsUpdate = true;
      pGeo.attributes.aAlpha.needsUpdate = true;
    },

    dispose() {
      scene.remove(pointsMesh);
      pGeo.dispose();
      pMat.dispose();
      for (const rb of ribbons) rb.dispose(scene);
    },
  };
}
