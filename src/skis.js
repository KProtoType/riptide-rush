// 4 Unlockable Jet Skis (all unlocked immediately in the Marina Garage!)
// plus persistent Podium Cash and per-venue Best Time / Best Lap records.

export const JET_SKIS = [
  {
    id: 'aqua-viper',
    name: 'AQUA VIPER',
    tagline: 'Precision Slalom Carver',
    description:
      'Balanced composite V-hull with twin-blade sponson fins. Carves razor-sharp arcs around slalom buoys with effortless control.',
    hullStyle: 'sleek',
    colors: {
      hull: '#0d9eb8',
      deck: '#f2f7fa',
      accent: '#ff5d3a',
      seat: '#161f29',
      stripe: '#22f0df',
      riderSuit: '#102438',
      riderTrim: '#20e8d8',
      helmet: '#ff5d3a',
    },
    stats: {
      speed: 84,
      accel: 86,
      carve: 92,
      air: 84,
      stability: 84,
    },
    phys: {
      topSpeed: 54.0,
      nitroBonus: 19.5,
      accel: 30.5,
      turnRate: 2.38,
      carveGrip: 5.4,
      rampBoost: 1.05,
      stuntSpeed: 1.06,
      mass: 1.0,
      pitchPitch: 1.0,
    },
  },
  {
    id: 'riptide-gt',
    name: 'RIPTIDE GT',
    tagline: 'Supercharged Hydro Bullet',
    description:
      'Low-drag carbon-kevlar racing hull with twin-stage impeller. Blistering straight-line velocity and extended Hydro Nitro burn.',
    hullStyle: 'bullet',
    colors: {
      hull: '#d62828',
      deck: '#1b2028',
      accent: '#ffd166',
      seat: '#101318',
      stripe: '#ff7b29',
      riderSuit: '#1a1d24',
      riderTrim: '#e63946',
      helmet: '#f5f7fa',
    },
    stats: {
      speed: 98,
      accel: 88,
      carve: 78,
      air: 82,
      stability: 82,
    },
    phys: {
      topSpeed: 58.2,
      nitroBonus: 22.5,
      accel: 32.0,
      turnRate: 2.08,
      carveGrip: 4.7,
      rampBoost: 1.03,
      stuntSpeed: 0.98,
      mass: 1.05,
      pitchPitch: 1.12,
    },
  },
  {
    id: 'wave-shark',
    name: 'WAVE SHARK',
    tagline: 'Freestyle Air Specialist',
    description:
      'Featherweight titanium-ribbed freestyle ski. Launches sky-high off ramps and swells, spinning stunts 25% faster to keep Hydro Nitro full.',
    hullStyle: 'freestyle',
    colors: {
      hull: '#f4b41a',
      deck: '#13243b',
      accent: '#00e5ff',
      seat: '#121821',
      stripe: '#fff08a',
      riderSuit: '#11223a',
      riderTrim: '#f4b41a',
      helmet: '#00e5ff',
    },
    stats: {
      speed: 82,
      accel: 94,
      carve: 96,
      air: 99,
      stability: 78,
    },
    phys: {
      topSpeed: 53.2,
      nitroBonus: 21.0,
      accel: 34.5,
      turnRate: 2.58,
      carveGrip: 5.9,
      rampBoost: 1.24,
      stuntSpeed: 1.28,
      mass: 0.88,
      pitchPitch: 1.22,
    },
  },
  {
    id: 'apex-kraken',
    name: 'APEX KRAKEN',
    tagline: 'Heavy Swell Crusher',
    description:
      'Deep-V offshore endurance craft built for storm swells. Slices cleanly through huge chop and dominates wake-spray bumping duels.',
    hullStyle: 'offshore',
    colors: {
      hull: '#2cd66b',
      deck: '#252e3a',
      accent: '#e2f1ff',
      seat: '#0e141a',
      stripe: '#8affb0',
      riderSuit: '#182420',
      riderTrim: '#2cd66b',
      helmet: '#d9ebff',
    },
    stats: {
      speed: 90,
      accel: 84,
      carve: 84,
      air: 86,
      stability: 99,
    },
    phys: {
      topSpeed: 56.0,
      nitroBonus: 20.5,
      accel: 29.8,
      turnRate: 2.22,
      carveGrip: 5.3,
      rampBoost: 1.1,
      stuntSpeed: 1.04,
      mass: 1.28,
      pitchPitch: 0.88,
    },
  },
];

// 7 Named AI Rival Racers with distinct liveries & personality
export const AI_RIVALS = [
  { name: 'KAI STORM', hull: '#ff5238', deck: '#f4f6f9', accent: '#122238', helmet: '#ffbe0b', style: 'bullet', skill: 0.99 },
  { name: 'FREYA VALE', hull: '#00c4d4', deck: '#182334', accent: '#b8f3ff', helmet: '#ffffff', style: 'sleek', skill: 0.96 },
  { name: 'JAX RIPTIDE', hull: '#ffb703', deck: '#1d1f26', accent: '#fb8500', helmet: '#ff4d4d', style: 'freestyle', skill: 0.93 },
  { name: 'NOVA REEF', hull: '#ff4f9a', deck: '#eef4fa', accent: '#20e8d8', helmet: '#13243b', style: 'sleek', skill: 0.90 },
  { name: 'TORIN FJORD', hull: '#38b000', deck: '#1d2730', accent: '#ccff33', helmet: '#f1faee', style: 'offshore', skill: 0.87 },
  { name: 'MARA SWELL', hull: '#4361ee', deck: '#f8f9fa', accent: '#4cc9f0', helmet: '#ffd166', style: 'bullet', skill: 0.84 },
  { name: 'DANE CREST', hull: '#f97316', deck: '#1f2937', accent: '#fde047', helmet: '#38bdf8', style: 'offshore', skill: 0.81 },
];

const SAVE_KEY = 'riptideRush.save.v1';

export function loadSave() {
  const def = {
    selectedSki: 0,
    cash: 2500,
    racesCompleted: 0,
    wins: 0,
    records: {
      azure: { bestTime: null, bestLap: null, bestPos: null },
      fjord: { bestTime: null, bestLap: null, bestPos: null },
      harbor: { bestTime: null, bestLap: null, bestPos: null },
    },
  };
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return {
      selectedSki: Number.isInteger(parsed.selectedSki)
        ? Math.max(0, Math.min(JET_SKIS.length - 1, parsed.selectedSki))
        : 0,
      cash: typeof parsed.cash === 'number' ? parsed.cash : def.cash,
      racesCompleted: parsed.racesCompleted || 0,
      wins: parsed.wins || 0,
      records: {
        azure: Object.assign({}, def.records.azure, parsed.records?.azure),
        fjord: Object.assign({}, def.records.fjord, parsed.records?.fjord),
        harbor: Object.assign({}, def.records.harbor, parsed.records?.harbor),
      },
    };
  } catch (_) {
    return def;
  }
}

export function persistSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (_) {
    /* ignore */
  }
}

export function formatTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--.--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
