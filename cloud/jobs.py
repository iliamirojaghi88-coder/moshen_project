"""Independent jobs: one job = one input x one style. Four inputs x four styles = sixteen jobs that never collide.

  python cloud/jobs.py new FILE --style STYLE [--label NAME]   create job (id printed); input is hard-linked/copied
  python cloud/jobs.py run JOB [--until storyboard]            mechanical steps: prepare -> (judgment by Claude) -> storyboard
  python cloud/jobs.py render JOB [--final]                    preview any time; --final only after approval (gate in lite_edit)
  python cloud/jobs.py resume JOB                              re-run from the first step that did not finish
  python cloud/jobs.py status [JOB]                            table of jobs with state, step, last error tail
  python cloud/jobs.py clean JOB                               drop big intermediates (proxies, base*.mp4), keep transcript+plan

Job id  = <slug>-<hash8-of-input>__<style>. Folders: input/<id>/, work/<id>/, output/<id>/ (the normal project layout,
so handoff.py / lite_edit.py / Studio all work on it). The transcript is cached per INPUT HASH in work/_cache/, so
the same video in four styles is transcribed once. State lives in work/<id>/job.json; a failed step is retried
by `resume` and earlier steps are skipped. Runs are serial (lock file); every step has a timeout.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
STUDIO = REPO / "mp-studio"
sys.path.insert(0, str(STUDIO / "app"))
import platform_utils as PU  # noqa: E402

LITE = REPO / ".claude" / "skills" / "pro-edit" / "lite_edit.py"
CACHE = STUDIO / "work" / "_cache"
LOCK = STUDIO / "work" / ".job.lock"
STYLES = ["lite", "fav-adaptive-glass", "fav-paper-grid", "fav-breakout-card", "fav-text-over-footage", "fav-motion-effects"]
STEP_TIMEOUT = int(os.environ.get("MP_STEP_TIMEOUT", "1500"))  # seconds per command (cloud sessions kill long calls)
PY = sys.executable


def jdir(job):
    return STUDIO / "work" / job


def load(job):
    p = jdir(job) / "job.json"
    if not p.exists():
        sys.exit(f"unknown job {job}")
    return json.loads(p.read_text(encoding="utf-8"))


def save(job, st):
    p = jdir(job) / "job.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(p)


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()[:24] or "video"


class Lock:
    def __enter__(self):
        LOCK.parent.mkdir(parents=True, exist_ok=True)
        for _ in range(2):
            try:
                self.fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self.fd, str(os.getpid()).encode())
                return self
            except FileExistsError:
                if time.time() - LOCK.stat().st_mtime > STEP_TIMEOUT + 300:  # stale: the owner died
                    LOCK.unlink(missing_ok=True)
                    continue
                sys.exit("another job step is running (one at a time to protect RAM/disk); try again shortly")
        sys.exit("could not take the job lock")

    def __exit__(self, *a):
        os.close(self.fd)
        LOCK.unlink(missing_ok=True)


def disk_guard(job, factor=3.0):
    inp = sum(f.stat().st_size for f in (STUDIO / "input" / job).glob("*") if f.is_file())
    free = shutil.disk_usage(STUDIO).free
    if free < max(inp * factor, 1.5e9):
        sys.exit(f"not enough disk: {free / 1e9:.1f} GB free, need ~{max(inp * factor, 1.5e9) / 1e9:.1f} GB. "
                 f"Run `jobs.py clean <other-job>` or remove old outputs.")


def run_step(job, st, name, cmd, env_extra=None):
    st["steps"].setdefault(name, {})
    st["steps"][name].update(state="running", started=time.time())
    st["state"] = f"running:{name}"
    save(job, st)
    env = {**os.environ, "PYTHONUTF8": "1", "MP_NO_GPU": os.environ.get("MP_NO_GPU", "1"), **(env_extra or {})}
    try:
        r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=STEP_TIMEOUT, cwd=REPO, env=env)
        out = (r.stdout or "") + (r.stderr or "")
        rc = r.returncode
    except subprocess.TimeoutExpired as e:
        out, rc = f"timeout after {STEP_TIMEOUT}s (re-run `resume`; finished sub-steps are cached)", 124
        out = (e.stdout.decode(errors="replace") if isinstance(e.stdout, bytes) else (e.stdout or "")) + out
    (jdir(job) / f"{name}.log").write_text(out, encoding="utf-8")
    ok = rc == 0
    st["steps"][name].update(state="done" if ok else "failed", finished=time.time(), rc=rc, tail="" if ok else out[-600:])
    st["state"] = "ok" if ok else f"failed:{name}"
    save(job, st)
    print(out[-1500:] if not ok else out[-600:])
    if not ok:
        sys.exit(f"step {name} failed (see work/{job}/{name}.log). Fix the cause or `jobs.py resume {job}`.")


def cmd_new(a):
    src = Path(a.file).resolve()
    if not src.is_file():
        sys.exit("input file not found (use cloud/fetch_input.py first)")
    h = re.match(r"^[0-9a-f]{8}$", src.stem)
    hh = src.stem if h else __import__("hashlib").sha256(src.read_bytes()[:8 << 20] + str(src.stat().st_size).encode()).hexdigest()[:8]
    style = a.style if a.style in STYLES else sys.exit(f"style must be one of: {', '.join(STYLES)}")
    job = f"{slug(a.label or src.stem)}-{hh}__{style}"
    d_in = STUDIO / "input" / job
    d_in.mkdir(parents=True, exist_ok=True)
    dst = d_in / f"{hh}{src.suffix.lower()}"  # same stem for every style -> shared transcript cache key
    if not dst.exists():
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)
    jdir(job).mkdir(parents=True, exist_ok=True)
    settings = {"edit_style": style if style != "lite" else "auto"}
    (jdir(job) / "settings.json").write_text(json.dumps(settings), encoding="utf-8")
    save(job, {"job": job, "input_hash": hh, "style": style, "created": time.time(), "state": "new", "steps": {}})
    subprocess.run([PY, STUDIO / "app" / "handoff.py", "set", job, "collecting"], capture_output=True, cwd=REPO)
    print(job)


def seed_cache(job, st):
    E = jdir(job) / "edit" / "transcripts"
    E.mkdir(parents=True, exist_ok=True)
    c = CACHE / f"{st['input_hash']}.transcript.json"
    t = E / f"{st['input_hash']}.json"
    if c.exists() and not t.exists():
        shutil.copy2(c, t)
        print("transcript reused from cache")


def store_cache(job, st):
    t = jdir(job) / "edit" / "transcripts" / f"{st['input_hash']}.json"
    CACHE.mkdir(parents=True, exist_ok=True)
    if t.exists():
        shutil.copy2(t, CACHE / f"{st['input_hash']}.transcript.json")


def cmd_run(a, resume=False):
    st = load(a.job)
    with Lock():
        disk_guard(a.job)
        if st["steps"].get("prepare", {}).get("state") != "done":
            seed_cache(a.job, st)
            run_step(a.job, st, "prepare", [PY, LITE, "prepare", a.job])
            store_cache(a.job, st)
        print(f"\nprepared. Judgment step (Claude): fix captions in work/{a.job}/edit/LITE_TODO.md, then "
              f"`jobs.py run {a.job} --until storyboard`.") if getattr(a, "until", "") != "storyboard" else None
        if getattr(a, "until", "") == "storyboard" or resume:
            if (jdir(a.job) / "edit" / "edl.json").exists() and st["steps"].get("storyboard", {}).get("state") != "done":
                run_step(a.job, st, "storyboard", [PY, LITE, "storyboard", a.job])


def cmd_render(a):
    st = load(a.job)
    with Lock():
        disk_guard(a.job)
        name = "render_final" if a.final else "render_preview"
        run_step(a.job, st, name, [PY, LITE, "render", a.job] + (["--final"] if a.final else []))
        if a.final:
            st["state"] = "done"
            save(a.job, st)


def cmd_status(a):
    jobs = [a.job] if a.job else sorted(p.parent.name for p in (STUDIO / "work").glob("*/job.json"))
    for j in jobs:
        st = load(j)
        steps = " ".join(f"{k}:{v.get('state')}" for k, v in st["steps"].items()) or "-"
        print(f"{j:48} {st['state']:18} {steps}")
        for k, v in st["steps"].items():
            if v.get("state") == "failed":
                print(f"    {k}: {v.get('tail', '')[-200:].strip()}")


def cmd_clean(a):
    w = jdir(a.job) / "edit"
    n = 0
    for pat in ("*.proxy.mp4", "base*.mp4", "lite_cut.mp4", "*_cut*.mp4", "clips_graded", "clips_divided"):
        for p in list(jdir(a.job).glob(pat)) + list(w.glob(pat)):
            n += p.stat().st_size if p.is_file() else 0
            shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
    print(f"freed ~{n / 1e6:.0f} MB (transcript, plan and outputs kept)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="c", required=True)
    n = sub.add_parser("new"); n.add_argument("file"); n.add_argument("--style", default="lite"); n.add_argument("--label")
    r = sub.add_parser("run"); r.add_argument("job"); r.add_argument("--until", default="")
    rs = sub.add_parser("resume"); rs.add_argument("job")
    rd = sub.add_parser("render"); rd.add_argument("job"); rd.add_argument("--final", action="store_true")
    s = sub.add_parser("status"); s.add_argument("job", nargs="?")
    c = sub.add_parser("clean"); c.add_argument("job")
    a = ap.parse_args()
    {"new": cmd_new, "run": cmd_run, "resume": lambda x: cmd_run(x, True), "render": cmd_render,
     "status": cmd_status, "clean": cmd_clean}[a.c](a)


if __name__ == "__main__":
    main()
