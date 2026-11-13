#!/usr/bin/env python3
"""Package METRICA for a Linux shared host (DirectAdmin: Apache/LiteSpeed + PHP + MySQL).

Input : metrica/dist/metrica-webapp.html   (built by metrica/panels/build.py — the approved single-file app)
        metrica/host/{public_html,metrica_private,database}, README-FA.md
Output: metrica/dist/METRICA_HOST_READY.zip     extract inside domains/<your-domain>/ (README-FA.md)
        metrica/dist/host/                       the same tree, unzipped (used by the tests)
        metrica/dist/index.html                  the standalone single-file app (no backend: sign-in stays closed)

The page is the same document, only moved out of the single file: every <style> goes, in order, into one
stylesheet; every <script> becomes a file loaded at the same place; embedded images and fonts become files.
Nothing is added except assets/js/config.*.js, which points the panels at api/index.php next to index.html.

    python3 metrica/panels/build.py && python3 metrica/host/build_host.py
"""
import base64, hashlib, os, re, secrets, shutil, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DIST = ROOT / "dist"
SINGLE = DIST / "metrica-webapp.html"
TREE = DIST / "host"
ZIP = DIST / "METRICA_HOST_READY.zip"

KIND = {"image/png": ("img", "png"), "image/webp": ("img", "webp"), "image/jpeg": ("img", "jpg"), "image/svg+xml": ("img", "svg"),
        "font/woff2": ("fonts", "woff2"), "font/woff": ("fonts", "woff"), "font/ttf": ("fonts", "ttf")}
DATA = re.compile(r"data:([a-z]+/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)")
BLOCK = re.compile(r"<(style|script)\b([^>]*)>")
CONFIG_JS = "window.METRICA_CONFIG = { apiBase: 'api/index.php' }; // the API sits next to index.html: no domain is written anywhere\n"


def split(html):
    files = {}

    def save(folder, ext, data, name=""):
        path = f"assets/{folder}/{name + '.' if name else ''}{hashlib.sha256(data).hexdigest()[:12]}.{ext}"
        files[path] = data
        return path

    def unembed(text, prefix):  # prefix: how the text's own location reaches assets/
        def one(m):
            assert m.group(1) in KIND, f"unknown embedded type {m.group(1)}"
            folder, ext = KIND[m.group(1)]
            return prefix + save(folder, ext, base64.b64decode(m.group(2)))[len("assets/"):]
        return DATA.sub(one, text)

    body = html.index("<body")
    parts, css, i, n = [], [], 0, 0
    while (m := BLOCK.search(html, i)):
        tag, close = m.group(1), f"</{m.group(1)}>"
        end = html.index(close, m.end())
        content = html[m.end():end]
        parts.append(unembed(html[i:m.start()], "assets/"))
        if tag == "style":
            assert m.start() < body and not m.group(2).strip(), "styles are expected in <head>, without attributes"
            if not css:
                parts.append("\x00STYLESHEET\x00")
            css.append(content)
        else:
            assert "src=" not in m.group(2) and "type=" not in m.group(2), "only plain inline scripts are expected"
            n += 1
            named = re.match(r"\s*/\*\s*assets/([\w/.-]+?)(?:\.min)?\.js", content)
            name = f"{n:02d}-" + (named.group(1).replace("/", "-").removeprefix("js-") if named else "inline")
            parts.append(f'<script src="{save("js", "js", content.encode(), name)}"></script>')
        i = end + len(close)
    parts.append(unembed(html[i:], "assets/"))

    sheet = unembed("\n".join(css), "../")
    assert not re.search(r"url\(\s*(?!['\"]?(?:data:|#|\.\./))", sheet), "a stylesheet url() would change meaning when moved"
    page = "".join(parts).replace("\x00STYLESHEET\x00", f'<link rel="stylesheet" href="{save("css", "css", sheet.encode(), "metrica")}">', 1)
    config = save("js", "js", CONFIG_JS.encode(), "00-config")
    page = page.replace("<script", f'<script src="{config}"></script>\n<script', 1)
    assert ";base64," not in page and ";base64," not in sheet
    return page, files


def pack(tree, zip_path):
    zip_path.unlink(missing_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(tree.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(tree).as_posix())


# a package for one host with its settings already in config.php. The values come only from the environment
# (never from this file or git); the result is private: dist/ is git-ignored and the ZIP must not stay on the web.
FILL = {"DB_NAME": "METRICA_DB_NAME", "DB_USER": "METRICA_DB_USER", "DB_PASS": "METRICA_DB_PASS",
        "API_KEY": "METRICA_API_KEY", "PATTERN_UID": "METRICA_PATTERN_UID", "SMS_SENDER": "METRICA_SMS_SENDER"}


def personal():
    values = {k: os.environ[env] for k, env in FILL.items() if os.environ.get(env)}
    for k, v in values.items():
        assert re.fullmatch(r"[^\\\"$\n]+", v), f"{k}: quotes, backslashes, $ and line breaks are not allowed"
    out = DIST / (os.environ.get("METRICA_ZIP_NAME") or "METRICA_PERSONAL_HOST_READY.zip")
    tree = DIST / "final"
    shutil.rmtree(tree, ignore_errors=True)
    shutil.copytree(TREE, tree)
    cfg = tree / "metrica_private" / "config.php"
    text = cfg.read_text(encoding="utf-8")
    for k, v in values.items():
        text, n = re.subn(rf'^const {k} = ".*?";', f'const {k} = "{v}";', text, flags=re.M)
        assert n == 1, f"{k} not found in config.php"
    cfg.write_text(text, encoding="utf-8")
    pack(tree, out)

    # read the archive back: the settings are in it, everything else is the standard build byte for byte
    with zipfile.ZipFile(out) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert names == sorted(p.relative_to(TREE).as_posix() for p in TREE.rglob("*") if p.is_file())
        stored = z.read("metrica_private/config.php").decode("utf-8")
        for k, v in values.items():
            assert f'const {k} = "{v}";' in stored, f"{k} missing in the archive"
        for name in names:
            data = z.read(name)
            if name != "metrica_private/config.php":
                assert data == (TREE / name).read_bytes(), f"{name} differs from the standard build"
            if name.startswith("public_html/") and "API_KEY" in values:
                assert values["API_KEY"].encode() not in data, f"the API key leaked into {name}"
    left = re.findall(r'^const (\w+) = "PASTE_[A-Z_]+";', stored, flags=re.M)
    mask = lambda k, v: v if k in ("DB_NAME", "PATTERN_UID", "SMS_SENDER") else f"{v[:4]}…{v[-3:]} ({len(v)} chars)"
    print(f"{out.relative_to(ROOT.parent)}  {out.stat().st_size / 1e6:.2f} MB — read back from the archive:")
    for k, v in values.items():
        print(f"  {k:12} = {mask(k, v)}")
    print(f"  still to fill: {', '.join(left) or 'nothing'}")


def main():
    html = SINGLE.read_text(encoding="utf-8")
    page, files = split(html)
    shutil.rmtree(TREE, ignore_errors=True)
    shutil.copytree(HERE / "public_html", TREE / "public_html")
    shutil.copytree(HERE / "metrica_private", TREE / "metrica_private")
    shutil.copytree(HERE / "database", TREE / "database")
    shutil.copy(HERE / "README-FA.md", TREE / "README-FA.md")
    (TREE / "public_html" / "index.html").write_text(page, encoding="utf-8")
    for path, data in files.items():
        p = TREE / "public_html" / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    cfg = TREE / "metrica_private" / "config.php"  # a fresh secret for this package (HMAC of the codes)
    cfg.write_text(cfg.read_text(encoding="utf-8").replace('"GENERATED_AT_BUILD"', f'"{secrets.token_hex(32)}"'), encoding="utf-8")

    pack(TREE, ZIP)
    shutil.copy(SINGLE, DIST / "index.html")
    shutil.copy(HERE / "README-FA.md", DIST / "README-FA.md")
    size = sum(len(d) for d in files.values())
    print(f"index.html {len(page.encode()) / 1e3:.0f} KB + {len(files)} asset files {size / 1e6:.2f} MB")
    print(f"{ZIP.relative_to(ROOT.parent)}  {ZIP.stat().st_size / 1e6:.2f} MB")
    if any(os.environ.get(env) for env in FILL.values()):
        personal()


if __name__ == "__main__":
    main()
