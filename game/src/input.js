// Keyboard + mouse input. Arrows fly the jet, W/S work the throttle,
// mouse drag steers, P pauses, R restarts, Enter starts.
export function createInput() {
  const keys = new Set();
  const mouse = { down: false, dx: 0, dy: 0, lastX: 0, lastY: 0 };
  const pressed = new Set(); // edge-triggered keys, consumed by the game

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (!e.repeat) pressed.add(e.key.toLowerCase());
    keys.add(e.key.toLowerCase());
  }
  function onKeyUp(e) { keys.delete(e.key.toLowerCase()); }
  function onMouseDown(e) {
    mouse.down = true; mouse.lastX = e.clientX; mouse.lastY = e.clientY;
  }
  function onMouseMove(e) {
    if (!mouse.down) return;
    mouse.dx += e.clientX - mouse.lastX;
    mouse.dy += e.clientY - mouse.lastY;
    mouse.lastX = e.clientX; mouse.lastY = e.clientY;
  }
  function onMouseUp() { mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** True once for a key pressed since the last call. */
    wasPressed(key) {
      const k = key.toLowerCase();
      if (pressed.has(k)) { pressed.delete(k); return true; }
      return false;
    },
    /** Continuous flight input for this frame; mouse drag decays after use. */
    poll() {
      let pitch = 0; let roll = 0; let throttleDelta = 0;
      if (keys.has('arrowup')) pitch += 1;
      if (keys.has('arrowdown')) pitch -= 1;
      if (keys.has('arrowleft')) roll -= 1;
      if (keys.has('arrowright')) roll += 1;
      if (keys.has('w') || keys.has('shift')) throttleDelta += 1;
      if (keys.has('s') || keys.has('control')) throttleDelta -= 1;
      // Mouse drag: right = bank right, up = nose up.
      roll += Math.max(-1, Math.min(1, mouse.dx / 160));
      pitch += Math.max(-1, Math.min(1, -mouse.dy / 160));
      mouse.dx *= 0.82; mouse.dy *= 0.82;
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttleDelta: throttleDelta * 0.55,
        brake: keys.has(' '),
      };
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
