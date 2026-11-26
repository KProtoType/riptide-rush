// Sleek Nautical Motorsport UI & HUD Manager for Riptide Rush:
//  - Title Screen (live animated ocean background!)
//  - Venue Select (3 Photoreal Venues with best time/lap records & instant Marina Garage jump)
//  - Marina Garage (all 4 Jet Skis immediately unlocked, live 3D rotating showcase on water + stats)
//  - Race HUD (Position 1/8, Lap 1/3, Speed MPH, Hydro Nitro bar, Red/Yellow Slalom Combo badge,
//    Airborne Stunt Prompt bar, Live Minimap, Countdown, Stunt/Buoy Toasts, Pause)
//  - Podium Finish Results (8-racer standings, Podium Cash + Stunt Cash + Slalom Bonus, Best Time/Lap badges)

import { VENUES, LAPS_PER_RACE } from './venues.js';
import { JET_SKIS, formatTime } from './skis.js';
import {
  WEATHER_LABELS,
  QUALITY_TIERS,
  DIFFICULTY_TIERS,
  DIFFICULTY_ORDER,
  PERF,
} from './perf.js';

const ORDINALS = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];

export function createUI(callbacks) {
  const ui = document.getElementById('ui');

  ui.innerHTML = `
    <!-- TITLE SCREEN -->
    <section id="s-title" class="screen on">
      <div class="title-scrim"></div>
      <div class="title-hero">
        <div class="title-kicker">PHOTOREAL WATERCRAFT RACING</div>
        <h1 class="title-logo">
          <span class="t-rip">RIPTIDE</span>
          <span class="t-rush">RUSH</span>
        </h1>
        <p class="title-sub">
          Carve real 3D Gerstner swells, thread Red &amp; Yellow slalom buoys, launch floating ramps,
          and throw mid-air stunts to ignite Hydro Nitro.
        </p>
        <div class="title-actions">
          <button type="button" class="btn primary lg" data-act="play">RACE NOW</button>
          <button type="button" class="btn secondary lg" data-act="garage">MARINA GARAGE</button>
        </div>
      </div>

      <div class="controls-card glass kb-only">
        <h3>CONTROLS</h3>
        <div class="ctrl-grid">
          <div><kbd>W</kbd>/<kbd>↑</kbd> Throttle &nbsp; <kbd>S</kbd>/<kbd>↓</kbd> Carve</div>
          <div><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd> Steer</div>
          <div><kbd>SHIFT</kbd> Hydro Nitro</div>
          <div><kbd>SPACE</kbd> Wave Launch Pop</div>
          <div><kbd>1</kbd> Superman &nbsp; <kbd>2</kbd> 360 Spin</div>
          <div><kbd>3</kbd> Backflip &nbsp; <kbd>4</kbd> Grab (Air)</div>
          <div><kbd>O</kbd> Weather &nbsp; <kbd>U</kbd> Quality</div>
          <div><kbd>P</kbd> Pause &nbsp; <kbd>M</kbd> Mute</div>
        </div>
      </div>
    </section>

    <!-- VENUE SELECT -->
    <section id="s-select" class="screen">
      <div class="screen-scrim"></div>
      <div class="topbar">
        <button type="button" class="btn ghost" data-act="back-title">◀ BACK</button>
        <div class="top-title">SELECT VENUE</div>
        <div class="top-right">
          <div class="cash-pill" id="sel-cash">$2,500</div>
          <button type="button" class="btn secondary" data-act="garage">MARINA GARAGE</button>
        </div>
      </div>

      <div class="diff-bar" id="diff-bar"></div>

      <div class="venue-grid" id="venue-cards"></div>

      <div class="bottom-bar">
        <div class="active-ski-chip" id="sel-ski-chip">ACTIVE SKI: AQUA VIPER</div>
        <button type="button" class="btn primary lg" data-act="start-race">LAUNCH RACE ▶</button>
      </div>
    </section>

    <!-- MARINA GARAGE (4 JET SKIS — ALL UNLOCKED IMMEDIATELY) -->
    <section id="s-garage" class="screen">
      <div class="garage-scrim"></div>
      <div class="topbar">
        <button type="button" class="btn ghost" data-act="back-select">◀ VENUES</button>
        <div class="top-title">MARINA GARAGE</div>
        <div class="top-right">
          <div class="cash-pill" id="gar-cash">$2,500</div>
          <button type="button" class="btn primary" data-act="start-race">RACE THIS SKI ▶</button>
        </div>
      </div>

      <div class="garage-info glass">
        <div class="g-badge">UNLOCKED • READY TO RIDE</div>
        <h2 id="g-name">AQUA VIPER</h2>
        <div class="g-tag" id="g-tag">Precision Slalom Carver</div>
        <p class="g-desc" id="g-desc"></p>
        <div class="stat-rows" id="g-stats"></div>
      </div>

      <div class="ski-dock" id="ski-dock"></div>
    </section>

    <!-- RACE HUD -->
    <section id="s-hud" class="screen">
      <div class="hud-tl glass">
        <div class="hud-pos"><span id="h-pos">1ST</span><small>/8</small></div>
        <div class="hud-lap">LAP <b id="h-lap">1</b><span>/${LAPS_PER_RACE}</span></div>
        <div class="hud-timer" id="h-time">0:00.00</div>
      </div>

      <div class="hud-slalom glass" id="h-slalom-box">
        <div class="sl-label">SLALOM COMBO</div>
        <div class="sl-val" id="h-combo">x1</div>
        <div class="sl-guide" id="h-buoy-hint">
          <span class="dot red"></span>PASS RIGHT &nbsp; <span class="dot yellow"></span>PASS LEFT
        </div>
      </div>

      <!-- Glowing Arcade Overhead Direction Arrow -->
      <div class="hud-nav" id="h-nav">
        <div class="nav-arrow-wrap" id="h-nav-arrow">
          <svg viewBox="0 0 64 64" width="54" height="54" aria-hidden="true">
            <polygon points="32,4 58,48 40,42 40,60 24,60 24,42 6,48" fill="currentColor" stroke="#041322" stroke-width="4" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="nav-label" id="h-nav-label">STRAIGHT</div>
      </div>

      <div class="hud-wrong-way" id="h-wrong-way" hidden>WRONG WAY — TURN AROUND!</div>

      <div class="hud-map glass">
        <canvas id="minimap" width="144" height="144"></canvas>
      </div>

      <div class="hud-center-banner" id="h-countdown" hidden>3</div>
      <div class="hud-toasts" id="h-toasts"></div>

      <!-- Airborne Stunt Callout Bar -->
      <div class="hud-stunt-bar glass" id="h-stunt-bar">
        <div class="sb-title" id="h-stunt-title">AIRBORNE — THROW A STUNT!</div>
        <div class="sb-keys kb-only">
          <span><kbd>1</kbd> SUPERMAN</span>
          <span><kbd>2</kbd> 360 SPIN</span>
          <span><kbd>3</kbd> BACKFLIP</span>
          <span><kbd>4</kbd> GRAB</span>
        </div>
      </div>

      <div class="hud-bl glass">
        <div class="nitro-head">
          <span>HYDRO NITRO</span>
          <b id="h-nitro-pct">45%</b>
        </div>
        <div class="nitro-track"><div class="nitro-fill" id="h-nitro-fill"></div></div>
        <div class="nitro-sub kb-only">HOLD <kbd>SHIFT</kbd> TO IGNITE • STUNTS &amp; BUOYS CHARGE</div>
      </div>

      <div class="hud-br glass">
        <div class="spd-val" id="h-speed">0</div>
        <div class="spd-unit">MPH</div>
        <div class="spd-sub" id="h-air-badge">ON WATER</div>
      </div>

      <!-- Pause Overlay -->
      <div class="pause-modal" id="h-pause" hidden>
        <div class="pause-box glass">
          <h2>PAUSED</h2>
          <div class="pause-btns">
            <button type="button" class="btn primary" data-act="resume">RESUME</button>
            <button type="button" class="btn secondary" data-act="restart">RESTART RACE</button>
            <button type="button" class="btn ghost" data-act="quit-select">CHANGE VENUE</button>
            <button type="button" class="btn ghost" data-act="toggle-mute" id="btn-mute">SOUND: ON</button>
          </div>
        </div>
      </div>
    </section>

    <!-- PODIUM RESULTS -->
    <section id="s-results" class="screen">
      <div class="screen-scrim"></div>
      <div class="topbar">
        <div class="top-title" id="res-venue">AZURE ATOLL — FINISH</div>
        <div class="cash-pill" id="res-total-cash">$2,500</div>
      </div>

      <div class="results-grid">
        <div class="res-standings glass">
          <h3>RACE STANDINGS</h3>
          <div id="res-table"></div>
        </div>

        <div class="res-payout glass">
          <div class="res-place" id="res-place">1ST PLACE!</div>
          <div class="res-record" id="res-record"></div>
          <div class="res-lines" id="res-lines"></div>
          <div class="res-actions">
            <button type="button" class="btn primary lg" data-act="restart">RACE AGAIN</button>
            <button type="button" class="btn secondary" data-act="back-select">VENUES</button>
            <button type="button" class="btn ghost" data-act="garage">GARAGE</button>
          </div>
        </div>
      </div>
    </section>
  `;

  // Top-right persistent Graphics Bar buttons
  const btnWeather = document.getElementById('gfx-weather');
  const btnQuality = document.getElementById('gfx-quality');
  const btnAudio = document.getElementById('gfx-audio');
  const elFps = document.getElementById('gfx-fps');

  btnWeather.addEventListener('click', () => callbacks.onCycleWeather());
  btnQuality.addEventListener('click', () => callbacks.onCycleQuality());
  btnAudio.addEventListener('click', () => callbacks.onToggleMute());

  // Delegate clicks inside #ui
  ui.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      callbacks.onAction(act.dataset.act);
      return;
    }
    const vc = e.target.closest('[data-venue]');
    if (vc) {
      callbacks.onSelectVenue(Number(vc.dataset.venue));
      return;
    }
    const sc = e.target.closest('[data-ski]');
    if (sc) {
      callbacks.onSelectSki(Number(sc.dataset.ski));
      return;
    }
    const dc = e.target.closest('[data-diff]');
    if (dc && callbacks.onSelectDifficulty) {
      callbacks.onSelectDifficulty(dc.dataset.diff);
    }
  });

  const screens = {
    title: document.getElementById('s-title'),
    select: document.getElementById('s-select'),
    garage: document.getElementById('s-garage'),
    hud: document.getElementById('s-hud'),
    results: document.getElementById('s-results'),
  };

  const els = {
    diffBar: document.getElementById('diff-bar'),
    venueCards: document.getElementById('venue-cards'),
    selCash: document.getElementById('sel-cash'),
    garCash: document.getElementById('gar-cash'),
    selSkiChip: document.getElementById('sel-ski-chip'),
    gName: document.getElementById('g-name'),
    gTag: document.getElementById('g-tag'),
    gDesc: document.getElementById('g-desc'),
    gStats: document.getElementById('g-stats'),
    skiDock: document.getElementById('ski-dock'),
    hPos: document.getElementById('h-pos'),
    hLap: document.getElementById('h-lap'),
    hTime: document.getElementById('h-time'),
    hCombo: document.getElementById('h-combo'),
    hSlalomBox: document.getElementById('h-slalom-box'),
    hBuoyHint: document.getElementById('h-buoy-hint'),
    hNav: document.getElementById('h-nav'),
    hNavArrow: document.getElementById('h-nav-arrow'),
    hNavLabel: document.getElementById('h-nav-label'),
    hWrongWay: document.getElementById('h-wrong-way'),
    hCountdown: document.getElementById('h-countdown'),
    hToasts: document.getElementById('h-toasts'),
    hStuntBar: document.getElementById('h-stunt-bar'),
    hStuntTitle: document.getElementById('h-stunt-title'),
    hNitroPct: document.getElementById('h-nitro-pct'),
    hNitroFill: document.getElementById('h-nitro-fill'),
    hSpeed: document.getElementById('h-speed'),
    hAirBadge: document.getElementById('h-air-badge'),
    hPause: document.getElementById('h-pause'),
    btnMute: document.getElementById('btn-mute'),
    minimap: document.getElementById('minimap'),
    resVenue: document.getElementById('res-venue'),
    resTotalCash: document.getElementById('res-total-cash'),
    resTable: document.getElementById('res-table'),
    resPlace: document.getElementById('res-place'),
    resRecord: document.getElementById('res-record'),
    resLines: document.getElementById('res-lines'),
  };

  const mapCtx = els.minimap.getContext('2d');

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.classList.toggle('on', k === name);
    });
  }

  function syncGfxBar(muted) {
    btnWeather.textContent = `WEATHER: ${WEATHER_LABELS[PERF.weather] || 'SUNNY'}`;
    btnQuality.textContent = `QUALITY: ${QUALITY_TIERS[PERF.tier]?.label || 'HIGH'}`;
    btnAudio.textContent = muted ? 'AUDIO: OFF' : 'AUDIO: ON';
    els.btnMute.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  }

  function renderVenueSelect(selectedVenueIdx, save) {
    const cashStr = `$${save.cash.toLocaleString()}`;
    els.selCash.textContent = cashStr;
    els.selSkiChip.textContent = `ACTIVE SKI: ${JET_SKIS[save.selectedSki].name}`;

    // Difficulty selector pills (ROOKIE / PRO / ACE)
    const curDiff = DIFFICULTY_TIERS[PERF.difficulty] || DIFFICULTY_TIERS.rookie;
    els.diffBar.innerHTML = `
      <span class="diff-lbl">DIFFICULTY:</span>
      ${DIFFICULTY_ORDER.map((id) => {
        const d = DIFFICULTY_TIERS[id];
        return `<button type="button" class="diff-pill ${id === curDiff.id ? 'on' : ''}" data-diff="${id}">${d.label}</button>`;
      }).join('')}
      <span class="diff-desc">${curDiff.desc}</span>
    `;

    els.venueCards.innerHTML = VENUES.map((v, i) => {
      const rec = save.records[v.id] || {};
      const sel = i === selectedVenueIdx ? 'sel' : '';
      return `
        <div class="venue-card glass ${sel}" data-venue="${i}">
          <div class="vc-art" style="background:${v.cardGrad}">
            <div class="vc-diff">${v.difficultyLabel}</div>
            <div class="vc-waves"></div>
          </div>
          <div class="vc-body">
            <h3>${v.name}</h3>
            <div class="vc-sub">${v.subtitle}</div>
            <p>${v.description}</p>
            <div class="vc-recs">
              <div><span>BEST TIME</span><b>${formatTime(rec.bestTime)}</b></div>
              <div><span>BEST LAP</span><b>${formatTime(rec.bestLap)}</b></div>
              <div><span>BEST FINISH</span><b>${rec.bestPos ? ORDINALS[rec.bestPos - 1] : '--'}</b></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderGarage(selectedSkiIdx, save) {
    const ski = JET_SKIS[selectedSkiIdx];
    els.garCash.textContent = `$${save.cash.toLocaleString()}`;
    els.gName.textContent = ski.name;
    els.gTag.textContent = ski.tagline;
    els.gDesc.textContent = ski.description;

    const statList = [
      ['TOP SPEED', ski.stats.speed],
      ['ACCEL', ski.stats.accel],
      ['CARVING', ski.stats.carve],
      ['AIR / STUNT', ski.stats.air],
      ['SWELL GRIP', ski.stats.stability],
    ];
    els.gStats.innerHTML = statList
      .map(
        ([lbl, val]) => `
        <div class="s-row">
          <span>${lbl}</span>
          <div class="s-track"><div class="s-fill" style="width:${val}%;background:${ski.colors.hull}"></div></div>
          <b>${val}</b>
        </div>`
      )
      .join('');

    els.skiDock.innerHTML = JET_SKIS.map(
      (s, i) => `
      <button type="button" class="ski-tile glass ${i === selectedSkiIdx ? 'sel' : ''}" data-ski="${i}">
        <span class="st-swatch" style="background:linear-gradient(90deg,${s.colors.hull},${s.colors.accent})"></span>
        <span class="st-name">${s.name}</span>
        <span class="st-tag">${s.tagline}</span>
      </button>`
    ).join('');
  }

  function addToast(text, cls = '') {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.textContent = text;
    els.hToasts.appendChild(el);
    while (els.hToasts.children.length > 3) {
      els.hToasts.removeChild(els.hToasts.firstChild);
    }
    setTimeout(() => el.remove(), 1750);
  }

  function setCountdown(txt) {
    if (!txt) {
      els.hCountdown.hidden = true;
      return;
    }
    els.hCountdown.hidden = false;
    els.hCountdown.textContent = txt;
    els.hCountdown.classList.remove('pop');
    void els.hCountdown.offsetWidth;
    els.hCountdown.classList.add('pop');
  }

  function setPaused(paused) {
    els.hPause.hidden = !paused;
  }

  function updateHUD(sim) {
    const p = sim.player;
    const course = sim.course;

    els.hPos.textContent = ORDINALS[Math.max(0, Math.min(7, p.place - 1))];
    els.hLap.textContent = Math.min(LAPS_PER_RACE, p.lap);
    els.hTime.textContent = formatTime(sim.raceTime);

    const mph = Math.round(p.speed * 1.48);
    els.hSpeed.textContent = mph;
    els.hAirBadge.textContent = p.nitroActive
      ? 'HYDRO NITRO!'
      : p.airborne
      ? 'AIRBORNE'
      : 'CARVING';
    els.hAirBadge.classList.toggle('nitro', p.nitroActive);
    els.hAirBadge.classList.toggle('air', p.airborne && !p.nitroActive);

    const nPct = Math.round(p.nitro);
    els.hNitroPct.textContent = `${nPct}%`;
    els.hNitroFill.style.width = `${nPct}%`;
    els.hNitroFill.classList.toggle('active', p.nitroActive);

    const comboMult = Math.max(1, p.slalomCombo);
    els.hCombo.textContent = p.slalomCombo > 0 ? `x${comboMult}` : 'x1';
    els.hSlalomBox.classList.toggle('hot', p.slalomCombo >= 3);

    // Overhead Glowing Arcade Direction Arrow + Wrong-Way Alert!
    const deg = Math.round((p.navAngle * 180) / Math.PI);
    els.hNavArrow.style.transform = `rotate(${deg}deg)`;
    const absDeg = Math.abs(deg);
    els.hNav.classList.toggle('turn', absDeg >= 24 && !p.wrongWay);
    els.hNav.classList.toggle('warn', p.wrongWay);
    if (p.wrongWay) {
      els.hNavLabel.textContent = 'TURN AROUND';
    } else if (deg >= 24) {
      els.hNavLabel.textContent = deg >= 52 ? 'SHARP RIGHT ▶' : 'BEAR RIGHT ▶';
    } else if (deg <= -24) {
      els.hNavLabel.textContent = deg <= -52 ? '◀ SHARP LEFT' : '◀ BEAR LEFT';
    } else {
      els.hNavLabel.textContent = 'FOLLOW GATES';
    }
    els.hWrongWay.hidden = !p.wrongWay;

    // Next buoy side cue
    const nextB = course.buoys[p.nextBuoyIdx];
    if (nextB) {
      const isRed = nextB.side === 'right';
      els.hBuoyHint.innerHTML = isRed
        ? `<span class="dot red"></span>NEXT BUOY: <b>RIGHT ▶</b>`
        : `<span class="dot yellow"></span>NEXT BUOY: <b>◀ LEFT</b>`;
    }

    // Airborne Stunt Bar
    const showStuntBar = p.airborne && (p.airTime > 0.08 || p.vy > 3);
    els.hStuntBar.classList.toggle('on', showStuntBar);
    if (p.stunt) {
      els.hStuntTitle.textContent = p.stunt.completed
        ? `${p.stunt.label} — LAND IT!`
        : `${p.stunt.label}... ${Math.round(p.stunt.progress * 100)}%`;
    } else {
      els.hStuntTitle.textContent = 'AIRBORNE — THROW A STUNT!';
    }

    // Render crisp live Minimap
    drawMinimap(course, sim.racers);
  }

  function drawMinimap(course, racers) {
    const ctx = mapCtx;
    const W = els.minimap.width;
    const H = els.minimap.height;
    ctx.clearRect(0, 0, W, H);

    const b = course.bounds;
    const pad = 18;
    const spanX = Math.max(1, b.maxX - b.minX);
    const spanZ = Math.max(1, b.maxZ - b.minZ);
    const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanZ);
    const ox = W * 0.5 - ((b.minX + b.maxX) * 0.5) * scale;
    const oz = H * 0.5 - ((b.minZ + b.maxZ) * 0.5) * scale;

    const mapX = (x) => ox + x * scale;
    const mapY = (z) => oz + z * scale;

    // Course spline track
    ctx.beginPath();
    for (let i = 0; i < course.nodes.length; i += 3) {
      const n = course.nodes[i];
      const mx = mapX(n.x);
      const my = mapY(n.z);
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(130, 232, 255, 0.35)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220, 248, 255, 0.78)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Start/finish tick
    const sn = course.nodes[0];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mapX(sn.x) - 3, mapY(sn.z) - 3, 6, 6);

    // AI Rivals
    for (let i = 1; i < racers.length; i++) {
      const r = racers[i];
      ctx.beginPath();
      ctx.arc(mapX(r.x), mapY(r.z), 3.1, 0, Math.PI * 2);
      ctx.fillStyle = r.rivalSpec.hull;
      ctx.fill();
    }

    // Player bright pulsing chevron/dot
    const p = racers[0];
    ctx.beginPath();
    ctx.arc(mapX(p.x), mapY(p.z), 5.2, 0, Math.PI * 2);
    ctx.fillStyle = '#38f8ff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#04121f';
    ctx.stroke();
  }

  function renderResults(sim, payout, isNewRecord, save) {
    const venue = sim.course.venue;
    const p = sim.player;
    els.resVenue.textContent = `${venue.name} — FINISH`;
    els.resTotalCash.textContent = `$${save.cash.toLocaleString()}`;
    els.resPlace.textContent = `${ORDINALS[Math.max(0, Math.min(7, p.place - 1))]} PLACE!`;
    els.resRecord.textContent = isNewRecord
      ? 'NEW VENUE TIME RECORD!'
      : `RACE TIME: ${formatTime(p.finishTime)}  •  BEST LAP: ${formatTime(p.bestLapTime)}`;

    const sorted = [...sim.racers].sort((a, b) => a.place - b.place);
    els.resTable.innerHTML = sorted
      .map((r) => {
        const swatch = r.isPlayer ? r.skiSpec.colors.hull : r.rivalSpec.hull;
        const tStr = r.finished
          ? formatTime(r.finishTime)
          : `+${Math.max(0.4, (sim.player.totalProgress - r.totalProgress) / 48).toFixed(1)}s`;
        return `
          <div class="rt-row ${r.isPlayer ? 'me' : ''}">
            <span class="rt-pos">${ORDINALS[r.place - 1]}</span>
            <span class="rt-dot" style="background:${swatch}"></span>
            <span class="rt-name">${r.isPlayer ? `YOU (${r.skiSpec.name})` : r.name}</span>
            <span class="rt-time">${tStr}</span>
          </div>`;
      })
      .join('');

    els.resLines.innerHTML = `
      <div class="pl-row"><span>PODIUM PRIZE (${ORDINALS[p.place - 1]})</span><b>+$${payout.podium.toLocaleString()}</b></div>
      <div class="pl-row"><span>STUNT BONUSES (${p.stuntCount} LANDED)</span><b>+$${payout.stunts.toLocaleString()}</b></div>
      <div class="pl-row"><span>SLALOM BUOY BONUS (MAX x${Math.max(1, p.maxCombo)})</span><b>+$${payout.slalom.toLocaleString()}</b></div>
      <div class="pl-row total"><span>TOTAL EARNED</span><b>+$${payout.total.toLocaleString()}</b></div>
    `;
  }

  return {
    showScreen,
    syncGfxBar,
    renderVenueSelect,
    renderGarage,
    addToast,
    setCountdown,
    setPaused,
    updateHUD,
    renderResults,
    setFps(fps) {
      elFps.textContent = `${fps} FPS`;
    },
  };
}
