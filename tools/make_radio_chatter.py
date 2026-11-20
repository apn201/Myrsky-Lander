"""Canned radio chatter: lines in the style of the NASA Apollo 11/12 descent transcripts (public domain),
synthesized offline with Piper: the crew is voice "joe" (CC0 data), Houston is CMU ARCTIC speaker "rms"
(arctic model; CMU ARCTIC licence: free use and distribution with credit). Then a 1969 radio chain:
300-3000 Hz voice band, compression and soft clipping, static and crackle, a squelch tail, and quindar
tones (2525 Hz in, 2475 Hz out, 250 ms) on Houston's transmissions.

Output: web/assets/audio/chatter.wav (8-bit mono 11025 Hz, like the real tape) and chatter.json
(offset, length, speaker and text of each clip). The game never runs speech synthesis live.

Lines marked "transcript" are the words of the Apollo 11 or 12 air-to-ground transcript; lines marked
"game" are written for the game's failures in the same style. Altitude callouts are built from parts
(height + rate) so they match the player's real numbers.

Run: python tools/make_radio_chatter.py
Written with an AI assistant (Claude Code, Anthropic), Nov 2026.
"""
import json, os, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, "art/voices/en_US-joe-medium.onnx")
VOICE_H = os.path.join(ROOT, "art/voices/en_US-arctic-medium.onnx")
OUT_WAV = os.path.join(ROOT, "web/assets/audio/chatter.wav")
OUT_JSON = os.path.join(ROOT, "web/assets/audio/chatter.json")
SR = 11025

CREW, HOUSTON = "crew", "houston"
LINES = [
    # --- callout parts: height and rate (the LMP read these off the computer display)
    *[(f"h{h}", CREW, f"{h} feet,", "transcript") for h in (400, 300, 250, 200, 150, 100, 75, 60, 50, 40, 30, 20, 10)],
    ("r0.5", CREW, "down a half.", "transcript"), ("r1", CREW, "down one.", "transcript"),
    ("r1.5", CREW, "one and a half down.", "transcript"), ("r2", CREW, "two down.", "transcript"),
    ("r2.5", CREW, "two and a half down.", "transcript"), ("r3", CREW, "three down.", "transcript"),
    ("r3.5", CREW, "three and a half down.", "transcript"), ("r4", CREW, "four down.", "transcript"),
    ("r5", CREW, "five down.", "transcript"), ("r6", CREW, "six down.", "transcript"),
    ("r8", CREW, "eight down.", "transcript"), ("r10", CREW, "ten down.", "transcript"),
    ("r15", CREW, "fifteen down.", "transcript"), ("r20", CREW, "twenty down.", "transcript"),
    # --- descent
    ("go_landing", HOUSTON, "Houston. You're go for landing.", "transcript"),
    ("go_landing_ack", CREW, "Roger. Understand, go for landing.", "transcript"),
    ("looking_good", HOUSTON, "Houston. You're looking great.", "transcript"),
    ("coming_nicely", CREW, "Coming down nicely.", "transcript"),
    ("lot_of_rocks", CREW, "Lot of rocks down there. Going long.", "game"),
    ("drifting", CREW, "Drifting to the right a little.", "transcript"),
    ("shadow", CREW, "Faint shadow.", "transcript"),
    # --- program alarms (Apollo 11)
    ("alarm_1202", CREW, "Program alarm. It's a twelve oh two.", "transcript"),
    ("alarm_1201", CREW, "Twelve oh one.", "transcript"),
    ("alarm_reading", CREW, "Give us a reading on the twelve oh two program alarm.", "transcript"),
    ("alarm_go", HOUSTON, "Roger. We've got, we're go on that alarm.", "transcript"),
    ("alarm_go_same", HOUSTON, "Roger. Same type. We're go.", "transcript"),
    # --- failures (game)
    ("radar_lost", CREW, "Houston, we've lost the landing radar.", "game"),
    ("radar_ack", HOUSTON, "Roger. Fly it by eye. Watch your shadow.", "game"),
    ("jet_stuck", CREW, "We've got a thruster firing on its own.", "game"),
    ("jet_isolate", HOUSTON, "Roger. Isolate quad B. Quad B.", "game"),
    ("throttle_stuck", CREW, "Throttle's stuck. We can't hold it.", "game"),
    ("throttle_ack", HOUSTON, "Roger. Your call. Abort if you have to.", "game"),
    ("engine_out", CREW, "Descent engine's out! Abort stage!", "game"),
    ("abort_ack", HOUSTON, "Roger, abort. We copy abort.", "game"),
    ("low_fuel", HOUSTON, "Watch your fuel.", "game"),
    # --- landing and after
    ("hard_landing", CREW, "We hit hard. Checking the vehicle.", "game"),
    ("say_status", HOUSTON, "Roger. Say status.", "game"),
    ("damaged_down", CREW, "Houston, we're down. We've got some damage.", "game"),
    ("broke_up", CREW, "Houston, the stages separated. Cabin is holding pressure.", "game"),
    ("we_copy_down", HOUSTON, "Roger, we copy you down. Nice work.", "game"),
    ("liftoff", CREW, "Abort stage, engine arm, ascent. Proceed.", "transcript"),
    ("liftoff_beautiful", CREW, "Beautiful! Look at that stuff go all over the place.", "transcript"),
    ("liftoff_ack", HOUSTON, "Roger. We copy, ascent looking good.", "game"),
]

voices = {CREW: PiperVoice.load(VOICE), HOUSTON: PiperVoice.load(VOICE_H)}
SYN = {
    CREW: SynthesisConfig(length_scale=0.88, noise_scale=0.7, noise_w_scale=0.8),
    HOUSTON: SynthesisConfig(speaker_id=1, length_scale=1.0, noise_scale=0.55, noise_w_scale=0.6),   # rms
}
rng = np.random.default_rng(1969)

def synth(text, who):
    chunks = list(voices[who].synthesize(text, SYN[who]))
    a = np.concatenate([c.audio_float_array for c in chunks]).astype(np.float64)
    sr = chunks[0].sample_rate
    sr_eff = sr * (0.97 if who == HOUSTON else 1.02)
    # resample to SR (linear interpolation is fine for a 3 kHz radio channel)
    n = int(len(a) * SR / sr_eff)
    x = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)
    return x

def bandpass(x, lo=300, hi=3000):
    f = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    g = 1 / np.sqrt(1 + (lo / np.maximum(fr, 1)) ** 4) / np.sqrt(1 + (fr / hi) ** 6)
    return np.fft.irfft(f * g, len(x))

def tone(freq, dur, vol=0.35):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, np.minimum(t, dur - t) / 0.008)
    return np.sin(2 * np.pi * freq * t) * env * vol

def radio(x, who):
    # Houston came from the ground station: clearer and wider. The crew came down from the LM over the
    # S-band link: narrower, noisier, more compressed.
    ground = who == HOUSTON
    x = bandpass(x, 250, 3300) if ground else bandpass(x, 420, 2700)
    x = x / (np.max(np.abs(x)) + 1e-9)
    drive = 1.6 if ground else 3.0
    x = np.tanh(drive * x) / np.tanh(drive)                   # compression and soft clipping
    pad = int(0.08 * SR)
    sig = np.concatenate([np.zeros(pad), x * 0.75, np.zeros(int(0.05 * SR))])
    hiss = bandpass(rng.normal(0, 1, len(sig)), 400, 2800)
    hiss = hiss / np.max(np.abs(hiss)) * (0.035 if ground else 0.09)
    crackle = (rng.random(len(sig)) > 0.9985) * rng.normal(0, 0.5, len(sig))
    sig = sig + hiss + bandpass(crackle, 800, 3000)
    squelch = bandpass(rng.normal(0, 1, int(0.18 * SR)), 300, 3000)
    squelch = squelch / np.max(np.abs(squelch)) * 0.28 * np.linspace(1, 0, len(squelch)) ** 2
    parts = [sig, squelch]
    if who == HOUSTON:
        parts = [tone(2525, 0.25), np.zeros(int(0.03 * SR))] + parts + [tone(2475, 0.25)]
    return np.concatenate(parts)

clips, audio, pos = {}, [], 0
for cid, who, text, src in LINES:
    y = radio(synth(text, who), who)
    y = np.clip(y, -1, 1)
    gap = np.zeros(int(0.05 * SR))
    clips[cid] = {"t": [round(pos / SR, 4), round((pos + len(y)) / SR, 4)], "who": who, "text": text, "source": src}
    audio += [y, gap]
    pos += len(y) + len(gap)
    print(f"{cid:18s} {who:8s} {len(y) / SR:5.2f}s  {text}")

full = np.concatenate(audio)
pcm8 = np.clip((full * 127 + 128), 0, 255).astype(np.uint8)
with wave.open(OUT_WAV, "wb") as w:
    w.setnchannels(1); w.setsampwidth(1); w.setframerate(SR); w.writeframes(pcm8.tobytes())
json.dump({"sampleRate": SR, "voice": "Piper, synthesized offline: crew en_US-joe-medium (CC0 data), Houston en_US-arctic-medium speaker rms (CMU ARCTIC)", "clips": clips},
          open(OUT_JSON, "w"), indent=1)
print("total", round(len(full) / SR, 1), "s ->", OUT_WAV, os.path.getsize(OUT_WAV), "bytes")
