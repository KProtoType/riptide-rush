// Performance tiers (Ultra / High / Balanced), live Weather presets
// (Sunny / Golden Sunset / Storm Swell), and device detection for Riptide Rush.

const hash = window.location.hash || '';
const coarse = !!(
  window.matchMedia &&
  (window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches)
);
const touchy = coarse || (navigator.maxTouchPoints || 0) > 1;
const smallScreen =
  Math.min(window.screen.width || 9999, window.screen.height || 9999) <= 840;
let mobile = (touchy && smallScreen) || (coarse && smallScreen);
if (/[#&]lowfx/.test(hash)) mobile = true;
if (/[#&]hifx/.test(hash)) mobile = false;

export const QUALITY_TIERS = {
  ultra: {
    id: 'ultra',
    label: 'ULTRA',
    dprCap: 2.0,
    pixels: 2.4e6,
    minRatio: 0.85,
    shadowSize: 2048,
    shadowBox: 72,
    shadowForward: 38,
    bloom: true,
    msaa: 4,
    anisotropy: 16,
    oceanSegs: 200,
    oceanHalfSize: 420,
    waterReflect: true,
    waterReflectSize: 512,
    waterReflectRate: 1,
    particles: 1.0,
    motionBlur: 1.0,
    sunGlare: 1.0,
    droplets: 1.0,
    sceneryDensity: 1.0,
  },
  high: {
    id: 'high',
    label: 'HIGH',
    dprCap: 1.75,
    pixels: 1.85e6,
    minRatio: 0.78,
    shadowSize: 2048,
    shadowBox: 62,
    shadowForward: 32,
    bloom: true,
    msaa: 4,
    anisotropy: 8,
    oceanSegs: 156,
    oceanHalfSize: 390,
    waterReflect: true,
    waterReflectSize: 384,
    waterReflectRate: 2,
    particles: 0.85,
    motionBlur: 0.9,
    sunGlare: 0.95,
    droplets: 0.95,
    sceneryDensity: 0.9,
  },
  balanced: {
    id: 'balanced',
    label: 'BALANCED',
    dprCap: mobile ? 1.35 : 1.5,
    pixels: mobile ? 0.95e6 : 1.3e6,
    minRatio: 0.65,
    shadowSize: 1024,
    shadowBox: 44,
    shadowForward: 22,
    bloom: !mobile,
    msaa: 2,
    anisotropy: 4,
    oceanSegs: mobile ? 104 : 124,
    oceanHalfSize: 340,
    waterReflect: !mobile,
    waterReflectSize: 256,
    waterReflectRate: 3,
    particles: 0.55,
    motionBlur: 0.55,
    sunGlare: 0.75,
    droplets: 0.75,
    sceneryDensity: mobile ? 0.65 : 0.8,
  },
};

export const WEATHER_MODES = ['sunny', 'sunset', 'storm'];
export const WEATHER_LABELS = {
  sunny: 'SUNNY',
  sunset: 'GOLDEN SUNSET',
  storm: 'STORM SWELL',
};
export const QUALITY_ORDER = ['ultra', 'high', 'balanced'];

let savedTier = null;
let savedWeather = null;
try {
  savedTier = window.localStorage.getItem('riptideRush.quality');
  savedWeather = window.localStorage.getItem('riptideRush.weather');
} catch (_) {
  /* ignore storage errors */
}

const hashTier = (/[#&]q=(ultra|high|balanced)/.exec(hash) || [])[1];
const hashWeather = (/[#&]w=(sunny|sunset|storm)/.exec(hash) || [])[1];

const startTier =
  hashTier ||
  (QUALITY_TIERS[savedTier] ? savedTier : mobile ? 'balanced' : 'high');
const startWeather =
  hashWeather ||
  (WEATHER_MODES.includes(savedWeather) ? savedWeather : 'sunny');

export const PERF = Object.assign(
  {
    mobile,
    tier: startTier,
    weather: startWeather,
  },
  QUALITY_TIERS[startTier]
);

export function setQualityTier(tier) {
  if (!QUALITY_TIERS[tier]) return false;
  PERF.tier = tier;
  Object.assign(PERF, QUALITY_TIERS[tier]);
  try {
    window.localStorage.setItem('riptideRush.quality', tier);
  } catch (_) {}
  return true;
}

export function cycleQualityTier() {
  const idx = (QUALITY_ORDER.indexOf(PERF.tier) + 1) % QUALITY_ORDER.length;
  setQualityTier(QUALITY_ORDER[idx]);
  return PERF.tier;
}

export function setWeatherMode(mode) {
  if (!WEATHER_MODES.includes(mode)) return false;
  PERF.weather = mode;
  try {
    window.localStorage.setItem('riptideRush.weather', mode);
  } catch (_) {}
  return true;
}

export function cycleWeatherMode() {
  const idx = (WEATHER_MODES.indexOf(PERF.weather) + 1) % WEATHER_MODES.length;
  setWeatherMode(WEATHER_MODES[idx]);
  return PERF.weather;
}
