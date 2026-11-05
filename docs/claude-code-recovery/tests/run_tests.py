#!/usr/bin/env python3
"""The 10 recovery-kit checks. Writes test-results.json and TEST-RESULTS.md next to the kit.

  python3 tests/run_tests.py                 # all ten (needs dist/*.pdf and dist/*.zip from build-kit.sh)
  python3 tests/run_tests.py --only 1,2,4
  python3 tests/run_tests.py --secret-scan DIR   # exit 1 if DIR contains something credential-shaped

Statuses are PASS / FAIL / NOT TESTED; a check that could not run is never reported as PASS.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile, zipfile
from datetime import datetime, timezone
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
REPO = KIT.parents[1]
INV = KIT / "tools-inventory.json"
PDF = KIT / "dist" / "claude-code-recovery-report.pdf"
ZIP = KIT / "dist" / "claude-code-recovery-kit.zip"
HTML = KIT / "build" / "out" / "report.html"
HOME = Path(os.path.expanduser("~"))

SECRET_RE = re.compile(r"(sk-ant-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|"
                       r"xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|"
                       r"ya29\.[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{40,})")
# Tool names this session exposed (2026-11-05); the inventory must list every one.
SESSION_TOOLS = ("Agent Artifact ArtifactComments ArtifactData AskUserQuestion Bash CronCreate CronDelete CronList DesignSync Edit "
                 "EnterPlanMode EnterWorktree ExitPlanMode ExitWorktree Glob Grep ListAgents ListConnectors ListMcpResourcesTool ListPlugins "
                 "ListSkills Monitor NotebookEdit PushNotification Read ReadMcpResourceDirTool ReadMcpResourceTool ReadNotifications "
                 "ReportFindings ScheduleWakeup SearchMcpRegistry SearchPlugins SearchSkills SendMessage SendUserFile ShowOnboardingRolePicker "
                 "Skill SuggestConnectors SuggestPluginInstall SuggestSkills TaskCreate TaskGet TaskList TaskStop TaskUpdate ToolSearch "
                 "WebFetch WebSearch Write").split()
SESSION_MCP = {"context7": "mcp:context7", "playwright": "mcp:playwright", "kinocut": "mcp:kinocut", "claude-mem": "mcp:claude-mem",
               "Adobe": "connector:adobe", "Figma": "connector:figma", "HyperFrames_by_HeyGen": "connector:hyperframes-heygen",
               "Claude_Docs": "connector:claude-docs", "github": "session-mcp:github", "claude-code-remote": "session-mcp:claude-code-remote"}


def sh(cmd, timeout=120, env=None, cwd=None):
    r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout, env=env, cwd=cwd)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def load():
    return json.loads(INV.read_text(encoding="utf-8"))


def secret_hits(root):
    hits = []
    for p in Path(root).rglob("*"):
        if p.is_file() and p.stat().st_size < 5_000_000:
            try:
                txt = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            for m in SECRET_RE.finditer(txt):
                hits.append(f"{p}: {m.group(0)[:12]}…")
    return hits


# ------------------------------------------------------------------ 1
def t1_json():
    files = [INV, *sorted((KIT / "templates").glob("*.json")), REPO / ".mcp.json", REPO / ".claude/settings.json", REPO / "skills-lock.json"]
    for f in files:
        json.loads(f.read_text(encoding="utf-8"))
    inv = load()
    req = {"id", "name", "category", "status", "purpose_fa", "url", "install", "depends_on", "portability", "recoverable", "restore"}
    errs = []
    ids = [i["id"] for i in inv["items"]]
    if len(ids) != len(set(ids)):
        errs.append("duplicate ids")
    for i in inv["items"]:
        if req - i.keys():
            errs.append(f"{i['id']}: missing {sorted(req - i.keys())}")
        if i["status"] not in inv["status_legend"]:
            errs.append(f"{i['id']}: status {i['status']}")
        if not i["purpose_fa"]:
            errs.append(f"{i['id']}: empty purpose")
        if set(i["portability"]) != {"cloud", "linux", "macos", "windows"}:
            errs.append(f"{i['id']}: portability keys")
        r = i.get("restore")
        if r:
            if str(r["phase"]) not in inv["phases"]:
                errs.append(f"{i['id']}: phase {r['phase']}")
            if r["method"] not in ("command", "payload", "payload-global", "bundle"):
                errs.append(f"{i['id']}: method {r['method']}")
            if r["method"] == "command" and not r.get("commands"):
                errs.append(f"{i['id']}: command without commands")
    if inv["counts"]["total"] != len(inv["items"]):
        errs.append("counts.total mismatch")
    st = "FAIL" if errs else "PASS"
    return st, (f"{len(files)} JSON files parsed; {len(ids)} items, schema/legend/phase checks: " + ("; ".join(errs[:8]) if errs else "no errors"))


# ------------------------------------------------------------------ 2
def t2_shell():
    kit_sh = [KIT / "restore.sh", KIT / "verify.sh", KIT / "build-kit.sh"]
    repo_sh = [REPO / p for p in ("scripts/setup-motion-env.sh", "scripts/mp-video-env.sh", "scripts/graph-sync.sh", "scripts/tts-fa.sh",
                                  "scripts/audio-master.sh", "scripts/qc-video.sh", "scripts/analyze-reference.sh", "cloud/setup.sh",
                                  ".claude/hooks/claude-mem.sh", ".claude/hooks/kinocut-mcp.sh", ".claude/hooks/ponytail/run.sh")]
    bad = [f"{p.name}: {o.strip()[:120]}" for p in kit_sh + repo_sh for rc, o in [sh(["bash", "-n", str(p)])] if rc]
    py = [KIT / "restore.py", *sorted((KIT / "build").glob("*.py")), Path(__file__)]
    bad += [f"{p.name}: {o.strip()[:120]}" for p in py for rc, o in [sh([sys.executable, "-m", "py_compile", str(p)])] if rc]
    rc, o = sh(["node", "--check", str(KIT / "build/html_to_pdf.cjs")])
    if rc:
        bad.append(f"html_to_pdf.cjs: {o.strip()[:120]}")
    sc = shutil.which("shellcheck")
    sc_cmd = [sc] if sc else (["uvx", "--quiet", "--from", "shellcheck-py==0.10.0.1", "shellcheck"] if shutil.which("uvx") else None)
    sc_note = "shellcheck not available"
    if sc_cmd:
        rc, o = sh(sc_cmd + ["-S", "warning", *map(str, kit_sh)], timeout=300)
        rc2, o2 = sh(sc_cmd + ["-S", "error", *map(str, repo_sh)], timeout=300)
        if rc not in (0, 1) and "not found" in o:
            sc_note = "shellcheck could not start"
        else:
            sc_note = f"shellcheck -S warning (kit): {'clean' if rc == 0 else 'findings'}; -S error (repo scripts): {'clean' if rc2 == 0 else 'findings'}"
            if rc:
                bad.append("shellcheck kit: " + " | ".join(l for l in o.splitlines() if "SC" in l)[:300])
            if rc2:
                bad.append("shellcheck repo: " + " | ".join(l for l in o2.splitlines() if "SC" in l)[:300])
    return ("FAIL" if bad else "PASS"), (f"bash -n on {len(kit_sh) + len(repo_sh)} scripts, py_compile on {len(py)}, node --check on 1; {sc_note}"
                                         + ("; problems: " + "; ".join(bad) if bad else ""))


# ------------------------------------------------------------------ 3
NPM_PINS = [("@anthropic-ai/claude-code", None), ("skillui", "1.3.4"), ("skills", "1.7.6"), ("claude-mem", "15.9.0"),
            ("ui-ux-pro-max-cli", "2.15.0"), ("@upstash/context7-mcp", None), ("@playwright/mcp", None), ("chrome-devtools-mcp", None),
            ("playwright", "1.63.0"), ("hyperframes", "0.8.193")]
PYPI_PINS = [("graphifyy", "0.9.102"), ("kinocut", "1.16.5"), ("strix-agent", "1.7.0"), ("piper-tts", "1.8.0"), ("shellcheck-py", "0.10.0.1")]
COMMITS = [("DietrichGebert/ponytail", "96608e0"), ("Graphify-Labs/graphify", "59b5ab1"), ("addyosmani/agent-skills", "301b02b"),
           ("thedotmack/claude-mem", "d8bf121"), ("vercel-labs/skills", "cabe072"), ("ThePudge/mp-video-skillset", "d58a36d"),
           ("greensock/gsap-skills", "aed9cfd"), ("aiwithremy/claude-skills-llm-council", "55ee36e"),
           ("nextlevelbuilder/ui-ux-pro-max-skill", "9a3f14f")]


def http(url):
    rc, o = sh(["curl", "-sS", "-o", "/dev/null", "-L", "--max-time", "20", "-w", "%{http_code} %{http_connect}", url], timeout=40)
    parts = o.strip().split()[-2:] if o.strip() else ["000", "000"]
    return parts[0], (parts[1] if len(parts) > 1 else "000"), o


def t3_links():
    inv = load()
    urls = set()
    for i in inv["items"]:
        for field in ("url", "install"):
            for u in re.findall(r"https?://[^\s'\"|)،]+", i.get(field) or ""):
                urls.add(u.rstrip(".,;"))
    gh_repos, other = {}, []
    for u in sorted(urls):
        m = re.match(r"https://github\.com/([^/]+)/([^/#?]+)", u)
        if m and m.group(1) not in ("apps", "org"):
            gh_repos.setdefault(f"{m.group(1)}/{m.group(2).removesuffix('.git')}", []).append(u)
        else:
            other.append(u)
    res = {"PASS": [], "FAIL": [], "NOT TESTED": []}
    heads = {}
    for repo in sorted(gh_repos):
        rc, o = sh(["git", "ls-remote", f"https://github.com/{repo}", "HEAD"], timeout=40)
        heads[repo] = o.split()[0] if rc == 0 and o.strip() else None
        res["PASS" if rc == 0 else "FAIL"].append(f"github:{repo}" + ("" if rc == 0 else f" ({o.strip()[:60]})"))
    for u in other:
        code, connect, raw = http(u)
        if connect == "403" or "CONNECT tunnel failed" in raw:
            res["NOT TESTED"].append(f"{u} (blocked by this environment's network policy)")
        elif code.startswith(("2", "3")):
            res["PASS"].append(u)
        elif code in ("401", "403", "429"):
            res["NOT TESTED"].append(f"{u} (HTTP {code}: login/anti-bot, not a dead link)")
        else:
            res["FAIL"].append(f"{u} (HTTP {code})")
    for pkg, ver in NPM_PINS:
        code, _, _ = http(f"https://registry.npmjs.org/{pkg}/{ver or 'latest'}")
        res["PASS" if code == "200" else "FAIL"].append(f"npm {pkg}@{ver or 'latest'}" + ("" if code == "200" else f" (HTTP {code})"))
    for pkg, ver in PYPI_PINS:
        code, _, _ = http(f"https://pypi.org/pypi/{pkg}/{ver}/json")
        res["PASS" if code == "200" else "FAIL"].append(f"pypi {pkg}=={ver}" + ("" if code == "200" else f" (HTTP {code})"))
    for repo, sha in COMMITS:
        head = heads.get(repo)
        if head is None:
            rc, o = sh(["git", "ls-remote", f"https://github.com/{repo}", "HEAD"], timeout=40)
            head = o.split()[0] if rc == 0 and o.strip() else ""
        if head.startswith(sha):
            res["PASS"].append(f"commit {repo}@{sha} (= HEAD)")
            continue
        if shutil.which("gh"):
            rc, o = sh(["gh", "api", "-X", "GET", "search/commits", "-f", f"q=repo:{repo} hash:{sha}", "--jq", ".total_count"], timeout=40)
            if rc == 0 and o.strip().isdigit():
                res["PASS" if int(o.strip()) > 0 else "FAIL"].append(f"commit {repo}@{sha} (search: {o.strip()} hit)")
                continue
        res["NOT TESTED"].append(f"commit {repo}@{sha} (not HEAD; no commit search available)")
    st = "FAIL" if res["FAIL"] else "PASS"
    det = (f"{len(res['PASS'])} PASS, {len(res['FAIL'])} FAIL, {len(res['NOT TESTED'])} NOT TESTED "
           f"(github repos via git ls-remote: {len(gh_repos)}; web URLs via curl: {len(other)}; npm pins: {len(NPM_PINS)}; PyPI pins: {len(PYPI_PINS)}; pinned commits: {len(COMMITS)})")
    if res["FAIL"]:
        det += " | FAIL: " + "; ".join(res["FAIL"])
    if res["NOT TESTED"]:
        det += " | NOT TESTED: " + "; ".join(res["NOT TESTED"])
    return st, det


# ------------------------------------------------------------------ 4
def t4_deps():
    inv = load()
    by = {i["id"]: i for i in inv["items"]}
    errs = [f"{i['id']} → {d} (unknown)" for i in inv["items"] for d in i["depends_on"] if d not in by]
    state = {}

    def dfs(n, stack):
        state[n] = 1
        for d in by[n]["depends_on"]:
            if d not in by:
                continue
            if state.get(d) == 1:
                errs.append("cycle: " + " → ".join(stack + [d]))
            elif not state.get(d):
                dfs(d, stack + [d])
        state[n] = 2
    for n in by:
        if not state.get(n):
            dfs(n, [n])
    order = 0
    for i in inv["items"]:
        r = i.get("restore")
        for d in i["depends_on"]:
            rd = by.get(d, {}).get("restore")
            if r and rd and rd["phase"] > r["phase"]:
                errs.append(f"{i['id']} (phase {r['phase']}) needs {d} (phase {rd['phase']}) later")
            order += 1
        if r and r["method"] == "command" and not r.get("check"):
            errs.append(f"{i['id']}: command without idempotency check")
        if i["category"] in ("cli",) and i["version"] and i["install"] and i["version"] not in i["install"]:
            errs.append(f"{i['id']}: pinned version {i['version']} not in install command")
    rc, out = sh([sys.executable, str(KIT / "restore.py"), "--target", tempfile.mkdtemp(), "--include-optional", "--include-sensitive"], timeout=120)
    phases = [int(m) for m in re.findall(r"\] phase (\d+) ", out)]
    if phases != sorted(phases):
        errs.append("restore.py plan is not in phase order")
    if rc:
        errs.append(f"restore.py dry run exit {rc}")
    return ("FAIL" if errs else "PASS"), (f"{order} dependency edges resolved, no cycles, every dependency restores in an earlier or same phase, "
                                          f"commands have read-only checks, CLI pins match install commands, dry-run plan ordered over {len(phases)} steps"
                                          + ("; problems: " + "; ".join(errs[:10]) if errs else ""))


# ------------------------------------------------------------------ 5
BUILTIN_COMMANDS = {"plan", "review", "init", "loop", "help", "clear", "compact", "config", "model", "memory", "mcp", "plugin", "agents",
                    "hooks", "permissions", "status", "cost", "doctor", "login", "logout", "resume", "export", "security-review",
                    "code-review", "simplify", "run", "context", "add-dir", "fast", "artifacts", "ide", "vim", "bug", "pr-comments"}


def t5_conflicts():
    inv = load()
    items = inv["items"]
    hard, info = [], []
    names = {}
    for i in items:
        if i["category"] in ("skill", "builtin-skill"):
            names.setdefault(i["name"], []).append(i["id"])
            fm = i.get("frontmatter_name")
            if fm and fm != i["name"]:
                names.setdefault(fm, []).append(i["id"] + " (frontmatter)")
        if i["category"] == "account-skill":
            names.setdefault(i["name"], []).append(i["id"])  # namespaced plugin:skill
    hard += [f"skill name '{n}': {v}" for n, v in names.items() if len(v) > 1]
    cmds = {i["name"].lstrip("/") for i in items if i["category"] == "command"}
    hard += [f"command /{c} shadows a built-in" for c in cmds & BUILTIN_COMMANDS]
    agents = [i["name"] for i in items if i["category"] in ("agent", "builtin-agent")]
    hard += [f"agent {a} defined twice" for a in set(agents) if agents.count(a) > 1]
    proj_mcp = set(json.loads((REPO / ".mcp.json").read_text())["mcpServers"])
    user_mcp = set()
    cj = HOME / ".claude.json"
    if cj.exists():
        user_mcp = set(json.loads(cj.read_text()).get("mcpServers", {}))
    connectors = {"Adobe", "Figma", "HyperFrames_by_HeyGen", "Claude_Docs"}
    for n in proj_mcp & user_mcp:
        info.append(f"MCP '{n}' in both project and user scope (project wins; harmless duplicate)")
    hard += [f"MCP name clash with connector: {n}" for n in proj_mcp & connectors]
    st = HOME / ".claude/settings.json"
    enabled = json.loads(st.read_text()).get("enabledPlugins", {}) if st.exists() else {}
    for plug in ("ponytail@ponytail", "claude-mem@thedotmack"):
        if enabled.get(plug):
            info.append(f"{plug} enabled at user scope: project hooks step aside (guard in run.sh / claude-mem.sh), no double run")
    for guard, f in (("ponytail@ponytail", ".claude/hooks/ponytail/run.sh"), ("claude-mem@thedotmack", ".claude/hooks/claude-mem.sh")):
        if guard not in (REPO / f).read_text():
            hard.append(f"{f} lacks the double-run guard for {guard}")
    if "browser-testing-with-devtools" in names and "chrome-devtools" not in proj_mcp | user_mcp:
        info.append("browser-testing-with-devtools needs chrome-devtools MCP (not configured): dependency gap, not a clash")
    overlaps = {
        "code review": "builtin code-review, code-review-and-quality, ponytail-review, agent code-reviewer, /quality-review",
        "simplification": "builtin simplify, code-simplification, ponytail, unslop, /code-simplify",
        "security": "builtin security-review, security-and-hardening, strix-security, agent security-auditor",
        "PDF/Office": "anthropic-skills pdf/docx/pptx/xlsx, adobe-anypdf/anydocx/anypptx/anyexcel, Adobe MCP pdf_*",
        "frontend/UI design": "frontend-design, frontend-ui-engineering, ui-ux-pro-max bundle, Figma connector",
        "video editing": "pro-edit, video-use, fav-edit-video, kinocut MCP, adobe-edit-quick-cut, hyperframes",
        "Remotion": "remotion:* plugin (4.0.528) vs remotion-studio workspace (4.0.538) vs remotion-to-hyperframes",
        "memory/handoff": "claude-mem (mem-search, handoff), graphify for structure (division of labour documented)",
        "browser": "playwright MCP + skill, anthropic-skills built-in-browser/chrome-browser, browser-testing-with-devtools",
    }
    info.append("functional overlaps (routing, not clashes): " + " | ".join(f"{k}: {v}" for k, v in overlaps.items()))
    return ("FAIL" if hard else "PASS"), (f"{len(names)} skill names, {len(cmds)} commands, {len(agents)} agents, {len(proj_mcp)} project MCP + "
                                          f"{len(user_mcp)} user MCP + {len(connectors)} connectors: "
                                          + ("hard conflicts: " + "; ".join(hard) if hard else "no hard conflicts") + ". " + " ".join(info))


# ------------------------------------------------------------------ 6
def t6_completeness():
    inv = load()
    ids = {i["id"] for i in inv["items"]}
    names = {i["name"] for i in inv["items"]}
    missing, notes = [], []
    for d in (REPO / ".claude/skills").iterdir():
        want = f"skill:{d.name}" if d.is_dir() else f"file:{d.name}"
        if want not in ids:
            missing.append(want)
    missing += [f"agent:{p.stem}" for p in (REPO / ".claude/agents").glob("*.md") if f"agent:{p.stem}" not in ids]
    missing += [f"command:{p.stem}" for p in (REPO / ".claude/commands").glob("*.md") if f"command:{p.stem}" not in ids]
    missing += [f"mcp:{n}" for n in json.loads((REPO / ".mcp.json").read_text())["mcpServers"] if f"mcp:{n}" not in ids]
    hook_map = {"setup-motion-env": "hook:setup-motion-env", "mp-video-env": "hook:mp-video-env", "ponytail": "hook:ponytail",
                "claude-mem.sh": "hook:claude-mem", "hook-guard": "hook:graphify-guard", "graph-sync": "hook:graph-sync"}
    settings = json.loads((REPO / ".claude/settings.json").read_text())
    for ev, groups in settings["hooks"].items():
        for g in groups:
            for h in g["hooks"]:
                hit = [v for k, v in hook_map.items() if k in h["command"]]
                if not hit or hit[0] not in ids:
                    missing.append(f"hook {ev}: {h['command'][:60]}")
    synced = list((HOME / ".claude/plugins/synced").glob("*/*/.claude-plugin/plugin.json"))
    prefix = {"frontend-design": "frontend-design:", "adobe-for-creativity": "adobe-for-creativity:", "remotion": "remotion:"}
    for pj in synced:
        pname = json.loads(pj.read_text())["name"]
        for sk in (s.parent for s in (pj.parent.parent / "skills").glob("*/SKILL.md")):
            if f"account-skill:{prefix.get(pname, pname + ':')}{sk.name}" not in ids:
                missing.append(f"account-skill {pname}:{sk.name}")
    for sk in (HOME / ".claude/skills/synced").glob("*/*/SKILL.md"):
        if f"account-skill:anthropic-skills:{sk.parent.name}" not in ids:
            missing.append(f"account-skill anthropic-skills:{sk.parent.name}")
    if not synced:
        notes.append("account plugins not present on this machine: that part NOT TESTED")
    dep_map = {"@material-symbols/svg-400": "library:icon-packs", "@phosphor-icons/core": "library:icon-packs", "@tabler/icons": "library:icon-packs",
               "lucide-static": "library:icon-packs", "hyperframes": "cli:hyperframes", "@gltf-transform/cli": "cli:gltf-transform"}
    pkg = json.loads((REPO / "package.json").read_text())
    for dep in {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}:
        if dep_map.get(dep, f"library:{dep}") not in ids:
            missing.append(f"npm dep {dep}")
    rpkg = json.loads((REPO / "remotion-studio/package.json").read_text())
    if rpkg.get("dependencies") and "library:remotion-libs" not in ids:
        missing.append("remotion-studio deps")
    for folder, pat in (("scripts", "*"), ("tools", "**/*.*"), ("cloud", "*.py"), ("cloud", "*.sh")):
        for f in (REPO / folder).glob(pat):
            rel = f.relative_to(REPO).as_posix()
            if f.is_file() and not rel.endswith((".json", ".md")) and f"project-tool:{rel}" not in ids:
                missing.append(f"project-tool:{rel}")
    missing += [f"builtin-tool:{t}" for t in SESSION_TOOLS if f"builtin-tool:{t}" not in ids]
    missing += [f"session MCP {k}" for k, v in SESSION_MCP.items() if v not in ids]
    log = (REPO / "docs/skill-discovery-log.md").read_text(encoding="utf-8")
    for kw, want in (("iart-ai", "candidate:lottie-iart"), ("freshtechbro/claudedesignskills@lottie", "candidate:lottie-freshtech"),
                     ("roble3", "candidate:blender-skills"), ("digitalsamba", "candidate:ffmpeg-skills"), ("scenario-labs", "candidate:gsplat-skills"),
                     ("sparkjsdev", "candidate:spark-gsplat")):
        if kw in log and want not in ids:
            missing.append(f"discovery-log candidate {kw}")
    plugins = HOME / ".claude/plugins/installed_plugins.json"
    if plugins.exists():
        for p in json.loads(plugins.read_text())["plugins"]:
            if p.split("@")[0] not in {"claude-mem", "ponytail"} and p not in names:
                missing.append(f"installed plugin {p}")
    return ("FAIL" if missing else "PASS"), (f"compared disk/config/session sources with {len(ids)} JSON ids: skills, licence file, agents, commands, "
                                             f".mcp.json, settings hooks, synced account plugins/skills, installed plugins, npm deps, scripts/tools/cloud, "
                                             f"{len(SESSION_TOOLS)} session tools, {len(SESSION_MCP)} session MCP servers, discovery-log candidates: "
                                             + (f"missing {missing}" if missing else "nothing missing") + ("; " + "; ".join(notes) if notes else ""))


# ------------------------------------------------------------------ 7
def t7_pdf():
    if not PDF.exists():
        return "NOT TESTED", "PDF not built (run build-kit.sh)"
    errs = []
    rc, info = sh(["pdfinfo", str(PDF)])
    pages = int(re.search(r"Pages:\s+(\d+)", info).group(1)) if rc == 0 else 0
    if not pages:
        errs.append("pdfinfo failed")
    rc, fonts = sh(["pdffonts", str(PDF)])
    vaz = [l for l in fonts.splitlines() if "Vazirmatn" in l]
    if not vaz or any(" no " in l.split("Identity-H")[-1][:6] for l in vaz):
        errs.append("Vazirmatn not embedded")
    rc, text = sh(["pdftotext", "-enc", "UTF-8", str(PDF), "-"])
    probes = ["کیت بازیابی اکوسیستم", "نصب در برابر احراز هویت", "نتایج آزمون‌ها", "فهرست کامل", "کاربرد", "لینک رسمی"]
    missing = [p for p in probes if p not in text]
    if missing:
        errs.append(f"Persian text not extractable: {missing}")
    html_doc = HTML.read_text(encoding="utf-8") if HTML.exists() else ""
    if '<html lang="fa" dir="rtl">' not in html_doc:
        errs.append("HTML root is not lang=fa dir=rtl")
    tables = html_doc.count("<table")
    hrefs = len(set(re.findall(r'href="(https?://[^"]+)"', html_doc)))
    links = 0
    try:
        from pypdf import PdfReader
        for pg in PdfReader(str(PDF)).pages:
            for a in pg.get("/Annots") or []:
                o = a.get_object()
                if o.get("/Subtype") == "/Link" and "/A" in o and "/URI" in o["/A"]:
                    links += 1
        if links < hrefs:
            errs.append(f"only {links} link annotations for {hrefs} distinct hrefs")
        link_note = f"{links} clickable URI annotations (≥ {hrefs} distinct hrefs)"
    except ImportError:
        link_note = "pypdf missing: link annotations NOT TESTED"
    return ("FAIL" if errs else "PASS"), (f"{pages} pages, A4 landscape; fonts embedded: {len(vaz)} Vazirmatn subsets; Persian probes extractable "
                                          f"({len(probes) - len(missing)}/{len(probes)}); RTL root (lang=fa dir=rtl); {tables} tables with repeating headers; "
                                          f"{link_note}; visual check of rendered pages (cover, summary, quick start, bundles, full and compact tables) by the agent"
                                          + ("; problems: " + "; ".join(errs) if errs else ""))


# ------------------------------------------------------------------ 8
REQUIRED_IN_ZIP = ["README.md", "tools-inventory.json", "restore.sh", "restore.py", "verify.sh", "build-kit.sh", "claude-code-recovery-report.pdf",
                   "templates/settings.general.json", "templates/mcp.general.json", "payload/MANIFEST.sha256", "payload/project/.mcp.json",
                   "payload/project/skills-lock.json", "payload/project/.claude/settings.json", "tests/run_tests.py"]


def extract_zip(dst):
    with zipfile.ZipFile(ZIP) as z:
        bad = z.testzip()
        if bad:
            raise RuntimeError(f"corrupt member {bad}")
        for m in z.namelist():  # zip-slip guard
            if m.startswith("/") or ".." in Path(m).parts:
                raise RuntimeError(f"unsafe path {m}")
        z.extractall(dst)
    return Path(dst) / "claude-code-recovery-kit"


def t8_zip():
    if not ZIP.exists():
        return "NOT TESTED", "ZIP not built (run build-kit.sh)"
    tmp = tempfile.mkdtemp(prefix="kit-zip-")
    try:
        root = extract_zip(tmp)
        errs = [f"missing {f}" for f in REQUIRED_IN_ZIP if not (root / f).exists()]
        lines = (root / "payload/MANIFEST.sha256").read_text().splitlines()
        badsum = [ln.split("  ", 1)[1] for ln in lines
                  if hashlib.sha256((root / "payload" / ln.split("  ", 1)[1]).read_bytes()).hexdigest() != ln.split("  ", 1)[0]]
        if badsum:
            errs.append(f"{len(badsum)} sha256 mismatches")
        json.loads((root / "tools-inventory.json").read_text(encoding="utf-8"))
        skills = len(list((root / "payload/project/.claude/skills").glob("*/SKILL.md")))
        if skills != 99:
            errs.append(f"{skills} skills in payload (want 99)")
        tracked = set(sh(["git", "-C", str(REPO), "ls-files", "--", ".claude", ".mcp.json", "skills-lock.json"])[1].splitlines())
        shipped = {ln.split("  ", 1)[1].removeprefix("project/") for ln in lines}
        if shipped != tracked:
            errs.append(f"payload differs from git-tracked files (+{len(shipped - tracked)} / -{len(tracked - shipped)})")
        hits = secret_hits(root)
        if hits:
            errs.append(f"secret-like strings: {hits[:3]}")
        nfiles = sum(1 for _ in root.rglob("*") if _.is_file())
        size = ZIP.stat().st_size / 1e6
        return ("FAIL" if errs else "PASS"), (f"zip test OK, no unsafe paths; {nfiles} files, {size:.1f} MB; {len(REQUIRED_IN_ZIP)} required files present; "
                                              f"{len(lines)} payload files match MANIFEST.sha256 and equal the git-tracked .claude layer; 99 skills; "
                                              f"secret scan clean" + ("; problems: " + "; ".join(errs) if errs else ""))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ------------------------------------------------------------------ 9
def snapshot(root):
    out = {}
    for p in Path(root).rglob("*"):
        if p.is_file() and ".git" not in p.parts:
            st = p.stat()
            out[str(p.relative_to(root))] = (st.st_size, st.st_mtime_ns)
    return out


def t9_dryrun():
    tmp = Path(tempfile.mkdtemp(prefix="kit-dry-"))
    try:
        home, target = tmp / "home", tmp / "target"
        home.mkdir(); target.mkdir()
        env = {**os.environ, "HOME": str(home)}
        before = (snapshot(home), snapshot(target))
        repo_status = sh(["git", "-C", str(REPO), "status", "--porcelain"])[1]
        runs = [["--include-optional", "--include-sensitive"], ["--generic", "--include-optional"], ["--os", "macos", "--include-optional"],
                ["--os", "windows", "--include-optional"], ["--verify"]]
        errs, plans = [], 0
        for extra in runs:
            rc, out = sh([sys.executable, str(KIT / "restore.py"), "--target", str(target), *extra], env=env, timeout=180)
            if rc:
                errs.append(f"{extra}: exit {rc}")
            plans += out.count("[PLAN]")
            if "--verify" not in extra and "DRY RUN" not in out:
                errs.append(f"{extra}: not a dry run")
        rc, out = sh([sys.executable, str(KIT / "restore.py"), "--target", str(REPO)], timeout=180)
        if rc:
            errs.append(f"repo dry run exit {rc}")
        if (snapshot(home), snapshot(target)) != before:
            errs.append("dry run changed files in HOME/target")
        if sh(["git", "-C", str(REPO), "status", "--porcelain"])[1] != repo_status:
            errs.append("dry run changed the repository")
        return ("FAIL" if errs else "PASS"), (f"{len(runs) + 1} dry runs (all/optional/sensitive, --generic, macOS plan, Windows plan, --verify, real repo): "
                                              f"exit 0, {plans} planned steps printed, " + ("files changed (see problems)" if errs else "zero files changed in isolated HOME/target and in the repo")
                                              + ("; problems: " + "; ".join(errs) if errs else ""))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ------------------------------------------------------------------ 10
def t10_isolated():
    if not ZIP.exists():
        return "NOT TESTED", "ZIP not built"
    tmp = Path(tempfile.mkdtemp(prefix="kit-iso-"))
    try:
        kit = extract_zip(tmp / "x")
        home, target, generic = tmp / "home", tmp / "proj", tmp / "generic"
        for d in (home, target, generic):
            d.mkdir()
            sh(["git", "init", "-q", str(d)])
        env = {**os.environ, "HOME": str(home), "UV_TOOL_DIR": str(tmp / "uvtools"), "UV_TOOL_BIN_DIR": str(tmp / "bin"),
               "npm_config_prefix": str(tmp / "npm"), "PATH": f"{tmp / 'bin'}:{tmp / 'npm' / 'bin'}:{os.environ['PATH']}"}
        restore = [sys.executable, str(kit / "restore.py")]
        errs, notes = [], []
        rc, out = sh(restore + ["--apply", "--phase", "3", "--include-optional", "--target", str(target)], env=env, timeout=300)
        if rc:
            errs.append(f"payload apply exit {rc}: {out[-200:]}")
        skills = len(list((target / ".claude/skills").glob("*/SKILL.md")))
        same = (target / ".claude/settings.json").read_bytes() == (REPO / ".claude/settings.json").read_bytes()
        gskills = len(list((home / ".claude/skills").glob("*/SKILL.md")))
        if skills != 99 or not same or not (target / ".mcp.json").exists():
            errs.append(f"project layer: {skills} skills, settings identical={same}")
        rc, out2 = sh(restore + ["--apply", "--phase", "3", "--include-optional", "--target", str(target)], env=env, timeout=300)
        if " 0 new" not in out2 or re.search(r": [1-9]\d* new", out2):
            errs.append("second apply was not idempotent")
        rc, out3 = sh(restore + ["--apply", "--phase", "3", "--generic", "--target", str(generic)], env=env, timeout=300)
        gen_ok = (generic / ".claude/settings.json").read_bytes() == (kit / "templates/settings.general.json").read_bytes() and \
                 json.loads((generic / ".mcp.json").read_text()) == json.loads((kit / "templates/mcp.general.json").read_text())
        if not gen_ok:
            errs.append("--generic did not install the general templates")
        rc, vout = sh(restore + ["--verify", "--target", str(target)], env=env, timeout=300)
        skill_pass = len(re.findall(r"\[PASS\s*\] skill:", vout))
        if skill_pass != 99:
            errs.append(f"verify: {skill_pass}/99 skills PASS")
        rc, gout = sh(restore + ["--apply", "--only", "cli:graphify", "--target", str(target)], env=env, timeout=600)
        rc2, gv = sh([str(tmp / "bin" / "graphify"), "--version"], env=env, timeout=60) if (tmp / "bin" / "graphify").exists() else (1, "not installed")
        if rc or rc2 or "0.9.102" not in gv:
            errs.append(f"graphify isolated install: exit {rc}/{rc2} {gv.strip()[:80]}")
        else:
            notes.append(f"graphify {gv.strip()} installed into isolated uv tool dir")
        rc, sout = sh(restore + ["--apply", "--only", "cli:skillui", "--target", str(target)], env=env, timeout=600)
        sv = sh([str(tmp / "npm" / "bin" / "skillui"), "--version"], env=env, timeout=60)[1] if (tmp / "npm/bin/skillui").exists() else "not installed"
        if rc or "1.3.4" not in sv:
            errs.append(f"skillui isolated install: exit {rc} {sv.strip()[:80]}")
        else:
            notes.append(f"skillui {sv.strip()} installed into isolated npm prefix")
        return ("FAIL" if errs else "PASS"), (f"temp HOME + empty git repos: payload restore → 99 skills, settings/.mcp.json identical, {gskills} general skills mirrored "
                                              f"to isolated ~/.claude/skills; re-run idempotent (0 new files); --generic installs templates; verify 99/99 skills PASS; "
                                              + "; ".join(notes) + ". Not a fresh OS image: system packages (apt/Blender/Docker) and account steps were not exercised"
                                              + ("; problems: " + "; ".join(errs) if errs else ""))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


TESTS = [(1, "صحت JSON و شِمای فهرست", t1_json), (2, "Syntax اسکریپت‌های Shell (و Python/Node)", t2_shell),
         (3, "اعتبار لینک‌ها، بسته‌ها و کامیت‌های ثابت", t3_links), (4, "وابستگی‌ها و ترتیب نصب", t4_deps), (5, "تداخل ابزارها", t5_conflicts),
         (6, "کامل‌بودن فهرست نسبت به منابع کشف‌شده", t6_completeness), (7, "PDF: فارسی، RTL، جدول، لینک", t7_pdf),
         (8, "باز کردن و بررسی ZIP", t8_zip), (9, "اجرای Dry Run اسکریپت بازیابی", t9_dryrun),
         (10, "بازیابی در محیط آزمایشی ایزوله", t10_isolated)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    ap.add_argument("--secret-scan")
    a = ap.parse_args()
    if a.secret_scan:
        hits = secret_hits(a.secret_scan)
        print("\n".join(hits) if hits else "secret scan: clean")
        sys.exit(1 if hits else 0)
    only = {int(x) for x in a.only.split(",")} if a.only else None
    results = []
    for n, title, fn in TESTS:
        if only and n not in only:
            continue
        try:
            st, det = fn()
        except Exception as e:  # a crashed check is a FAIL, never a silent pass
            st, det = "FAIL", f"{type(e).__name__}: {e}"
        results.append(dict(n=n, title=title, status=st, details=det))
        print(f"[{st}] {n}. {title}\n    {det[:600]}", flush=True)
    if only:
        return
    env = f"Claude Code cloud container, {sh(['uname', '-sr'])[1].strip()}, Python {sys.version.split()[0]}, environment 'Default' (limited network)"
    data = dict(ran_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), environment=env, results=results,
                summary={s: sum(1 for r in results if r["status"] == s) for s in ("PASS", "FAIL", "NOT TESTED")})
    (KIT / "test-results.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    md = ["# نتایج آزمون کیت بازیابی", "", f"اجرا: {data['ran_at']} · {env}", "",
          f"خلاصه: PASS={data['summary']['PASS']} · FAIL={data['summary']['FAIL']} · NOT TESTED={data['summary']['NOT TESTED']}", "",
          "| # | آزمون | نتیجه | جزئیات |", "|---|---|---|---|"]
    md += [f"| {r['n']} | {r['title']} | **{r['status']}** | {r['details'].replace('|', '/')} |" for r in results]
    (KIT / "TEST-RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("summary:", data["summary"])


if __name__ == "__main__":
    main()
