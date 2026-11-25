// 3D Ocean Effects for Riptide Rush:
//  - Gerstner-conforming foaming Wake Ribbons behind EVERY racer (player + 7 rivals)
//  - Rooster-Tail Hydro Jet Plume (turns electric cyan-white during Hydro Nitro!)
//  - High-performance pooled 3D Spray, Carve Sheet, Jump Splash & Wake-Bump Particles

import * as THREE from 'three';
import { sampleOceanHeight } from './waves.js';
import { PERF } from './perf.js';

function createSoftParticleTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.42, 'rgba(235,250,255,0.75)');
  grad.addColorStop(0.78, 'rgba(180,235,255,0.22)');
  grad.addColorStop(1.0, 'rgba(180,235,255,0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Single racer's continuous V-wake foam ribbon on the ocean surface
class WakeRibbon {
  constructor(scene, maxPoints = 34) {
    this.maxPoints = maxPoints;
    this.points = [];
    this.emitAccum = 0;

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
        uColor: { value: new THREE.Color('#eef9ff') },
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
        varying float vAlpha;
        varying vec2 vUv;
        void main() {
          // Dual V-wake edge foam bands + airy lacy center
          float edge = abs(vUv.x - 0.5) * 2.0;
          float twin = smoothstep(0.15, 0.72, edge) * (1.0 - smoothstep(0.78, 1.0, edge));
          float center = (1.0 - edge) * 0.45;
          float foam = (twin * 0.95 + center) * vAlpha;
          if (foam < 0.01) discard;
          gl_FragColor = vec4(uColor, clamp(foam * 0.78, 0.0, 0.85));
        }`,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.geo = geo;
  }

  reset() {
    this.points.length = 0;
    this.alphas.fill(0);
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  update(dt, time, racer) {
    // Age existing ribbon points
    for (let i = this.points.length - 1; i >= 0; i--) {
      this.points[i].age += dt;
      if (this.points[i].age > 1.7) {
        this.points.splice(i, 1);
      }
    }

    // Emit fresh wake sample when in water and moving
    this.emitAccum += dt;
    const speed = racer.speed;
    if (!racer.airborne && speed > 4.0 && this.emitAccum >= 0.045) {
      this.emitAccum = 0;
      const fwdX = Math.sin(racer.heading);
      const fwdZ = Math.cos(racer.heading);
      const rightX = Math.cos(racer.heading);
      const rightZ = -Math.sin(racer.heading);
      this.points.unshift({
        x: racer.x - fwdX * 1.5,
        z: racer.z - fwdZ * 1.5,
        rx: rightX,
        rz: rightZ,
        age: 0,
        intensity: Math.min(1.0, speed / 34.0) * (racer.nitroActive ? 1.35 : 1.0),
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
      const life = Math.max(0, 1.0 - p.age / 1.7);
      const spread = 0.72 + p.age * 3.8; // V-wake widens smoothly behind ski
      const lx = p.x - p.rx * spread;
      const lz = p.z - p.rz * spread;
      const rx = p.x + p.rx * spread;
      const rz = p.z + p.rz * spread;

      const ly = sampleOceanHeight(lx, lz, time) + 0.12;
      const ry = sampleOceanHeight(rx, rz, time) + 0.12;

      this.positions[vi * 3] = lx;
      this.positions[vi * 3 + 1] = ly;
      this.positions[vi * 3 + 2] = lz;

      this.positions[(vi + 1) * 3] = rx;
      this.positions[(vi + 1) * 3 + 1] = ry;
      this.positions[(vi + 1) * 3 + 2] = rz;

      const fade = life * life * p.intensity * (i === 0 ? 0.65 : 1.0);
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
    this.mesh.material.dispose();
  }
}

export function createOceanFX(scene, racerCount = 8) {
  const MAX_PARTICLES = Math.round(950 * (PERF.particles || 0.85));
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
      tSprite: { value: createSoftParticleTexture() },
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
        gl_PointSize = clamp(aSize * (320.0 / max(1.0, -mv.z)), 2.0, 110.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D tSprite;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(tSprite, gl_PointCoord);
        float a = t.a * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * t.rgb, a);
      }`,
  });

  const pointsMesh = new THREE.Points(pGeo, pMat);
  pointsMesh.frustumCulled = false;
  pointsMesh.renderOrder = 4;
  scene.add(pointsMesh);

  // Create wake ribbons for player + 7 rivals
  const ribbons = Array.from({ length: racerCount }, (_, i) =>
    new WakeRibbon(scene, i === 0 ? 38 : 24)
  );

  function spawnParticle({
    x,
    y,
    z,
    vx,
    vy,
    vz,
    maxAge = 0.6,
    size0 = 1.0,
    size1 = 3.2,
    r = 0.92,
    g = 0.98,
    b = 1.0,
    gravity = 16.0,
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

    // Huge dramatic water crown splash on jump landings or stunt bails
    spawnSplash(x, y, z, intensity = 1.0) {
      const count = Math.round(28 * intensity * (PERF.particles || 0.85));
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (3.5 + Math.random() * 11.5) * intensity;
        spawnParticle({
          x: x + Math.cos(ang) * 0.7,
          y: y + 0.25,
          z: z + Math.sin(ang) * 0.7,
          vx: Math.cos(ang) * spd,
          vy: (6.5 + Math.random() * 10.5) * intensity,
          vz: Math.sin(ang) * spd,
          maxAge: 0.45 + Math.random() * 0.45,
          size0: 1.4,
          size1: 4.8 * intensity,
          r: 0.92,
          g: 0.98,
          b: 1.0,
          gravity: 20.0,
        });
      }
    },

    // Wake-spray bumping collision burst between two skis
    spawnBumpSpray(x, y, z) {
      const count = Math.round(24 * (PERF.particles || 0.85));
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 4 + Math.random() * 10;
        spawnParticle({
          x,
          y: y + 0.4,
          z,
          vx: Math.cos(ang) * spd,
          vy: 5 + Math.random() * 9,
          vz: Math.sin(ang) * spd,
          maxAge: 0.4 + Math.random() * 0.35,
          size0: 1.2,
          size1: 4.0,
          r: 0.85,
          g: 0.97,
          b: 1.0,
          gravity: 18,
        });
      }
    },

    // Per-frame rooster-tail, carving spray sheets, Nitro plasma jet & wake ribbons
    update(dt, time, racers) {
      const pMul = PERF.particles || 0.85;
      for (let idx = 0; idx < racers.length; idx++) {
        const r = racers[idx];
        if (ribbons[idx]) ribbons[idx].update(dt, time, r);

        const fwdX = Math.sin(r.heading);
        const fwdZ = Math.cos(r.heading);
        const rightX = Math.cos(r.heading);
        const rightZ = -Math.sin(r.heading);

        // 1. Rooster-tail hydro jet behind impeller!
        if (!r.airborne && r.speed > 7) {
          const tailCount = idx === 0 ? (r.nitroActive ? 5 : 3) : Math.random() < 0.55 * pMul ? 1 : 0;
          const tailX = r.x - fwdX * 1.95;
          const tailZ = r.z - fwdZ * 1.95;
          for (let k = 0; k < tailCount; k++) {
            const jetSpd = 6 + r.speed * 0.28 + Math.random() * 4;
            const isNitro = r.nitroActive;
            spawnParticle({
              x: tailX + (Math.random() - 0.5) * 0.35,
              y: r.y + 0.25 + Math.random() * 0.25,
              z: tailZ + (Math.random() - 0.5) * 0.35,
              vx: -fwdX * jetSpd + (Math.random() - 0.5) * 2.4,
              vy: 3.4 + r.speed * 0.095 + Math.random() * 2.5 + (isNitro ? 2.5 : 0),
              vz: -fwdZ * jetSpd + (Math.random() - 0.5) * 2.4,
              maxAge: isNitro ? 0.52 : 0.42,
              size0: isNitro ? 1.5 : 1.05,
              size1: isNitro ? 4.4 : 3.2,
              r: isNitro ? 0.28 : 0.92,
              g: isNitro ? 0.96 : 0.98,
              b: 1.0,
              gravity: isNitro ? 12.0 : 18.0,
            });
          }
        } else if (r.airborne && r.nitroActive && idx === 0) {
          // Mid-air Nitro thruster jet trail!
          const tailX = r.x - fwdX * 1.95;
          const tailZ = r.z - fwdZ * 1.95;
          for (let k = 0; k < 3; k++) {
            spawnParticle({
              x: tailX,
              y: r.y + 0.15,
              z: tailZ,
              vx: -fwdX * 12 + (Math.random() - 0.5) * 1.8,
              vy: (Math.random() - 0.5) * 1.5,
              vz: -fwdZ * 12 + (Math.random() - 0.5) * 1.8,
              maxAge: 0.26,
              size0: 1.4,
              size1: 3.4,
              r: 0.22,
              g: 0.95,
              b: 1.0,
              gravity: 3.0,
            });
          }
        }

        // 2. Side carving spray sheets when leaning hard into a turn!
        const carve = Math.abs(r.steerSmooth || 0);
        if (!r.airborne && r.speed > 14 && carve > 0.28) {
          const side = r.steerSmooth > 0 ? -1 : 1; // outer carving edge sprays water out!
          const count = idx === 0 ? 2 : Math.random() < 0.45 ? 1 : 0;
          for (let k = 0; k < count; k++) {
            const outSpd = 5 + carve * 9 + Math.random() * 3;
            spawnParticle({
              x: r.x + rightX * side * 0.75,
              y: r.y + 0.18,
              z: r.z + rightZ * side * 0.75,
              vx: rightX * side * outSpd - fwdX * 2.5,
              vy: 3.2 + carve * 4.5 + Math.random() * 2.0,
              vz: rightZ * side * outSpd - fwdZ * 2.5,
              maxAge: 0.36 + Math.random() * 0.22,
              size0: 0.95,
              size1: 3.0,
              r: 0.88,
              g: 0.98,
              b: 1.0,
              gravity: 19.0,
            });
          }
        }
      }

      // Advance all particles
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i];
        if (p.age < p.maxAge) {
          p.age += dt;
          p.vy -= p.gravity * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.vx *= 1 - dt * 1.2;
          p.vz *= 1 - dt * 1.2;

          const t = Math.min(1, p.age / p.maxAge);
          posArr[i * 3] = p.x;
          posArr[i * 3 + 1] = p.y;
          posArr[i * 3 + 2] = p.z;
          colArr[i * 3] = p.r;
          colArr[i * 3 + 1] = p.g;
          colArr[i * 3 + 2] = p.b;
          sizeArr[i] = p.size0 + (p.size1 - p.size0) * t;
          alphaArr[i] = Math.sin(t * Math.PI) * (1 - t * 0.35) * 0.78;
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
