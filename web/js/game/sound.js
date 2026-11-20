// Sound, all synthesized (no recordings): what the crew heard inside the cabin, not outside (vacuum).
//   engine:  low rumble through the structure, louder with thrust
//   RCS:     sharp bangs when jets fire (crews said they were loud)
//   alarm:   master alarm tone until acknowledged
//   thuds:   touchdown and impacts
//   voice:   callouts with the browser's speech synthesis, in the style of the Apollo landings
//            ("100 feet, down 3"), and Houston's "we're go on that alarm"
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.

export function createSound() {
  let ctx = null, master, engineGain, apsGain, alarmGain, alarmOsc, on = true;
  const lastJets = new Array(17).fill(false);
  let lastPop = 0;

  function start() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    // brown noise for the engines
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const mk = (freq) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(master); src.start();
      return g;
    };
    engineGain = mk(160); apsGain = mk(260);
    alarmOsc = ctx.createOscillator(); alarmOsc.type = 'square'; alarmOsc.frequency.value = 750;
    alarmGain = ctx.createGain(); alarmGain.gain.value = 0;
    const alp = ctx.createBiquadFilter(); alp.type = 'lowpass'; alp.frequency.value = 2400;
    alarmOsc.connect(alp); alp.connect(alarmGain); alarmGain.connect(master); alarmOsc.start();
  }
  for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, start, { once: false });

  function burst(freq, q, dur, vol) {
    if (!ctx || !on) return;
    const t = ctx.currentTime, n = Math.ceil(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const src = ctx.createBufferSource(); src.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  let speaking = 0;
  function say(text, rate = 1.05) {
    if (!on || !window.speechSynthesis) return;
    if (speechSynthesis.speaking && performance.now() - speaking < 4000) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate; u.pitch = 0.9; u.volume = 0.9; u.lang = 'en-US';
    speaking = performance.now();
    speechSynthesis.speak(u);
  }

  return {
    get on() { return on; },
    toggle() { on = !on; if (master) master.gain.value = on ? 0.8 : 0; if (!on) speechSynthesis?.cancel(); return on; },
    say,
    thud(v) { burst(70, 0.7, 0.35 + Math.min(0.6, v * 0.08), Math.min(1.5, 0.3 + v * 0.25)); if (v > 3) burst(400, 0.5, 0.5, Math.min(1, v * 0.1)); },
    update(s, alarmLit) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const dps = s.stage === 'full' ? s.throttle : 0;
      engineGain.gain.setTargetAtTime(on ? 0.25 + dps * 0.9 : 0, t, 0.08);
      if (dps === 0) engineGain.gain.setTargetAtTime(0, t, 0.08);
      apsGain.gain.setTargetAtTime(on && s.stage === 'ascent' && s.apsOn && s.apsFuel > 0 ? 0.7 : 0, t, 0.08);
      // RCS: a bang for each jet that just came on (at most one every 25 ms)
      let fresh = 0;
      for (let n = 1; n <= 16; n++) { if (s.jetsOn[n] && !lastJets[n]) fresh++; lastJets[n] = s.jetsOn[n]; }
      if (fresh && performance.now() - lastPop > 25) { burst(1100, 1.2, 0.05, 0.25 + 0.1 * Math.min(4, fresh)); lastPop = performance.now(); }
      // master alarm: two-tone warble while lit
      alarmGain.gain.setTargetAtTime(on && alarmLit ? 0.07 : 0, t, 0.02);
      if (alarmLit) alarmOsc.frequency.setValueAtTime(Math.floor(t * 2.5) % 2 ? 750 : 1000, t);
    },
  };
}
