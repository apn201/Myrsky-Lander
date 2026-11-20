// Four-way controls for flying in the vertical plane, on a keyboard or a touch screen.
//   ←/→  hand controller: tilt (rate command; let go and the attitude holds)
//   ↑/↓  P66: one click of the rate-of-descent switch per press (+/- 1 ft/s, held = repeats)
//        manual throttle mode: throttle up/down
// Touch: put a finger anywhere and slide. Sideways = tilt, proportional to how far you slide.
// Up/down = one ROD click per 28 px (manual mode: throttle).
// Other keys: Space engine stop/arm, Enter liftoff, M throttle mode, F fine rate, C camera,
// R restart, P pause.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.

const THROTTLE_RATE = 0.5;      // manual throttle travel per second while held
const CLICK_REPEAT = 0.25;      // s between repeated ROD clicks while a key is held
const CLICK_PX = 28;

export function createInput(root) {
  const keys = new Set();
  const handlers = {};
  const st = { clicks: 0, throttle: 0.3, touchPitch: 0, repeat: 0, fine: false };
  let mode = 'P66';

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'enter'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    if (mode === 'P66' && (k === 'arrowup' || k === 'w')) { st.clicks++; st.repeat = CLICK_REPEAT * 1.6; }
    if (mode === 'P66' && (k === 'arrowdown' || k === 's')) { st.clicks--; st.repeat = CLICK_REPEAT * 1.6; }
    if (k === 'f') st.fine = !st.fine;
    handlers[k === ' ' ? 'space' : k]?.();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  // touch: one finger, four ways
  const pad = root.querySelector('#touch-pad');
  let drag = null;
  pad.addEventListener('pointerdown', e => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yClick: e.clientY, thr: st.throttle };
    pad.setPointerCapture(e.pointerId);
    root.querySelector('#touch-dot').style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`;
  });
  pad.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    st.touchPitch = Math.max(-1, Math.min(1, (e.clientX - drag.x) / 90));
    if (mode === 'P66') {
      while (drag.yClick - e.clientY >= CLICK_PX) { st.clicks++; drag.yClick -= CLICK_PX; navigator.vibrate?.(8); }
      while (e.clientY - drag.yClick >= CLICK_PX) { st.clicks--; drag.yClick += CLICK_PX; navigator.vibrate?.(8); }
    } else {
      st.throttle = Math.max(0, Math.min(1, drag.thr + (drag.y - e.clientY) / (innerHeight * 0.45)));
    }
  });
  const end = e => {
    if (drag && e.pointerId === drag.id) { drag = null; st.touchPitch = 0; root.querySelector('#touch-dot').style.display = 'none'; }
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  return {
    read(dt) {
      const up = keys.has('arrowup') || keys.has('w');
      const down = keys.has('arrowdown') || keys.has('s');
      if (mode === 'P66') {
        if (up || down) {
          st.repeat -= dt;
          if (st.repeat <= 0) { st.clicks += up ? 1 : -1; st.repeat = CLICK_REPEAT; }
        }
      } else {
        if (up) st.throttle = Math.min(1, st.throttle + THROTTLE_RATE * dt);
        if (down) st.throttle = Math.max(0, st.throttle - THROTTLE_RATE * dt);
      }
      const l = keys.has('arrowleft') || keys.has('a');
      const r = keys.has('arrowright') || keys.has('d');
      const pitch = (r ? 1 : 0) - (l ? 1 : 0) || st.touchPitch;
      const out = { pitch, roll: 0, yaw: 0, tx: 0, ty: 0, tz: 0, rodClicks: st.clicks, throttle: st.throttle, fine: st.fine };
      st.clicks = 0;
      return out;
    },
    setMode(m) { mode = m; },
    setThrottle(t) { st.throttle = t; },
    reset() { st.clicks = 0; st.touchPitch = 0; keys.clear(); },
    on(key, fn) { handlers[key] = fn; },
  };
}
