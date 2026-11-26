// Procedural sound: engine hum, wind rush and ring chimes, all synthesised
// with WebAudio. No audio files, no network. Silent until the player first
// interacts (browsers require a gesture to start audio).
export function createAudio() {
  let ctx = null;
  let engineOsc = null; let engineGain = null;
  let windSrc = null; let windGain = null; let windFilter = null;
  let enabled = true;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned sawtooths through a low-pass, pitch follows throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start(); engineOsc2.start();
      // Wind: looped noise buffer through a band-pass, gain follows speed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf; windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
      return true;
    } catch { return false; }
  }

  return {
    /** Call from a user gesture (start button / keypress). */
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    /** Per-frame: throttle 0..1, speed m/s. */
    update(throttle, speed, flying) {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.06 : 0.02, t, 0.1);
      engineOsc.frequency.setTargetAtTime(52 + throttle * 68, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.12, (speed / 150) * 0.12), t, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed * 6, t, 0.2);
    },
    /** Two-note chime when a ring is threaded. */
    ring() {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      [880, 1318].forEach((freq, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.5);
        o.connect(g); g.connect(ctx.destination);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.55);
      });
    },
    /** Low thud for a scrape or crash. */
    thud(hard) {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(hard ? 90 : 140, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(hard ? 0.5 : 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.4);
    },
    toggle() { enabled = !enabled; return enabled; },
  };
}
