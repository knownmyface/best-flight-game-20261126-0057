// Canyon Thread v2 — sound, synthesised live.
// No audio files: every sound is a WebAudio oscillator or filtered noise,
// built when the player first touches a key. If the browser blocks audio
// the game still flies — sound is garnish, never a gate.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.muted = false;
  }

  // Create the audio context on the first user gesture.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 52;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    } catch (err) {
      this.ctx = null;
    }
  }

  // Engine drone: pitch and loudness follow airspeed and throttle.
  engine(speedRatio, throttle, flying) {
    if (!this.ctx || !this.engineGain || this.muted) return;
    const target = flying ? 0.05 + throttle * 0.06 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.15);
    this.engineOsc.frequency.setTargetAtTime(48 + speedRatio * 90, this.ctx.currentTime, 0.1);
  }

  tone(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (err) { /* sound never blocks play */ }
  }

  noise(dur, vol = 0.2, freq = 900) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(t0);
    } catch (err) { /* sound never blocks play */ }
  }

  chime() {
    this.tone(880, 0.28, 'sine', 0.18);
    this.tone(1318, 0.4, 'sine', 0.14, 0.09);
  }

  shot() {
    this.noise(0.09, 0.12, 2400);
    this.tone(190, 0.07, 'square', 0.06);
  }

  boom() {
    this.noise(0.5, 0.28, 700);
    this.tone(70, 0.4, 'sine', 0.22);
  }

  scrape() {
    this.noise(0.25, 0.18, 500);
  }

  click() {
    this.tone(660, 0.06, 'square', 0.07);
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.15, i * 0.12));
  }
}
