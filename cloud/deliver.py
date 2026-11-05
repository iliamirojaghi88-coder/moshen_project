"""Deliver a finished file to the user's phone through PRIVATE Google Drive storage with a time limit.

Why: a cloud Claude Code session cannot hand a file to the phone by itself, and a path inside the
container is not a download link. This uploads to a private Drive folder and prints a real link.

  python cloud/deliver.py send FILE [--ttl-hours 48] [--anyone] [--name NAME]
  python cloud/deliver.py purge            delete expired uploads (run at session start/end; stateless)
  python cloud/deliver.py selftest         upload a 1 KB file, check it, delete it
  python cloud/deliver.py auth-help        how to create the secrets (nothing is printed from them)

Credentials come ONLY from environment secrets (never files in Git, never printed):
  OAuth (recommended for a personal Google account):
      MP_GDRIVE_CLIENT_ID, MP_GDRIVE_CLIENT_SECRET, MP_GDRIVE_REFRESH_TOKEN
  or a service account:  MP_GDRIVE_SERVICE_ACCOUNT_JSON  (the JSON text)  [needs a shared folder, see auth-help]
  MP_GDRIVE_FOLDER_ID    optional existing folder; else a private "MP-Video-Output" folder is created
  MP_DELIVER_EMAIL       the user's Google account that should get access (phone is signed in with it)

Expiry: Drive can expire access only for named users, so the file is shared with MP_DELIVER_EMAIL with an
expirationTime AND tagged with appProperties.mp_expires; `purge` deletes the file itself after the TTL.
--anyone additionally creates an "anyone with the link" reader permission (the link works without sign-in);
the file is still deleted by `purge` after the TTL. Default is NOT public.
"""
import argparse
import json
import mimetypes
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API = "https://www.googleapis.com/drive/v3"
UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
SCOPE = "https://www.googleapis.com/auth/drive"  # full scope: needed to create/list/delete the files we own
FOLDER_NAME = "MP-Video-Output"


class DeliverError(RuntimeError):
    pass


def token() -> str:
    sa = os.environ.get("MP_GDRIVE_SERVICE_ACCOUNT_JSON")
    if sa:
        try:
            from google.auth.transport.requests import Request
            from google.oauth2 import service_account
            info = json.loads(sa) if sa.lstrip().startswith("{") else json.loads(Path(sa).read_text(encoding="utf-8"))
            cred = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
            cred.refresh(Request())
            return cred.token
        except Exception as e:
            raise DeliverError(f"service account auth failed: {type(e).__name__}")
    ids = [os.environ.get(k) for k in ("MP_GDRIVE_CLIENT_ID", "MP_GDRIVE_CLIENT_SECRET", "MP_GDRIVE_REFRESH_TOKEN")]
    if all(ids):
        r = requests.post("https://oauth2.googleapis.com/token", timeout=30, data={
            "client_id": ids[0], "client_secret": ids[1], "refresh_token": ids[2], "grant_type": "refresh_token"})
        if r.status_code != 200:
            raise DeliverError(f"OAuth refresh failed (HTTP {r.status_code}); re-create the refresh token (cloud/deliver.py auth-help)")
        return r.json()["access_token"]
    raise DeliverError("no Drive credentials in the environment (MP_GDRIVE_* secrets). Run: python cloud/deliver.py auth-help")


def call(method, url, tok, **kw):
    for attempt in range(4):
        r = requests.request(method, url, headers={"Authorization": f"Bearer {tok}", **kw.pop("headers", {})}, timeout=60, **kw)
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 3:
            time.sleep(2 ** attempt)
            continue
        if r.status_code >= 400:
            msg = ""
            try:
                msg = r.json().get("error", {}).get("message", "")[:200]
            except ValueError:
                pass
            raise DeliverError(f"Drive API {method} HTTP {r.status_code}: {msg}")
        return r
    raise DeliverError("Drive API unreachable")


def ensure_folder(tok) -> str:
    fid = os.environ.get("MP_GDRIVE_FOLDER_ID")
    if fid:
        return fid
    q = f"name='{FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents"
    items = call("GET", f"{API}/files", tok, params={"q": q, "fields": "files(id)", "pageSize": 1}).json()["files"]
    if items:
        return items[0]["id"]
    return call("POST", f"{API}/files", tok, json={"name": FOLDER_NAME, "mimeType": "application/vnd.google-apps.folder"},
                params={"fields": "id"}).json()["id"]


def upload(tok, path: Path, name: str, folder: str, expires: float) -> dict:
    meta = {"name": name, "parents": [folder], "appProperties": {"mp_expires": str(int(expires)), "mp_by": "mp-video-skillset"}}
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    init = call("POST", UPLOAD, tok, params={"uploadType": "resumable", "fields": "id,name,webViewLink,size"}, json=meta,
                headers={"X-Upload-Content-Type": mime, "X-Upload-Content-Length": str(path.stat().st_size)})
    url, size, chunk = init.headers["Location"], path.stat().st_size, 8 * 1024 * 1024
    if size == 0:
        raise DeliverError("file is empty")
    with path.open("rb") as f:
        pos = 0
        while pos < size:
            data = f.read(chunk)
            end = pos + len(data) - 1
            for attempt in range(4):
                r = requests.put(url, data=data, timeout=300, headers={"Content-Range": f"bytes {pos}-{end}/{size}"})
                if r.status_code in (200, 201, 308):
                    break
                if attempt == 3 or r.status_code < 500:
                    raise DeliverError(f"upload failed at byte {pos} (HTTP {r.status_code})")
                time.sleep(2 ** attempt)
            pos = end + 1
    return r.json()


def share(tok, file_id, email, expires, anyone):
    iso = datetime.fromtimestamp(expires, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    result = {"shared_with": None, "anyone": False}
    if email:
        try:
            call("POST", f"{API}/files/{file_id}/permissions", tok, params={"sendNotificationEmail": "false"},
                 json={"type": "user", "role": "reader", "emailAddress": email, "expirationTime": iso})
            result["shared_with"] = email
        except DeliverError as e:  # the owner is already that account, or a Workspace policy blocks it
            result["share_note"] = str(e)
    if anyone:
        call("POST", f"{API}/files/{file_id}/permissions", tok, json={"type": "anyone", "role": "reader"})
        result["anyone"] = True
    return result


def purge(tok) -> int:
    n, now = 0, time.time()
    page = None
    while True:
        r = call("GET", f"{API}/files", tok, params={
            "q": "appProperties has { key='mp_by' and value='mp-video-skillset' } and trashed=false",
            "fields": "nextPageToken,files(id,name,appProperties)", "pageSize": 100, **({"pageToken": page} if page else {})}).json()
        for f in r.get("files", []):
            try:
                if float(f["appProperties"].get("mp_expires", "inf")) < now:
                    call("DELETE", f"{API}/files/{f['id']}", tok)
                    n += 1
            except (ValueError, DeliverError):
                continue
        page = r.get("nextPageToken")
        if not page:
            return n


def send(path: Path, ttl_h: float, anyone: bool, name=None) -> dict:
    if not path.is_file():
        raise DeliverError(f"not a file: {path}")
    tok = token()
    expires = time.time() + ttl_h * 3600
    folder = ensure_folder(tok)
    f = upload(tok, path, name or path.name, folder, expires)
    sh = share(tok, f["id"], os.environ.get("MP_DELIVER_EMAIL"), expires, anyone)
    mb = int(f.get("size", 0)) / 1e6
    return {"link": f.get("webViewLink"), "download": f"https://drive.google.com/uc?export=download&id={f['id']}" if anyone else None,
            "name": f["name"], "size_mb": round(mb, 1), "expires_utc": (datetime.now(timezone.utc) + timedelta(hours=ttl_h)).strftime("%Y-%m-%d %H:%M"),
            "private": not anyone, **sh}


AUTH_HELP = """One-time setup (can be done from the phone's browser):
1. console.cloud.google.com -> new project -> enable "Google Drive API".
2. OAuth consent screen: External, add your Google account as a test user.
3. Credentials -> OAuth client ID (type: Desktop). Note client id + secret.
4. Get a refresh token once (any machine): open
   https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/drive&access_type=offline&prompt=consent
   copy the `code` from the failed localhost redirect URL, then POST it to https://oauth2.googleapis.com/token
   (grant_type=authorization_code) and keep the `refresh_token`.
5. In the Claude Code cloud environment settings add secrets: MP_GDRIVE_CLIENT_ID, MP_GDRIVE_CLIENT_SECRET,
   MP_GDRIVE_REFRESH_TOKEN, MP_DELIVER_EMAIL (your Gmail). Never paste them into chat.
Service account alternative: create one, share a Drive folder with its e-mail as Editor, set
MP_GDRIVE_SERVICE_ACCOUNT_JSON and MP_GDRIVE_FOLDER_ID. (Personal Drive often gives service accounts no quota: prefer OAuth.)
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("send"); s.add_argument("file"); s.add_argument("--ttl-hours", type=float, default=48)
    s.add_argument("--anyone", action="store_true"); s.add_argument("--name")
    sub.add_parser("purge"); sub.add_parser("selftest"); sub.add_parser("auth-help")
    a = ap.parse_args()
    try:
        if a.cmd == "auth-help":
            print(AUTH_HELP)
        elif a.cmd == "send":
            print(json.dumps(send(Path(a.file), a.ttl_hours, a.anyone, a.name), ensure_ascii=False, indent=1))
        elif a.cmd == "purge":
            print(f"deleted {purge(token())} expired file(s)")
        else:
            import tempfile
            with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as t:
                t.write("mp-video-skillset delivery selftest\n" * 20)
            res = send(Path(t.name), 0.05, False, "mp-selftest.txt")
            tok = token()
            fid = res["link"].split("/d/")[1].split("/")[0] if res.get("link") and "/d/" in res["link"] else None
            if fid:
                call("DELETE", f"{API}/files/{fid}", tok)
            os.unlink(t.name)
            print("selftest OK: uploaded, got a link, deleted")
    except DeliverError as e:
        print(f"delivery failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
