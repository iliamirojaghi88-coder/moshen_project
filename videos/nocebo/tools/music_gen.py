#!/usr/bin/env python3
"""Generate the preview music bed sections with MusicGen (local, free).

Each section follows one stretch of the edit; tools/mix_score.py places and
crossfades them. Seeds are fixed so a re-run gives the same audio.
Usage: music_gen.py <out-dir> [section ...]
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

SECTIONS = {
    # 0–19 s: hook and the unwell body — tense, dark, a slow pulse
    "m1": ("dark mysterious cinematic underscore, deep pulsing sub bass like a slow heartbeat, "
           "cold evolving synth pad, sparse low piano notes, tension, scientific documentary, 72 bpm, no drums", 20),
    # 22.6–53.7 s: the science — curious, modern, slowly building
    "m2": ("modern scientific documentary music, minimal pulsing synth arpeggio, soft deep bass, "
           "mysterious and curious, slowly building tension, clean electronic textures, 80 bpm", 30),
    # 53.7–61 s: the term — dark, luxurious swell
    "m3": ("dark luxurious cinematic swell, deep low strings and soft brass, slow dramatic reveal, "
           "wide reverb, minimal, no drums", 10),
    # 61–81 s: conclusion and the question — reflective, unresolved
    "m4": ("reflective cinematic ambient, soft felt piano and warm evolving pad, mysterious, "
           "calm but unresolved, intimate ending, 70 bpm, no drums", 22),
}


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    names = sys.argv[2:] or list(SECTIONS)
    proc = AutoProcessor.from_pretrained("facebook/musicgen-small")
    model = MusicgenForConditionalGeneration.from_pretrained("facebook/musicgen-small")
    model.eval()
    rate = model.config.audio_encoder.sampling_rate
    for i, name in enumerate(names):
        prompt, seconds = SECTIONS[name]
        torch.manual_seed(1234 + i)
        inputs = proc(text=[prompt], padding=True, return_tensors="pt")
        tokens = int(seconds * 50) + 8
        with torch.no_grad():
            audio = model.generate(**inputs, do_sample=True, guidance_scale=3.5, max_new_tokens=tokens)
        wav = audio[0, 0].cpu().numpy().astype(np.float32)
        sf.write(out / f"{name}.wav", wav, rate)
        print(name, len(wav) / rate, "s", flush=True)


if __name__ == "__main__":
    main()
