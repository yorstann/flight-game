// Tiny WebAudio layer: engine hum pitched by throttle, soft chimes on events.
// Everything is guarded — headless Chrome may have no audio at all.
export function createAudio() {
  let ctx = null, osc = null, gain = null, muted = false;
  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 320;
      gain = ctx.createGain(); gain.gain.value = 0;
      osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      osc.start();
      return true;
    } catch { return false; }
  }
  function chime(freq = 880, dur = 0.12, vol = 0.08) {
    if (muted || !ensure()) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* no audio */ }
  }
  return {
    start() { if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    setEngine(throttle, speed) {
      if (muted || !ctx || !osc || !gain) return;
      try {
        osc.frequency.value = 55 + throttle * 70 + speed * 0.4;
        gain.gain.value = 0.018 + throttle * 0.03;
      } catch { /* no audio */ }
    },
    ring() { chime(880, 0.12, 0.09); setTimeout(() => chime(1318, 0.16, 0.07), 90); },
    land() { chime(523, 0.15, 0.08); setTimeout(() => chime(784, 0.2, 0.08), 120); },
    crash() { chime(160, 0.3, 0.12); },
    toggleMute() { muted = !muted; if (gain) gain.gain.value = 0; return muted; },
    isMuted() { return muted; },
  };
}
