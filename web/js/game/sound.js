// Sound, all synthesized (no recordings): what the crew heard inside the cabin, not outside (vacuum).
//   engine:  low rumble through the structure, louder with thrust
//   RCS:     sharp bangs when jets fire (crews said they were loud)
//   alarm:   master alarm tone until acknowledged
//   thuds:   touchdown and impacts
//   radio:   each callout is a band-passed static burst with a squelch tail; Houston's lines are keyed
//            with quindar tones (2525 Hz in, 2475 Hz out, 250 ms), as on the Apollo air-to-ground loops
//   voice:   speech synthesis only with an English male voice (otherwise silent; the words are always
//            shown as subtitles). Browser speech cannot be filtered, so it is never "radio" itself.
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

  // an English male voice, or none
  let voice = null;
  const MALE = /david|mark|guy|daniel|george|ryan|james|thomas|alex|fred|eric|roger|christopher|andrew|brian|male/i;
  const pick = () => {
    const vs = window.speechSynthesis?.getVoices() ?? [];
    voice = vs.find(v => /^en[-_](US|GB|AU)/i.test(v.lang) && MALE.test(v.name) && !/female/i.test(v.name)) ?? null;
  };
  if (window.speechSynthesis) { pick(); speechSynthesis.onvoiceschanged = pick; }

  function tone(freq, t0, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.setValueAtTime(vol, t0 + dur - 0.01); g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // radio static: band-passed noise (300-3000 Hz voice channel) for dur seconds, then a squelch tail
  function radio(dur, houston) {
    if (!ctx || !on) return;
    const t = ctx.currentTime;
    if (houston) tone(2525, t, 0.25, 0.09);
    const n = Math.ceil(ctx.sampleRate * (dur + 0.3));
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 + 0.6 * Math.sin(i / 900));
    const src = ctx.createBufferSource(); src.buffer = b;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const g = ctx.createGain(), t1 = t + (houston ? 0.25 : 0);
    g.gain.setValueAtTime(0, t1); g.gain.linearRampToValueAtTime(0.05, t1 + 0.03);
    g.gain.setValueAtTime(0.05, t1 + dur); g.gain.linearRampToValueAtTime(0.16, t1 + dur + 0.02);   // squelch tail
    g.gain.exponentialRampToValueAtTime(0.0001, t1 + dur + 0.25);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master); src.start(t1);
    if (houston) tone(2475, t1 + dur + 0.05, 0.25, 0.09);
  }

  let speaking = 0, subtitle = null;
  function say(text, opts = {}) {
    const houston = !!opts.houston;
    subtitle?.(houston ? `HOUSTON: ${text}` : text);
    const dur = Math.max(1.0, text.split(' ').length * 0.32);
    radio(dur, houston);
    if (!on || !voice) return;
    if (speechSynthesis.speaking && performance.now() - speaking < 4000) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = 1.12; u.pitch = 0.85; u.volume = 0.85;
    speaking = performance.now();
    setTimeout(() => speechSynthesis.speak(u), houston ? 280 : 30);
  }

  return {
    get on() { return on; },
    toggle() { on = !on; if (master) master.gain.value = on ? 0.8 : 0; if (!on) speechSynthesis?.cancel(); return on; },
    say,
    onSubtitle(fn) { subtitle = fn; },
    get voiceName() { return voice ? voice.name : null; },
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
