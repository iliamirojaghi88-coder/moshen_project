#!/usr/bin/env python3
"""Claude Code recovery-kit runner (stdlib only).

Dry run by default: it prints the plan and runs only read-only checks.
Nothing is installed, copied or registered without --apply. Credentials are
never read, written or exported; account/auth steps are printed as manual.

  python3 restore.py                         # plan for the current dir (dry run)
  python3 restore.py --apply --phase 3       # copy the .claude layer (never overwrites)
  python3 restore.py --apply --include-optional --phase 5
  python3 restore.py --verify                # PASS/FAIL for every item with a check
  python3 restore.py --generic --apply --phase 3 --target ../other-repo
"""
import argparse, json, os, platform, shutil, subprocess, sys
from pathlib import Path

KIT = Path(__file__).resolve().parent
OS_NAMES = {"Linux": "linux", "Darwin": "macos", "Windows": "windows"}
MANUAL_CATEGORIES = ("account-auth", "account-plugin", "connector", "cloud-environment", "external-service", "repository")
PAYLOAD_ENTRIES = (".claude", ".mcp.json", "skills-lock.json")


def load_inventory():
    return json.loads((KIT / "tools-inventory.json").read_text(encoding="utf-8"))


def command_for(cmds, osn):
    if not cmds:
        return None
    return cmds.get(osn) or (cmds.get("posix") if osn != "windows" else None)


def run(cmd, cwd, capture=False, env=None):
    bash = shutil.which("bash")
    args = [bash, "-c", cmd] if bash else ["powershell", "-NoProfile", "-Command", cmd]
    return subprocess.run(args, cwd=cwd, capture_output=capture, text=True, env=env)


def probe(cmd, cwd):
    """Read-only check; None when it cannot run (no bash on Windows)."""
    if not cmd or not shutil.which("bash"):
        return None
    return run(cmd, cwd, capture=True).returncode == 0


def payload_root(arg):
    if arg:
        return Path(arg).resolve()
    zipped = KIT / "payload" / "project"            # layout inside the ZIP
    if zipped.is_dir():
        return zipped
    repo = KIT.parents[1]                            # layout inside the git repo
    return repo if (repo / ".claude" / "skills").is_dir() else None


def copy_new(src, dst, apply):
    """Copy files that do not exist yet; never overwrite. Returns (new, kept)."""
    new = kept = 0
    files = [src] if src.is_file() else [Path(r) / f for r, _, fs in os.walk(src) for f in fs]
    for s in files:
        if "__pycache__" in s.parts:
            continue
        d = dst if src.is_file() else dst / s.relative_to(src)
        if d.exists():
            kept += 1
            continue
        new += 1
        if apply:
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(s, d)
    return new, kept


def restore_payload(item, args, target, inv):
    src = payload_root(args.payload)
    if src is None:
        return "FAIL", "payload not found: pass --payload <dir> (ZIP: payload/project, or a moshen_project checkout)"
    if src.resolve() == target.resolve():
        return "SKIP", "target is the payload source itself"
    notes = []
    if item["restore"]["method"] == "payload-global":
        home_skills = Path(os.path.expanduser("~")) / ".claude" / "skills"
        general = [i["name"] for i in inv["items"] if i["category"] == "skill" and not i["project_specific"]]
        new = kept = 0
        for s in general:
            n, k = copy_new(src / ".claude" / "skills" / s, home_skills / s, args.apply)
            new, kept = new + n, kept + k
        return ("DONE" if args.apply else "PLAN"), f"{len(general)} general skills → {home_skills}: {new} new files, {kept} kept"
    for entry in PAYLOAD_ENTRIES:
        s = src / entry
        if not s.exists():
            notes.append(f"{entry}: missing in payload")
            continue
        if args.generic and entry == ".mcp.json":
            s = KIT / "templates" / "mcp.general.json"
        n, k = copy_new(s, target / entry, args.apply)
        notes.append(f"{entry}: {n} new, {k} kept")
    if args.generic:
        settings = target / ".claude" / "settings.json"
        if args.apply and settings.exists() and settings.read_bytes() == (src / ".claude" / "settings.json").read_bytes():
            shutil.copy2(KIT / "templates" / "settings.general.json", settings)  # project hooks call scripts the target lacks
            notes.append("settings.json ← templates/settings.general.json")
        elif not args.apply:
            notes.append("settings.json would be the general template (no project scripts)")
    return ("DONE" if args.apply else "PLAN"), "; ".join(notes)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="really run (default: dry run)")
    ap.add_argument("--verify", action="store_true", help="only run read-only checks and report PASS/FAIL")
    ap.add_argument("--target", default=".", help="project directory to restore into (default: cwd)")
    ap.add_argument("--payload", help="payload dir (ZIP: payload/project) or a moshen_project checkout")
    ap.add_argument("--phase", help="comma list of phases, e.g. 0,1,3")
    ap.add_argument("--only", help="comma list of item ids")
    ap.add_argument("--include-optional", action="store_true")
    ap.add_argument("--include-sensitive", action="store_true", help="allow security/privacy-sensitive installs")
    ap.add_argument("--generic", action="store_true", help="target is not moshen_project: general settings/MCP templates")
    ap.add_argument("--os", choices=["linux", "macos", "windows"], help="plan for another OS (dry run only)")
    ap.add_argument("--json-log", help="write results as JSON")
    args = ap.parse_args()

    inv = load_inventory()
    osn = args.os or OS_NAMES.get(platform.system(), "linux")
    if args.os and args.apply and args.os != OS_NAMES.get(platform.system()):
        sys.exit("--os is for planning only; drop --apply")
    target = Path(args.target).resolve()
    phases = {int(p) for p in args.phase.split(",")} if args.phase else None
    only = set(args.only.split(",")) if args.only else None
    is_repo = (target / "scripts" / "setup-motion-env.sh").is_file()
    mode = "VERIFY" if args.verify else ("APPLY" if args.apply else "DRY RUN")
    print(f"# Claude Code recovery kit — {mode} — os={osn} target={target} moshen_project={'yes' if is_repo else 'no'}")

    results = []
    items = [i for i in inv["items"] if i.get("restore")]
    items.sort(key=lambda i: i["restore"]["phase"])
    for it in items:
        r = it["restore"]
        if phases is not None and r["phase"] not in phases:
            continue
        if only is not None and it["id"] not in only:
            continue
        check = r.get("check")
        if args.verify:
            if not check:
                continue
            ok = probe(check, target)
            status = "UNKNOWN" if ok is None else ("PASS" if ok else ("FAIL" if not (r.get("optional") or it["project_specific"] and not is_repo) else "ABSENT"))
            results.append((it["id"], status, check))
            print(f"[{status:7}] {it['id']}")
            continue
        method = r["method"]
        if method == "bundle":
            continue  # restored as part of payload:project-claude-layer
        if only is None and r.get("optional") and not args.include_optional:
            results.append((it["id"], "SKIP", "optional (use --include-optional)")); continue
        if (r.get("sensitive") or it["sensitive"]) and not args.include_sensitive:
            results.append((it["id"], "SKIP", "sensitive (review it, then --include-sensitive)")); continue
        if r.get("needs_repo") and not is_repo:
            results.append((it["id"], "SKIP", "needs a moshen_project checkout as --target")); continue
        if method in ("payload", "payload-global"):
            status, note = restore_payload(it, args, target, inv)
            results.append((it["id"], status, note)); continue
        cmd = command_for(r.get("commands"), osn)
        if not cmd:
            results.append((it["id"], "N/A", f"no command for {osn}")); continue
        present = probe(check, target) if not args.os else None
        if present:
            results.append((it["id"], "SKIP", "already present")); continue
        if not args.apply:
            results.append((it["id"], "PLAN", cmd)); continue
        print(f"\n==> [{it['id']}] {cmd}", flush=True)
        rc = run(cmd, target).returncode
        results.append((it["id"], "DONE" if rc == 0 else "FAIL", f"exit {rc}: {cmd}"))

    if not args.verify:
        for it_id, status, note in results:
            print(f"[{status:4}] phase {next(i['restore']['phase'] for i in items if i['id'] == it_id)} {it_id}: {note}")
        manual = [i for i in inv["items"] if i["category"] in MANUAL_CATEGORIES and (phases is None or 2 in phases or 8 in phases)]
        if manual and only is None:
            print("\n# Manual steps (credentials and account links are never automated):")
            for i in manual:
                print(f"[MANUAL] {i['name']}: {i['install']}" + (f"  (auth: {i['auth']})" if i["auth"] != "none" else ""))

    counts = {}
    for _, s, _ in results:
        counts[s] = counts.get(s, 0) + 1
    print("\n# Summary:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "nothing selected")
    if args.json_log:
        Path(args.json_log).write_text(json.dumps([dict(id=a, status=b, note=c) for a, b, c in results], ensure_ascii=False, indent=1), encoding="utf-8")
    sys.exit(1 if counts.get("FAIL") and not args.verify else 0)


if __name__ == "__main__":
    main()
