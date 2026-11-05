"""Claude's side of the MP Studio handoff (run with .venv/Scripts/python.exe from the repo root:
.venv/Scripts/python.exe mp-studio/app/handoff.py ...).

  handoff.py open <project> [--tab project] [--force]   start the server if needed, open MP Studio as an app window
  handoff.py set <project> <status> [--note "..."]      e.g. working / review / rendering / done
  handoff.py wait <project> [--for ready,approved,changes] [--timeout 3600]
                                                        block until the owner presses a button; prints what they sent
  handoff.py show <project>                              print handoff + brief + last decision (compact)
  handoff.py present <project>                           HEADLESS/cloud: print plan, cut table, storyboard stills and the
                                                         approval request for the chat; never opens a window or waits
  handoff.py approve <project> [--note "..."]            record the user's explicit chat approval (ONLY after they said so)
  handoff.py revise <project> --note "..."               record requested changes (status changes)
  handoff.py check-approved <project>                    exit 0 only if approved AND the plan has not changed since

Run `wait` with the Bash tool's run_in_background: the session is woken when the owner presses
"Send to Claude" / "Approve" / "Send changes" in Studio, with no typing. The window is opened at most
once per 8 hours (the page itself follows the handoff and switches tabs), so it never piles up tabs.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import platform_utils as PU  # noqa: E402
PORT = 8765
URL = f"http://127.0.0.1:{PORT}"
EDGE = [Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Microsoft/Edge/Application/msedge.exe"]
STAMP = ROOT / "work" / ".studio_window"
sys.path.insert(0, str(ROOT))


def up() -> bool:
    try:
        urllib.request.urlopen(URL + "/api/studio/about", timeout=2)
        return True
    except OSError:
        return False


def start_server():
    py = Path(PU.venv_python())
    if PU.is_windows() and py.name == "python.exe" and (py.parent / "pythonw.exe").exists():
        py = py.parent / "pythonw.exe"  # no console window on the desktop
    flags = 0x00000008 | 0x00000200 if sys.platform == "win32" else 0  # DETACHED_PROCESS | NEW_PROCESS_GROUP
    log = open(ROOT / "work" / "studio_server.log", "ab")
    subprocess.Popen([str(py), "-m", "uvicorn", "app.server:app", "--host", "127.0.0.1", "--port", str(PORT)],
                     cwd=ROOT, stdout=log, stderr=log, creationflags=flags, env={**os.environ, "PYTHONUTF8": "1"})
    for _ in range(40):
        if up():
            return
        time.sleep(0.5)
    sys.exit("MP Studio server did not start; see work/studio_server.log")


def open_window(url: str):
    if PU.is_headless():  # cloud session: there is no screen to open a window on
        print(f"headless: not opening a window ({url})")
        return
    edge = next((p for p in EDGE if p.exists()), None)
    if edge:  # app mode: its own window, no tabs, no address bar
        subprocess.Popen([str(edge), f"--app={url}", "--window-size=1280,900"])
    elif sys.platform == "win32":
        os.startfile(url)  # noqa: S606
    else:
        import webbrowser
        webbrowser.open(url)


def api(path, method="GET", data=None):
    req = urllib.request.Request(URL + path, method=method, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def read(p: Path, default):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_handoff(project, status, note="", by="claude"):
    p = ROOT / "work" / project / "handoff.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    h = {**read(p, {}), "status": status, "note": note, "by": by, "updated": time.time()}
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(h, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(p)
    return h


def summary(project) -> dict:
    """`brand` is already merged with this project's settings.json (what the edit must use);
    `project_settings` shows which keys the project overrides."""
    w = ROOT / "work" / project
    brand, over = read(ROOT / "assets" / "brand.json", {}), read(w / "settings.json", {})
    merged = {**brand, **over, **{k: {**brand.get(k, {}), **over[k]} for k in ("colors", "fonts", "voice") if k in over}}
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import clips  # raw clips in the owner's order, role main / retake / broll
    return {"handoff": read(w / "handoff.json", {}), "brief": read(w / "brief.json", {}),
            "decision": read(w / "review" / "decision.json", {}), "brand": merged, "project_settings": over,
            "clips": clips.order(project)}


def plan_hash(project) -> str:
    """Fingerprint of what the owner approves: cut list, captions, motion and the merged settings."""
    import hashlib
    w = ROOT / "work" / project
    h = hashlib.sha256()
    # caption_fixes.json = the lite path's caption source (its master.srt is rebuilt after this check)
    for f in (w / "edit" / "edl.json", w / "edit" / "master.srt", w / "edit" / "caption_fixes.json",
              w / "edit" / "motion.json", w / "edit" / "plan.md", w / "edit" / "cards.json", w / "settings.json"):
        h.update(f.name.encode())
        h.update(f.read_bytes() if f.exists() else b"-")
    return h.hexdigest()[:16]


def approval_state(project) -> tuple:
    """(ok, reason). Final renders are allowed only when status is approved by the owner/chat AND the
    plan is unchanged since that approval."""
    w = ROOT / "work" / project
    h = read(w / "handoff.json", {})
    if h.get("status") not in ("approved", "rendering", "done") or h.get("by") not in ("owner", "chat", "claude"):
        return False, (f"not approved yet (status={h.get('status')}, by={h.get('by')}); show the plan with "
                       "`handoff.py present` and wait for the user's explicit approval")
    a = read(w / "approval.json", None)
    if a is None:
        # desktop: the Studio button wrote status approved by owner; in headless mode chat approval is required
        if h.get("by") == "owner" and not PU.is_headless():
            return True, "approved in Studio"
        return False, "no approval record (use `handoff.py approve` after the user's explicit yes)"
    if a.get("plan") != plan_hash(project):
        return False, "the plan changed after approval; present it again and get a new approval"
    return True, "approved"


def present(project):
    w = ROOT / "work" / project
    E = w / "edit"
    out = [f"# Plan for {project}", ""]
    out.append((E / "plan.md").read_text(encoding="utf-8") if (E / "plan.md").exists() else "(no plan.md yet - run storyboard)")
    edl = read(E / "edl.json", {})
    if edl.get("ranges"):
        out += ["", "## Cut table", "| # | source | start | end | len |", "|---|---|---|---|---|"]
        for i, r in enumerate(edl["ranges"], 1):
            out.append(f"| {i} | {r.get('source', '')} | {r['start']:.2f} | {r['end']:.2f} | {r['end'] - r['start']:.2f} |")
        out.append(f"\nTotal kept: {sum(r['end'] - r['start'] for r in edl['ranges']):.1f}s in {len(edl['ranges'])} pieces")
    rd = w / "review"
    stills = sorted(p for p in rd.rglob("*") if p.suffix.lower() in (".jpg", ".jpeg", ".png")) if rd.is_dir() else []
    if stills:
        out += ["", f"## Storyboard: {len(stills)} stills (open/show these to the user)"]
        out += [f"- {p.relative_to(ROOT).as_posix()}" for p in stills[:40]]
    od = ROOT / "output" / project
    sample = sorted(od.glob("*_preview.mp4")) if od.is_dir() else []
    if sample:
        out += ["", f"Sample render: {sample[-1].relative_to(ROOT).as_posix()} (send it with cloud/deliver.py so the user can watch it)"]
    out += ["", "## Approval request",
            "Ask the user: approve this plan, or what should change? Do NOT start the final render until they clearly",
            f"say yes in chat. Then run `handoff.py approve {project}` (or `revise --note ...`)."]
    write_handoff(project, "review", "presented in chat (headless)", by="claude")
    print("\n".join(out))


def _decision(project, decision, note):
    w = ROOT / "work" / project
    (w / "review").mkdir(parents=True, exist_ok=True)
    (w / "review" / "decision.json").write_text(
        json.dumps({"decision": decision, "note": note, "by": "chat", "at": time.time()}, ensure_ascii=False), encoding="utf-8")
    if decision == "approved":
        (w / "approval.json").write_text(json.dumps({"plan": plan_hash(project), "at": time.time(), "note": note}), encoding="utf-8")
    else:
        (w / "approval.json").unlink(missing_ok=True)
    return write_handoff(project, "approved" if decision == "approved" else "changes", note, by="chat")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("open"); o.add_argument("project"); o.add_argument("--tab", default="project"); o.add_argument("--force", action="store_true")
    s = sub.add_parser("set"); s.add_argument("project"); s.add_argument("status"); s.add_argument("--note", default="")
    w = sub.add_parser("wait"); w.add_argument("project"); w.add_argument("--for", dest="want", default="ready,approved,changes")
    w.add_argument("--timeout", type=float, default=3600)
    sh = sub.add_parser("show"); sh.add_argument("project")
    pr = sub.add_parser("present"); pr.add_argument("project")
    ap_ = sub.add_parser("approve"); ap_.add_argument("project"); ap_.add_argument("--note", default="")
    rv_ = sub.add_parser("revise"); rv_.add_argument("project"); rv_.add_argument("--note", required=True)
    ck = sub.add_parser("check-approved"); ck.add_argument("project")
    a = ap.parse_args()
    from app.engine import safe_name
    project = safe_name(a.project)

    if a.cmd == "present":
        present(project)
    elif a.cmd == "approve":
        print(json.dumps(_decision(project, "approved", a.note), ensure_ascii=False))
    elif a.cmd == "revise":
        print(json.dumps(_decision(project, "changes", a.note), ensure_ascii=False))
    elif a.cmd == "check-approved":
        ok, why = approval_state(project)
        print(why)
        sys.exit(0 if ok else 3)
    elif a.cmd == "open" and PU.is_headless() and not a.force:
        (ROOT / "input" / project).mkdir(parents=True, exist_ok=True)
        if not (ROOT / "work" / project / "handoff.json").exists():
            write_handoff(project, "collecting")
        print(f"headless: no Studio window. Collect the video + brief in chat, then `handoff.py present {project}`.")
    elif a.cmd == "open":
        (ROOT / "input" / project).mkdir(parents=True, exist_ok=True)
        if not (ROOT / "work" / project / "handoff.json").exists():
            write_handoff(project, "collecting")
        if not up():
            start_server()
        recent = STAMP.exists() and time.time() - STAMP.stat().st_mtime < 8 * 3600
        if a.force or not recent:
            open_window(f"{URL}/studio/#project={project}&tab={a.tab}")
            STAMP.parent.mkdir(exist_ok=True)
            STAMP.touch()
            print(f"MP Studio opened: {URL}/studio/  (project {project}, tab {a.tab})")
        else:
            print(f"MP Studio already open (the page follows project {project}); --force to open another window")
    elif a.cmd == "set":
        h = write_handoff(project, a.status, a.note)
        print(json.dumps(h, ensure_ascii=False))
    elif a.cmd == "wait" and PU.is_headless():
        print("headless: nothing to wait for - the user answers in chat. Use `handoff.py present`, then `approve`/`revise`.")
        sys.exit(4)
    elif a.cmd == "wait":
        want = set(a.want.split(","))
        p = ROOT / "work" / project / "handoff.json"
        start = read(p, {}).get("updated", 0)
        t0 = time.time()
        while time.time() - t0 < a.timeout:
            h = read(p, {})
            if h.get("status") in want and h.get("by") == "owner" and h.get("updated", 0) >= start:
                print(json.dumps(summary(project), ensure_ascii=False, separators=(",", ":")))
                return
            time.sleep(2)
        print(f"timeout: no owner action on {project} in {a.timeout:.0f}s")
        sys.exit(2)
    else:
        print(json.dumps(summary(project), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
