#!/usr/bin/env python3
"""Music sections for the METRICA film with local MusicGen (free, CPU).

Two moods split at the logo reveal: a dark, pulsing tension bed for the
problem half, and a bright, confident electronic bed for the product half
(generated, then extended by continuation so it covers the rest of the film).

  python3 tools/musicgen_bgm.py assets/audio/music
"""
import os
import sys

import numpy as np
import soundfile as sf
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets/audio/music"
MODEL = os.environ.get("MUSICGEN_MODEL", "facebook/musicgen-stereo-small")
os.makedirs(OUT, exist_ok=True)
torch.set_num_threads(4)

SECTIONS = {
    "tension": (
        "dark cinematic electronic trailer underscore, deep pulsing sub bass, tight ticking hi-hats, "
        "tense analog synth arpeggio, suspenseful and controlled, building tension, 100 bpm, instrumental, no vocals",
        30,
        11,
    ),
    "bright": (
        "modern cinematic electronic commercial music, uplifting bright synth plucks, warm wide pads, "
        "punchy clean drums, confident and premium, technology advertisement, 100 bpm, instrumental, no vocals",
        30,
        23,
    ),
}

proc = AutoProcessor.from_pretrained(MODEL)
model = MusicgenForConditionalGeneration.from_pretrained(MODEL)
model.eval()
sr = model.config.audio_encoder.sampling_rate


def gen(prompt, secs, seed, audio=None):
    torch.manual_seed(seed)
    kw = dict(text=[prompt], padding=True, return_tensors="pt")
    if audio is not None:
        kw["audio"] = [audio]
        kw["sampling_rate"] = sr
    inputs = proc(**kw)
    with torch.no_grad():
        out = model.generate(**inputs, do_sample=True, guidance_scale=3.5, max_new_tokens=int(secs * 50))
    return out[0].float().cpu().numpy()  # (channels, samples)


for name, (prompt, secs, seed) in SECTIONS.items():
    path = os.path.join(OUT, f"{name}.wav")
    if os.path.exists(path):
        print("skip", path)
        continue
    a = gen(prompt, secs, seed)
    sf.write(path, a.T, sr)
    print("wrote", path, a.shape)

# extend the bright bed: continue from its last 10 s for 22 s more
ext = os.path.join(OUT, "bright_ext.wav")
if not os.path.exists(ext):
    base, _ = sf.read(os.path.join(OUT, "bright.wav"), always_2d=True)
    tail = base[-10 * sr :].T  # (channels, samples)
    prompt = SECTIONS["bright"][0] + ", soaring finale with a strong final hit"
    out = gen(prompt, 32, 31, audio=tail)
    # output contains the prompt audio followed by the continuation
    cont = out[:, tail.shape[1] :]
    full = np.concatenate([base.T, cont], axis=1)
    sf.write(ext, full.T, sr)
    print("wrote", ext, full.shape)
