// Canyon Thread v2 — input.
// Keyboard flies the jet, the mouse fires the cannon. One read per frame
// turns the raw key state into the flight model's language: pitch, roll,
// yaw, throttle and boost. Nothing here knows about the game — it only
// reports what the player's hands are doing.

export class Controls {
  constructor() {
    this.keys = {};
    this.mouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.throttle = 0.62; // starts at a cruise-ish setting
    this.anyKey = false;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouseDown = false;
    });
  }

  pressed(code) {
    return !!this.keys[code];
  }

  // Read the current control state. Pitch + pulls the nose up; roll + banks
  // left. W/S (or Shift/Ctrl) work the throttle; Shift alone is the burner.
  read() {
    const k = this.keys;
    let pitch = 0;
    if (k.ArrowUp || k.KeyI) pitch += 1;
    if (k.ArrowDown || k.KeyK) pitch -= 1;
    // Mouse steering: holding the mouse off-centre nudges the nose.
    const my = (this.mouseY / window.innerHeight - 0.5) * 2;
    if (Math.abs(my) > 0.35 && !this.mouseDown) pitch -= my * 0.4;

    let roll = 0;
    if (k.KeyA || k.ArrowLeft) roll += 1;
    if (k.KeyD || k.ArrowRight) roll -= 1;
    const mx = (this.mouseX / window.innerWidth - 0.5) * 2;
    if (Math.abs(mx) > 0.4 && !this.mouseDown) roll -= mx * 0.35;

    let yaw = 0;
    if (k.KeyQ) yaw += 1;
    if (k.KeyE) yaw -= 1;

    if (k.KeyW) this.throttle = Math.min(1, this.throttle + 0.55 * 0.016);
    if (k.KeyS) this.throttle = Math.max(0, this.throttle - 0.55 * 0.016);

    return {
      pitch: Math.max(-1, Math.min(1, pitch)),
      roll: Math.max(-1, Math.min(1, roll)),
      yaw,
      throttle: this.throttle,
      boost: !!k.ShiftLeft || !!k.ShiftRight,
      fire: this.mouseDown || !!k.Space,
    };
  }

  consumeAnyKey() {
    const had = this.anyKey;
    this.anyKey = false;
    return had;
  }
}
