#!/usr/bin/env python3
"""METRICA deploy package: dist/METRICA_HOME_v3.zip with public_html/ and metrica_private/ at its root, the same layout
as domains/<domain>/ on DirectAdmin. config.php and logs are never packed: the host keeps its real settings.
Also copies the migration and the install guide next to it. Run: python3 -I tools/build_zip.py"""
import pathlib
import shutil
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"


def files():
    for top in ("public_html", "metrica_private"):
        for p in sorted((ROOT / top).rglob("*")):
            rel = p.relative_to(ROOT)
            if p.is_dir() or rel.as_posix() == "metrica_private/config.php" or (rel.parts[1] == "logs" and p.name != ".htaccess"):
                continue
            yield p, rel.as_posix()


def main():
    DIST.mkdir(exist_ok=True)
    out = DIST / "METRICA_HOME_v3.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p, arc in files():
            z.write(p, arc)
    shutil.copy(ROOT / "database/migrate-home-v3.sql", DIST)
    shutil.copy(ROOT / "DEPLOY-fa.md", DIST)
    names = zipfile.ZipFile(out).namelist()
    assert not any(n.endswith("config.php") for n in names) and all(n.split("/")[0] in ("public_html", "metrica_private") for n in names)
    print(out, len(names), "files", round(out.stat().st_size / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
