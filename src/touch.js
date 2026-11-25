// Responsive Mobile Touch Controls for Riptide Rush (Solo-focused):
//  - Slideable left-thumb Steering Pad (slide seamlessly Left <-> Right)
//  - Auto-Throttle toggle (default ON on touch screens, toggleable anytime)
//  - Brake/Carve, Jump Pop, Hydro Nitro button
//  - Context-aware 4 Mid-Air Stunt buttons (Superman / 360 Spin / Backflip / Grab) that pop bright when airborne!
//  - Landscape orientation helper + iOS audio unlock + full gesture protection

export function createTouchControls({ input, onAction, onUnlockAudio }) {
  const hash = window.location.hash || '';
  const forced = /[#&]touch/.test(hash);
  const body = document.body;

  let autoGas = true;
  try {
    const saved = window.localStorage.getItem('riptideRush.autoGas');
    if (saved !== null) autoGas = saved === '1';
  } catch (_) {}

  const state = {
    on: false,
    autoGas,
    racing: false,
    airborne: false,
  };

  function vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }

  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.innerHTML = `
    <div id="t-steer" class="t-steer-pad" aria-label="Steering">
      <div class="t-steer-half l"><span>◀</span></div>
      <div class="t-steer-half r"><span>▶</span></div>
    </div>

    <div id="t-stunts" class="t-stunt-cluster" aria-label="Mid-Air Stunts">
      <button type="button" class="t-stunt-btn" data-stunt="superman"><b>SUPERMAN</b></button>
      <button type="button" class="t-stunt-btn" data-stunt="spin360"><b>360 SPIN</b></button>
      <button type="button" class="t-stunt-btn" data-stunt="backflip"><b>BACKFLIP</b></button>
      <button type="button" class="t-stunt-btn" data-stunt="grab"><b>GRAB</b></button>
    </div>

    <div class="t-right-cluster">
      <button type="button" class="t-btn t-nitro" id="t-nitro"><b>NITRO</b><i>BOOST</i></button>
      <button type="button" class="t-btn t-jump" id="t-jump"><b>POP</b><i>WAVE</i></button>
      <button type="button" class="t-btn t-brake" id="t-brake"><b>CARVE</b><i>BRAKE</i></button>
      <button type="button" class="t-btn t-gas" id="t-gas"><b>GAS</b></button>
    </div>

    <div class="t-top-tools">
      <button type="button" class="t-mini" id="t-autogas">AUTO-GAS: ON</button>
      <button type="button" class="t-mini" id="t-pause">❚❚</button>
    </div>
  `;
  body.appendChild(root);

  const steerPad = root.querySelector('#t-steer');
  const nitroBtn = root.querySelector('#t-nitro');
  const jumpBtn = root.querySelector('#t-jump');
  const brakeBtn = root.querySelector('#t-brake');
  const gasBtn = root.querySelector('#t-gas');
  const autoGasBtn = root.querySelector('#t-autogas');
  const pauseBtn = root.querySelector('#t-pause');
  const stuntCluster = root.querySelector('#t-stunts');

  const activePointers = new Map();

  function releaseAll() {
    activePointers.clear();
    input.touchLeft = false;
    input.touchRight = false;
    input.touchGas = false;
    input.touchBrake = false;
    input.touchNitro = false;
    steerPad.classList.remove('l', 'r');
    root.querySelectorAll('.down').forEach((el) => el.classList.remove('down'));
  }

  function setTouch(on) {
    if (state.on === on) return;
    state.on = on;
    body.classList.toggle('touch', on);
    if (!on) releaseAll();
    updateLayout();
  }

  const mq = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  const startsTouch =
    forced ||
    !!(mq && mq.matches) ||
    ('ontouchstart' in window &&
      (navigator.maxTouchPoints || 0) > 0 &&
      window.matchMedia('(hover: none)').matches);

  window.addEventListener(
    'keydown',
    () => {
      if (!forced && state.on) setTouch(false);
    },
    true
  );
  window.addEventListener(
    'touchstart',
    () => {
      setTouch(true);
      if (onUnlockAudio) onUnlockAudio();
    },
    { capture: true, passive: true }
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (onUnlockAudio) onUnlockAudio();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true);
    },
    true
  );

  // ---- Slideable Left/Right Steering Pad
  function updateSteer(e) {
    const r = steerPad.getBoundingClientRect();
    const side = e.clientX < r.left + r.width * 0.5 ? 'l' : 'r';
    input.touchLeft = side === 'l';
    input.touchRight = side === 'r';
    steerPad.classList.toggle('l', side === 'l');
    steerPad.classList.toggle('r', side === 'r');
  }
  steerPad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { steerPad.setPointerCapture(e.pointerId); } catch (_) {}
    activePointers.set(e.pointerId, 'steer');
    updateSteer(e);
  });
  steerPad.addEventListener('pointermove', (e) => {
    if (activePointers.get(e.pointerId) !== 'steer') return;
    updateSteer(e);
  });
  const endSteer = (e) => {
    if (activePointers.get(e.pointerId) !== 'steer') return;
    activePointers.delete(e.pointerId);
    input.touchLeft = false;
    input.touchRight = false;
    steerPad.classList.remove('l', 'r');
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
    steerPad.addEventListener(ev, endSteer)
  );

  // ---- Holdable Action Buttons (Gas, Brake/Carve, Hydro Nitro)
  function bindHold(el, prop, vibMs = 8) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      activePointers.set(e.pointerId, prop);
      input[prop] = true;
      el.classList.add('down');
      if (vibMs) vibrate(vibMs);
    });
    const end = (e) => {
      if (activePointers.get(e.pointerId) !== prop) return;
      activePointers.delete(e.pointerId);
      input[prop] = false;
      el.classList.remove('down');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
      el.addEventListener(ev, end)
    );
  }
  bindHold(gasBtn, 'touchGas', 0);
  bindHold(brakeBtn, 'touchBrake', 0);
  bindHold(nitroBtn, 'touchNitro', 12);

  // ---- Wave Pop / Jump tap button
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jumpBtn.classList.add('down');
    input.queueJump = true;
    vibrate(10);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
    jumpBtn.addEventListener(ev, () => jumpBtn.classList.remove('down'))
  );

  // ---- 4 Mid-Air Stunt Buttons
  root.querySelectorAll('[data-stunt]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('down');
      input.queueStunt = btn.dataset.stunt;
      vibrate(12);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
      btn.addEventListener(ev, () => btn.classList.remove('down'))
    );
  });

  // ---- Auto-Gas & Pause mini buttons
  function syncAutoGasUI() {
    autoGasBtn.textContent = `AUTO-GAS: ${state.autoGas ? 'ON' : 'OFF'}`;
    body.classList.toggle('autogas', state.autoGas);
  }
  autoGasBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.autoGas = !state.autoGas;
    try {
      window.localStorage.setItem('riptideRush.autoGas', state.autoGas ? '1' : '0');
    } catch (_) {}
    syncAutoGasUI();
    vibrate(6);
  });
  pauseBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (onAction) onAction('pause');
    vibrate(8);
  });

  // ---- Orientation & Gesture protection
  const isPortrait = () => window.innerHeight > window.innerWidth;
  function updateLayout() {
    const p = state.on && isPortrait();
    body.classList.toggle('portrait', p);
    const tu = Math.min(window.innerWidth / 844, window.innerHeight / 390);
    root.style.setProperty('--tu', Math.max(0.62, Math.min(1.28, tu)).toFixed(3));
    if (p && state.racing) {
      releaseAll();
      if (onAction) onAction('pause');
    }
  }
  window.addEventListener('resize', updateLayout);
  window.addEventListener('orientationchange', updateLayout);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });

  // Prevent browser pinch zoom / context menu during touch gameplay
  ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu'].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      if (state.on) e.preventDefault();
    })
  );

  syncAutoGasUI();
  setTouch(startsTouch);
  updateLayout();

  return {
    state,
    update(racing, airborne, nitroAmt) {
      state.racing = racing;
      state.airborne = airborne;
      const show = state.on && racing && !isPortrait();
      root.classList.toggle('on', show);
      stuntCluster.classList.toggle('air', airborne);
      nitroBtn.classList.toggle('ready', nitroAmt >= 15);
      // Auto-gas feeds throttle while racing in touch mode
      input.autoGasActive = show && state.autoGas;
    },
    releaseAll,
  };
}
