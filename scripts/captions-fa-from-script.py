#!/usr/bin/env python3
"""Persian captions from a known narration script.

Whisper's Persian spelling is unreliable, but its timing is good. When the
narration text is known (e.g. it came from scripts/tts-fa.sh), keep the
script's words and borrow whisper's timing: each script word gets a slice of
the speech span proportional to its length.

Usage: captions-fa-from-script.py script.txt transcript.json [out.json]
Writes HyperFrames' word array format: [{"text", "start", "end"}].
"""
import json
import sys


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    script_path, transcript_path = sys.argv[1], sys.argv[2]
    out_path = sys.argv[3] if len(sys.argv) > 3 else transcript_path

    words = open(script_path, encoding="utf-8").read().split()
    heard = json.load(open(transcript_path, encoding="utf-8"))
    if isinstance(heard, dict):
        heard = heard.get("words", [])
    if not words or not heard:
        sys.exit("empty script or transcript")

    start, end = heard[0]["start"], heard[-1]["end"]
    weights = [len(w) + 1 for w in words]
    per_unit = (end - start) / sum(weights)

    out, t = [], start
    for word, weight in zip(words, weights):
        nxt = t + weight * per_unit
        out.append({"text": word, "start": round(t, 3), "end": round(nxt, 3)})
        t = nxt

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(out_path)


if __name__ == "__main__":
    main()
