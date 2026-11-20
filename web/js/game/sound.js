// Sound: what the crew heard inside the cabin, not outside (vacuum). Synthesized except the Apollo 11 tape.
//   cabin:   fans and glycol pumps (crews described the LM cabin as noisy)
//   engine:  low rumble through the structure, louder with thrust
//   RCS:     sharp bangs when jets fire (crews said they were loud)
//   alarm:   master alarm tone until acknowledged
//   thuds:   touchdown and impacts
//   tape:    real Apollo 11 air-to-ground recording for events: "Contact light", "Engine stop",
//            "60 seconds", "Picking up some dust", "The Eagle has landed" and Houston's reply
//   radio:   the player's own callouts (their real height and rate) are subtitles with a band-passed
//            static burst; Houston's lines are keyed with quindar tones (2525 Hz in, 2475 Hz out)
// Code written with an AI assistant (Claude Code, Anthropic), 20 Nov 2026.

export function createSound() {
  let ctx = null, master, engineGain, engineLP, engineSub, apsGain, alarmGain, alarmOsc, on = true;
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
      src.connect(lp); lp.connect(g); g.connect(master); src.start(Math.random() * 1.5);
      g.lp = lp;
      return g;
    };
    engineGain = mk(160); apsGain = mk(260); engineLP = engineGain.lp;
    // the descent engine's low structural rumble: a 34 Hz tone wobbling under the noise
    engineSub = ctx.createGain(); engineSub.gain.value = 0;
    const sub = ctx.createOscillator(); sub.frequency.value = 34;
    const wob = ctx.createOscillator(), wobG = ctx.createGain(); wob.frequency.value = 3.1; wobG.gain.value = 5;
    wob.connect(wobG); wobG.connect(sub.frequency); sub.connect(engineSub); engineSub.connect(master); sub.start(); wob.start();
    // cabin ambience: fan hiss and the glycol pump's hum, always on
    const cabin = mk(700); cabin.gain.value = 0.05;
    const hum = ctx.createOscillator(), humG = ctx.createGain(); hum.frequency.value = 380; humG.gain.value = 0.006;
    hum.connect(humG); humG.connect(master); hum.start();
    alarmOsc = ctx.createOscillator(); alarmOsc.type = 'square'; alarmOsc.frequency.value = 750;
    alarmGain = ctx.createGain(); alarmGain.gain.value = 0;
    const alp = ctx.createBiquadFilter(); alp.type = 'lowpass'; alp.frequency.value = 2400;
    alarmOsc.connect(alp); alp.connect(alarmGain); alarmGain.connect(master); alarmOsc.start();
    decodeTape(); decodeChat();
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

  // Real Apollo 11 air-to-ground recording (NASA, see assets/audio/README.md): event cues are played
  // from it. Offsets found with a speech recognizer and checked against the words.
  const CUES = {
    altvel:  { t: [0.00, 1.75],    who: 'ALDRIN', text: 'Altitude-velocity light.' },
    s60:     { t: [51.85, 53.15],  who: 'HOUSTON', text: '60 seconds.' },
    dust:    { t: [70.15, 71.35],  who: 'ALDRIN', text: 'Picking up some dust.' },
    s30:     { t: [83.05, 84.15],  who: 'HOUSTON', text: '30 seconds.' },
    contact: { t: [92.30, 93.75],  who: 'ALDRIN', text: 'Contact light.' },
    engstop: { t: [96.55, 97.75],  who: 'ALDRIN', text: 'Okay. Engine stop.' },
    eagle:   { t: [98.95, 104.75], who: 'ARMSTRONG', text: 'Houston, Tranquility Base here. The Eagle has landed.' },
    blue:    { t: [105.40, 112.50], who: 'HOUSTON', text: "Roger, Twan— Tranquility, we copy you on the ground. You got a bunch of guys about to turn blue. We're breathing again. Thanks a lot." },
  };
  let tape = null;
  fetch('assets/audio/a11_landing.wav').then(r => r.arrayBuffer()).then(b => { tapeBytes = b; decodeTape(); }).catch(() => {});
  let tapeBytes = null;
  function decodeTape() { if (ctx && tapeBytes && !tape) ctx.decodeAudioData(tapeBytes.slice(0), d => { tape = d; }); }
  let busyUntil = 0;
  function cue(name) {
    const c = CUES[name];
    subtitle?.(`${c.who} (APOLLO 11 RECORDING): ${c.text}`);
    decodeTape();
    if (!ctx || !on || !tape) return;
    const t0 = Math.max(ctx.currentTime, busyUntil), [a, b] = c.t;
    const src = ctx.createBufferSource(); src.buffer = tape;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1.6, t0 + 0.02);
    g.gain.setValueAtTime(1.6, t0 + (b - a) - 0.03); g.gain.linearRampToValueAtTime(0, t0 + (b - a));
    src.connect(g); g.connect(master); src.start(t0, a, b - a);
    busyUntil = t0 + (b - a) + 0.15;
  }

  function tone(freq, t0, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.setValueAtTime(vol, t0 + dur - 0.01); g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  // radio static: band-passed noise (300-3000 Hz voice channel) for dur seconds, then a squelch tail;
  // Houston's transmissions keyed with quindar tones (2525 Hz in, 2475 Hz out, 250 ms)
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
    g.gain.setValueAtTime(0.05, t1 + dur); g.gain.linearRampToValueAtTime(0.16, t1 + dur + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t1 + dur + 0.25);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master); src.start(t1);
    if (houston) tone(2475, t1 + dur + 0.05, 0.25, 0.09);
  }

  // canned radio chatter (tools/make_radio_chatter.py): transcript-style lines, synthesized offline and
  // radio-processed; played in turn with the tape clips
  let chatMeta = null, chatBytes = null, chatBuf = null;
  fetch('assets/audio/chatter.json').then(r => r.json()).then(m => { chatMeta = m; }).catch(() => {});
  fetch('assets/audio/chatter.wav').then(r => r.arrayBuffer()).then(b => { chatBytes = b; decodeChat(); }).catch(() => {});
  function decodeChat() { if (ctx && chatBytes && !chatBuf) ctx.decodeAudioData(chatBytes.slice(0), d => { chatBuf = d; }); }
  const WHO = { crew: 'LMP', houston: 'HOUSTON' };
  function chat(ids) {
    if (!chatMeta) return;
    ids = [].concat(ids).filter(id => chatMeta.clips[id]);
    if (!ids.length) return;
    const text = ids.map(id => chatMeta.clips[id].text).join(' ');
    const who = chatMeta.clips[ids[0]].who;
    decodeChat();
    if (!ctx || !on || !chatBuf) { subtitle?.(`${WHO[who]}: ${text}`); return; }
    let t0 = Math.max(ctx.currentTime, busyUntil);
    setTimeout(() => subtitle?.(`${WHO[who]}: ${text}`), Math.max(0, (t0 - ctx.currentTime) * 1000));
    for (const id of ids) {
      const [a, b] = chatMeta.clips[id].t;
      const src = ctx.createBufferSource(); src.buffer = chatBuf;
      const g = ctx.createGain(); g.gain.value = 1.3;
      src.connect(g); g.connect(master); src.start(t0, a, b - a);
      t0 += (b - a) - 0.12;            // parts of a callout run together
    }
    busyUntil = t0 + 0.25;
  }

  // the player's own callouts (their real numbers): radio static and a subtitle, no voice
  let subtitle = null;
  function say(text, opts = {}) {
    const houston = !!opts.houston;
    subtitle?.(houston ? `HOUSTON: ${text}` : text);
    radio(Math.max(0.8, text.split(' ').length * 0.3), houston);
  }

  return {
    get on() { return on; },
    toggle() { on = !on; if (master) master.gain.value = on ? 0.8 : 0; return on; },
    say, cue, chat,
    get ready() { return { ctx: ctx ? ctx.state : null, tape: tape ? tape.duration : null }; },
    onSubtitle(fn) { subtitle = fn; },
    thud(v) { burst(70, 0.7, 0.35 + Math.min(0.6, v * 0.08), Math.min(1.5, 0.3 + v * 0.25)); if (v > 3) burst(400, 0.5, 0.5, Math.min(1, v * 0.1)); },
    update(s, alarmLit) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const dps = s.stage === 'full' ? s.throttle : 0;
      engineGain.gain.setTargetAtTime(on && dps > 0 ? 0.25 + dps * 0.9 : 0, t, 0.08);
      engineLP.frequency.setTargetAtTime(110 + dps * 260, t, 0.1);          // heavier and brighter with thrust
      engineSub.gain.setTargetAtTime(on && dps > 0 ? 0.05 + dps * 0.18 : 0, t, 0.08);
      apsGain.gain.setTargetAtTime(on && s.stage === 'ascent' && s.apsOn && s.apsFuel > 0 ? 0.7 : 0, t, 0.08);
      // RCS: a bang for each jet that just came on (at most one every 25 ms)
      let fresh = 0;
      for (let n = 1; n <= 16; n++) { if (s.jetsOn[n] && !lastJets[n]) fresh++; lastJets[n] = s.jetsOn[n]; }
      // RCS: a low structural thump and a sharp crack (crews heard the jets as loud bangs)
      if (fresh && performance.now() - lastPop > 25) {
        const v = 0.25 + 0.1 * Math.min(4, fresh);
        burst(170, 1.0, 0.09, v * 1.6); burst(1300, 1.4, 0.035, v);
        lastPop = performance.now();
      }
      // master alarm: two-tone warble while lit
      alarmGain.gain.setTargetAtTime(on && alarmLit ? 0.07 : 0, t, 0.02);
      if (alarmLit) alarmOsc.frequency.setValueAtTime(Math.floor(t * 2.5) % 2 ? 750 : 1000, t);
    },
  };
}
