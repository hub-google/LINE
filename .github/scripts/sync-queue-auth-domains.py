#!/usr/bin/env python3
"""Keep GitHub Pages + queue.monsterport.com Auth and LIFF endpoints working together.

This script only ADDS Supabase Auth redirects, and creates/reuses the second LIFF app.
It never changes the original LIFF app or the Supabase Site URL.
Requires existing GitHub Actions secrets; never log their values.
"""
import json
import os
import pathlib
import re
import sys
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "unapiwajmgqqtdkixaab"
QUEUE_ENDPOINT = "https://queue.monsterport.com/"
LEGACY_ENDPOINT = "https://hub-google.github.io/LINE/booking/"
REQUIRED_REDIRECTS = (
    "https://queue.monsterport.com/**",
    "https://hub-google.github.io/LINE/booking/**",
    "https://hub-google.github.io/LINE/saas/**",
)


def api(label, method, url, token="", body=None, form=None):
    headers = {}
    data = None
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    elif form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(form).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raise RuntimeError(label + ": HTTP " + str(error.code)) from None
    except urllib.error.URLError:
        raise RuntimeError(label + ": network connection unavailable") from None


def sync_supabase_redirects():
    pat = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not pat:
        raise RuntimeError("Missing SUPABASE_ACCESS_TOKEN GitHub secret")
    url = "https://api.supabase.com/v1/projects/" + PROJECT + "/config/auth"
    current = api("Supabase Auth config read", "GET", url, token=pat)
    raw = current.get("uri_allow_list") or ""
    if not isinstance(raw, str):
        raise RuntimeError("Unexpected Supabase Auth uri_allow_list format")
    previous = [part.strip() for part in raw.split(",") if part.strip()]
    updated = list(dict.fromkeys(previous + list(REQUIRED_REDIRECTS)))
    if updated != previous:
        api("Supabase Auth redirect update", "PATCH", url, token=pat,
            body={"uri_allow_list": ",".join(updated)})
    checked = api("Supabase Auth redirect verification", "GET", url, token=pat)
    actual = {item.strip() for item in (checked.get("uri_allow_list") or "").split(",")}
    if not set(REQUIRED_REDIRECTS).issubset(actual):
        raise RuntimeError("Supabase Auth dual-domain redirect verification failed")
    # Do not alter site_url, existing redirect paths, OAuth credentials or other projects.
    if checked.get("site_url") != current.get("site_url"):
        raise RuntimeError("Supabase Site URL was modified unexpectedly")
    if checked.get("external_google_enabled") is False:
        raise RuntimeError("Supabase Google provider is disabled")
    print("Supabase Auth: both original GitHub Pages and queue custom-domain redirects accepted.")


def sync_queue_liff(persist_to_supabase=True):
    channel = os.environ.get("LINE_LOGIN_CHANNEL_ID", "").strip()
    secret = os.environ.get("LINE_LOGIN_CHANNEL_SECRET", "").strip()
    old_id = os.environ.get("LINE_LIFF_ID", "").strip()
    if not (channel and secret and old_id):
        raise RuntimeError("Missing LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET or LINE_LIFF_ID secret; cannot enable a second LIFF without breaking the old one")
    token_result = api("LINE Login channel token", "POST",
        "https://api.line.me/v2/oauth/accessToken",
        form={"grant_type": "client_credentials", "client_id": channel,
              "client_secret": secret})
    token = token_result.get("access_token", "")
    if not token:
        raise RuntimeError("LINE Login channel token missing")
    base = "https://api.line.me/liff/v1/apps"
    apps = api("LINE LIFF list", "GET", base, token=token).get("apps") or []
    legacy = next((app for app in apps if app.get("liffId") == old_id), None)
    if not legacy:
        raise RuntimeError("Existing GitHub Pages LIFF not found; refusing to replace it")
    if (legacy.get("view") or {}).get("url") != LEGACY_ENDPOINT:
        raise RuntimeError("Existing GitHub Pages LIFF Endpoint is incorrect; refusing to change it")
    matches = [app for app in apps if (app.get("view") or {}).get("url") == QUEUE_ENDPOINT]
    if len(matches) > 1:
        raise RuntimeError("Multiple queue LIFF apps found; cannot select safely")
    if matches:
        queue_id = matches[0].get("liffId", "")
        scopes = matches[0].get("scope") or []
        required = ("openid", "profile", "chat_message.write")
        if not set(required).issubset(scopes):
            api("LINE queue LIFF scopes", "PUT", base + "/" + urllib.parse.quote(queue_id),
                token=token, body={"scope": list(dict.fromkeys(list(scopes) + list(required)))})
    else:
        created = api("Create separate queue LIFF", "POST", base, token=token,
            body={"view": {"type": "full", "url": QUEUE_ENDPOINT},
                  "description": "Queue Monster - Official Website",
                  "features": {"qrCode": False},
                  "permanentLinkPattern": "concat",
                  "scope": ["openid", "profile", "chat_message.write"],
                  "botPrompt": "none"})
        queue_id = created.get("liffId", "")
    if not re.fullmatch(re.escape(channel) + r"-[A-Za-z0-9]+", queue_id):
        raise RuntimeError("New LIFF does not share the existing LINE Login Channel")
    if queue_id == old_id:
        raise RuntimeError("Queue and GitHub Pages LIFF IDs must be different")
    verified_apps = api("LINE LIFF verification", "GET", base, token=token).get("apps") or []
    new = next((app for app in verified_apps if app.get("liffId") == queue_id), None)
    if not new or (new.get("view") or {}).get("url") != QUEUE_ENDPOINT:
        raise RuntimeError("New queue LIFF endpoint verification failed")
    if not {"openid", "profile", "chat_message.write"}.issubset(set(new.get("scope") or [])):
        raise RuntimeError("New queue LIFF required scopes not enabled")
    if not persist_to_supabase:
        # Public LIFF ID is safe to log and allows bootstrap when the Supabase PAT expired.
        print("QUEUE_PUBLIC_LIFF_ID=" + queue_id)
        return old_id, queue_id
    # Store public LIFF identifier in existing server-side Supabase secrets; never expose secret keys.
    handle, path = tempfile.mkstemp(prefix="queue-liff-", suffix=".env")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write("LINE_LIFF_ID_QUEUE=" + queue_id + "\n")
        os.chmod(path, 0o600)
        result = subprocess.run(
            ["supabase", "secrets", "set", "--env-file", path,
             "--project-ref", PROJECT, "--yes"],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if result.returncode != 0:
            raise RuntimeError("Supabase secret sync failed (exit code " + str(result.returncode) + ")")
    finally:
        pathlib.Path(path).unlink(missing_ok=True)
    print("LINE: separate LIFF created or reused for queue; original GitHub Pages LIFF unchanged.")
    return old_id, queue_id


def verify_bridge(old_id, queue_id):
    url = "https://" + PROJECT + ".supabase.co/functions/v1/line-bridge?action=config"
    for attempt in range(5):
        try:
            old = api("Legacy LINE config", "GET", url)
            new = api("Queue LINE config", "GET", url + "&site=queue")
            if old.get("liffId") == old_id and new.get("liffId") == queue_id:
                print("LINE bridge: both website-specific LIFF IDs confirmed.")
                return
        except RuntimeError:
            pass
        if attempt < 4:
            time.sleep(3)
    raise RuntimeError("Live LINE bridge does not return both LIFF IDs yet")


if __name__ == "__main__":
    if "--liff-only" in sys.argv:
        # Run before Supabase deployment so an expired PAT cannot block LIFF creation.
        sync_queue_liff(persist_to_supabase=False)
    else:
        sync_supabase_redirects()
        legacy_liff, queue_liff = sync_queue_liff()
        verify_bridge(legacy_liff, queue_liff)
