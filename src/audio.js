// Procedural Web Audio Marine Jet-Ski Synthesizer for Riptide Rush.
// Features:
//  - Multi-oscillator marine engine with throttle load & RPM modulation
//  - Distinct airborne impeller cavitation whine when ski leaves the water
//  - Velocity & carve-scaled hydro spray / ocean surf noise
//  - Hydro Nitro turbine roar
//  - Ascending buoy slalom combo chimes, ramp launches, splashdowns, wake bumps & stunts

export class MarineAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.master = null;
    this.engineGain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.subOsc = null;
    this.engFilter = null;
    this.whineOsc = null;
    this.whineOsc2 = null;
    this.whineGain = null;
    this.whineFilter = null;
    this.sprayGain = null;
    this.sprayFilter = null;
    this.surfGain = null;
    this.nitroGain = null;
    this.nitroOsc = null;
    this.nitroFilter = null;
    this.noiseBuffer = null;
    this._smoothRpm = 0.2;
    this._smoothAir = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.48;
      master.connect(ctx.destination);
      this.master = master;

      // Create 2-second white/pink-tinted noise buffer for spray, splash, surf & nitro
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.950 * b2 + w * 0.048;
        d[i] = (b0 + b1 + b2 + w * 0.35) * 0.65;
      }
      this.noiseBuffer = buf;

      // ---- 1. Marine Jet-Ski Engine Synth (sawtooth + triangle + sub)
      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 380;
      engFilter.Q.value = 3.2;

      const engShaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = Math.tanh(x * 2.1);
      }
      engShaper.curve = curve;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.0;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 68;

      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 102;

      const subOsc = ctx.createOscillator();
      subOsc.type = 'triangle';
      subOsc.frequency.value = 34;

      const g1 = ctx.createGain(); g1.gain.value = 0.42;
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      const gSub = ctx.createGain(); gSub.gain.value = 0.55;

      osc1.connect(g1); g1.connect(engFilter);
      osc2.connect(g2); g2.connect(engFilter);
      subOsc.connect(gSub); gSub.connect(engFilter);
      engFilter.connect(engShaper);
      engShaper.connect(engGain);
      engGain.connect(master);

      osc1.start();
      osc2.start();
      subOsc.start();
      this.osc1 = osc1;
      this.osc2 = osc2;
      this.subOsc = subOsc;
      this.engFilter = engFilter;
      this.engineGain = engGain;

      // ---- 2. Airborne Impeller Cavitation Whine
      const whineFilter = ctx.createBiquadFilter();
      whineFilter.type = 'bandpass';
      whineFilter.frequency.value = 1150;
      whineFilter.Q.value = 4.2;

      const whineGain = ctx.createGain();
      whineGain.gain.value = 0;

      const whineOsc = ctx.createOscillator();
      whineOsc.type = 'sawtooth';
      whineOsc.frequency.value = 540;

      const whineOsc2 = ctx.createOscillator();
      whineOsc2.type = 'sine';
      whineOsc2.frequency.value = 1080;

      whineOsc.connect(whineFilter);
      whineOsc2.connect(whineFilter);
      whineFilter.connect(whineGain);
      whineGain.connect(master);
      whineOsc.start();
      whineOsc2.start();
      this.whineOsc = whineOsc;
      this.whineOsc2 = whineOsc2;
      this.whineFilter = whineFilter;
      this.whineGain = whineGain;

      // ---- 3. Hydro Spray & Carving Wash
      const spraySrc = ctx.createBufferSource();
      spraySrc.buffer = buf;
      spraySrc.loop = true;
      const sprayFilter = ctx.createBiquadFilter();
      sprayFilter.type = 'bandpass';
      sprayFilter.frequency.value = 1100;
      sprayFilter.Q.value = 0.7;
      const sprayGain = ctx.createGain();
      sprayGain.gain.value = 0;
      spraySrc.connect(sprayFilter);
      sprayFilter.connect(sprayGain);
      sprayGain.connect(master);
      spraySrc.start();
      this.sprayFilter = sprayFilter;
      this.sprayGain = sprayGain;

      // ---- 4. Ambient Ocean Surf
      const surfSrc = ctx.createBufferSource();
      surfSrc.buffer = buf;
      surfSrc.loop = true;
      const surfFilter = ctx.createBiquadFilter();
      surfFilter.type = 'lowpass';
      surfFilter.frequency.value = 340;
      const surfGain = ctx.createGain();
      surfGain.gain.value = 0.08;
      surfSrc.connect(surfFilter);
      surfFilter.connect(surfGain);
      surfGain.connect(master);
      surfSrc.start();
      this.surfGain = surfGain;

      // ---- 5. Hydro Nitro Jet Roar
      const nitroSrc = ctx.createBufferSource();
      nitroSrc.buffer = buf;
      nitroSrc.loop = true;
      const nitroFilter = ctx.createBiquadFilter();
      nitroFilter.type = 'bandpass';
      nitroFilter.frequency.value = 620;
      nitroFilter.Q.value = 1.4;
      const nitroOsc = ctx.createOscillator();
      nitroOsc.type = 'sawtooth';
      nitroOsc.frequency.value = 185;
      const nitroOscG = ctx.createGain();
      nitroOscG.gain.value = 0.16;
      const nitroGain = ctx.createGain();
      nitroGain.gain.value = 0;
      nitroSrc.connect(nitroFilter);
      nitroOsc.connect(nitroOscG);
      nitroOscG.connect(nitroFilter);
      nitroFilter.connect(nitroGain);
      nitroGain.connect(master);
      nitroSrc.start();
      nitroOsc.start();
      this.nitroFilter = nitroFilter;
      this.nitroOsc = nitroOsc;
      this.nitroGain = nitroGain;

      this.started = true;
    } catch (_) {
      /* AudioContext unavailable */
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.48, this.ctx.currentTime, 0.04);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // Per-frame engine, impeller whine, spray, surf & nitro update
  update({
    active = false,
    speedNorm = 0,
    throttle = 0,
    carveAmt = 0,
    airborne = false,
    nitroActive = false,
    pitchMul = 1.0,
    stormAmt = 0,
  }) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;

    // Ambient surf gently breathes with ocean swells
    const surfBase = active ? 0.07 + stormAmt * 0.08 : 0.055 + stormAmt * 0.05;
    this.surfGain.gain.setTargetAtTime(surfBase, t, 0.2);

    if (!active) {
      this.engineGain.gain.setTargetAtTime(0.0, t, 0.1);
      this.whineGain.gain.setTargetAtTime(0.0, t, 0.08);
      this.sprayGain.gain.setTargetAtTime(0.0, t, 0.1);
      this.nitroGain.gain.setTargetAtTime(0.0, t, 0.08);
      return;
    }

    // Smooth RPM climbs sharply when airborne (unloaded impeller revs higher!)
    const targetRpm = Math.min(
      1.35,
      0.16 + speedNorm * 0.68 + throttle * 0.24 + (airborne ? 0.28 : 0) + (nitroActive ? 0.22 : 0)
    );
    this._smoothRpm += (targetRpm - this._smoothRpm) * 0.18;
    const airTarget = airborne ? 1 : 0;
    this._smoothAir += (airTarget - this._smoothAir) * 0.24;

    const baseFreq = (48 + this._smoothRpm * 128) * pitchMul;
    this.osc1.frequency.setTargetAtTime(baseFreq, t, 0.03);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.503, t, 0.03);
    this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(
      260 + this._smoothRpm * 1150 + (nitroActive ? 600 : 0),
      t,
      0.04
    );
    const engVol = (0.14 + throttle * 0.10 + speedNorm * 0.08) * (1.0 - this._smoothAir * 0.28);
    this.engineGain.gain.setTargetAtTime(engVol, t, 0.05);

    // Airborne unloaded impeller cavitation whine!
    const whineFreq = (680 + this._smoothRpm * 760) * pitchMul;
    this.whineOsc.frequency.setTargetAtTime(whineFreq, t, 0.025);
    this.whineOsc2.frequency.setTargetAtTime(whineFreq * 1.98, t, 0.025);
    this.whineFilter.frequency.setTargetAtTime(whineFreq * 1.35, t, 0.03);
    const whineVol = this._smoothAir * (0.065 + throttle * 0.085);
    this.whineGain.gain.setTargetAtTime(whineVol, t, 0.03);

    // Hydro spray & carve water hiss (quiets down while airborne!)
    const waterContact = 1.0 - this._smoothAir;
    const sprayVol = waterContact * (speedNorm * 0.17 + carveAmt * 0.19);
    this.sprayGain.gain.setTargetAtTime(sprayVol, t, 0.04);
    this.sprayFilter.frequency.setTargetAtTime(650 + speedNorm * 1400 + carveAmt * 1100, t, 0.05);

    // Hydro Nitro turbine surge
    this.nitroGain.gain.setTargetAtTime(nitroActive ? 0.26 : 0.0, t, 0.05);
    this.nitroFilter.frequency.setTargetAtTime(nitroActive ? 920 + speedNorm * 650 : 420, t, 0.06);
    this.nitroOsc.frequency.setTargetAtTime(160 + speedNorm * 140, t, 0.05);
  }

  playSplash(intensity = 0.7) {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = Math.max(0.2, Math.min(1.4, intensity));

    // Low hull-slap thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 * k, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.22);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.32 * k, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(og);
    og.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.26);

    // Broadband water plume burst
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(1800, t);
    flt.frequency.exponentialRampToValueAtTime(420, t + 0.45 * k);
    flt.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.34 * k, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.48 * k);
    src.connect(flt);
    flt.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.52 * k);
  }

  playRampLaunch() {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  playBuoyHit(combo = 1) {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const freq = scale[Math.min(scale.length - 1, Math.max(0, combo - 1))];
    [1, 1.5].forEach((mul, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * mul, t + idx * 0.045);
      const g = ctx.createGain();
      g.gain.setValueAtTime(idx === 0 ? 0.2 : 0.12, t + idx * 0.045);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32 + idx * 0.05);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + idx * 0.045);
      osc.stop(t + 0.38 + idx * 0.05);
    });
  }

  playBuoyMiss() {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(98, t + 0.22);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  playStuntStart() {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(760, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  playStuntLand() {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + i * 0.045);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.045 + 0.26);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.045);
      osc.stop(t + i * 0.045 + 0.28);
    });
  }

  playStuntBail() {
    this.playSplash(1.3);
    this.playBuoyMiss();
  }

  playWakeBump() {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
    this.playSplash(0.55);
  }

  playCountdown(isGo = false) {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = isGo ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, t);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = isGo ? 2400 : 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (isGo ? 0.45 : 0.22));
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + (isGo ? 0.48 : 0.24));
  }

  playLap(finalLap = false) {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const seq = finalLap ? [659.25, 880, 1174.66, 1318.5] : [587.33, 783.99, 1046.5];
    seq.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t + i * 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.3);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.34);
    });
  }

  playMenu() {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(860, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}
