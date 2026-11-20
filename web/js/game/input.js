// Keyboard and touch controls. Produces { throttle: 0..1, rot: -1..1 } every frame.
//   Keyboard: Up/W and Down/S move the throttle, Left/A and Right/D rotate, Space cuts the engine.
//   Touch: drag up/down anywhere on the left half to set the throttle; hold the arrow buttons
//   on the right to rotate.
// "Left" means "push me left": it tilts the lander so the thrust points left.
//
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.

const THROTTLE_RATE = 0.6;    // throttle change per second while a key is held

export function createInput(root) {
  const keys = new Set();
  const state = { throttle: 0, rot: 0, touchRot: 0 };
  const handlers = {};

  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.key.toLowerCase());
    if (e.key === ' ') state.throttle = 0;
    handlers[e.key.toLowerCase()]?.();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  // touch: throttle strip
  const strip = root.querySelector('#throttle-zone');
  let drag = null;
  strip.addEventListener('pointerdown', e => {
    drag = { id: e.pointerId, y: e.clientY, t: state.throttle };
    strip.setPointerCapture(e.pointerId);
  });
  strip.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = (drag.y - e.clientY) / (innerHeight * 0.5);   // half a screen = full range
    state.throttle = Math.max(0, Math.min(1, drag.t + dy));
  });
  const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);

  // touch: rotate buttons
  for (const [id, dir] of [['#rot-left', 1], ['#rot-right', -1]]) {
    const b = root.querySelector(id);
    const on = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); state.touchRot = dir; b.classList.add('down'); };
    const off = () => { if (state.touchRot === dir) state.touchRot = 0; b.classList.remove('down'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
  }

  return {
    // call once per rendered frame
    read(dt) {
      const up = keys.has('arrowup') || keys.has('w');
      const down = keys.has('arrowdown') || keys.has('s');
      if (up) state.throttle = Math.min(1, state.throttle + THROTTLE_RATE * dt);
      if (down) state.throttle = Math.max(0, state.throttle - THROTTLE_RATE * dt);
      const l = keys.has('arrowleft') || keys.has('a');
      const r = keys.has('arrowright') || keys.has('d');
      state.rot = (l ? 1 : 0) - (r ? 1 : 0) || state.touchRot;
      return { throttle: state.throttle, rot: state.rot };
    },
    reset() { state.throttle = 0; state.rot = 0; state.touchRot = 0; },
    on(key, fn) { handlers[key] = fn; },
  };
}
