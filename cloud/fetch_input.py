"""Bring one input video into the repo safely.

  python cloud/fetch_input.py SOURCE [--max-mb 1500] [--max-minutes 30]

SOURCE is a local file the user attached to the chat (any path on disk) or an http(s) link to a video the
user is allowed to use (direct file link, YouTube/Instagram-public/TikTok page via yt-dlp). Prints one JSON
line: {"file": "<abs path>", "hash": "<8 hex>", "bytes": N}. The file lands in mp-studio/input/_incoming/
named <hash>.<ext>, so identical inputs share one transcript.

Rules: no cookies and no logins in the cloud (private/age-gated content: download on your own device and
attach it). Private/loopback/link-local addresses are refused. Size and duration are capped.
"""
import argparse
import hashlib
import ipaddress
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

REPO = Path(__file__).resolve().parents[1]
INC = REPO / "mp-studio" / "input" / "_incoming"
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".m4v", ".webm", ".avi", ".mts", ".3gp"}


def die(msg):
    print(json.dumps({"error": msg}, ensure_ascii=False))
    sys.exit(1)


def host_ok(url):
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        die("only http(s) links are allowed")
    try:
        for fam, _, _, _, sa in socket.getaddrinfo(u.hostname, None):
            ip = ipaddress.ip_address(sa[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                die("link points to a private/internal address")
    except socket.gaierror:
        die("cannot resolve host")


def sha8(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()[:8]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--max-mb", type=int, default=1500)
    ap.add_argument("--max-minutes", type=int, default=30)
    a = ap.parse_args()
    INC.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(INC).free / 1e6
    if free < a.max_mb * 2:
        a.max_mb = int(free / 3)
        if a.max_mb < 100:
            die(f"not enough disk space ({free:.0f} MB free)")
    tmp = Path(tempfile.mkdtemp(prefix="mp-in-", dir=INC))
    try:
        if a.source.startswith(("http://", "https://")):
            host_ok(a.source)
            # behind a TLS-inspecting proxy (SSL_CERT_FILE set) yt-dlp must use that store, not its bundled certifi
            cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "--no-warnings",
                   *(["--compat-options", "no-certifi"] if os.environ.get("SSL_CERT_FILE") else []),
                   "--max-filesize", f"{a.max_mb}M", "--match-filter", f"duration<=?{a.max_minutes * 60}",
                   "--merge-output-format", "mp4", "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
                   "--socket-timeout", "30", "--retries", "3", "-o", str(tmp / "in.%(ext)s"), a.source]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
            if r.returncode:
                die("download failed: " + (r.stderr.strip().splitlines() or ["unknown"])[-1][:200])
            got = [p for p in tmp.iterdir() if p.suffix.lower() in VIDEO_EXT]
            if not got:
                die("nothing downloaded (too large/long, or not a video)")
            src = got[0]
            # direct file links have no duration before download (`<=?` lets them through): cap it here
            d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)],
                               capture_output=True, text=True).stdout.strip()
            if d and d != "N/A" and float(d) > a.max_minutes * 60:
                die(f"video longer than {a.max_minutes} min")
        else:
            src = Path(a.source).expanduser().resolve()
            if not src.is_file() or src.suffix.lower() not in VIDEO_EXT:
                die("not a video file")
            if src.stat().st_size > a.max_mb * 1e6:
                die(f"file larger than {a.max_mb} MB")
        h = sha8(src)
        dst = INC / f"{h}{src.suffix.lower()}"
        if not dst.exists():
            shutil.copy2(src, dst)
        print(json.dumps({"file": str(dst), "hash": h, "bytes": dst.stat().st_size}))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
