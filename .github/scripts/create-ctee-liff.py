#!/usr/bin/env python3
"""Create or reuse the independent CTEE LIFF app in the existing LINE Login channel.

Run exclusively on a trusted CI runner with encrypted LINE Login channel secrets.
Never print credentials, bearer tokens, or raw LINE API responses.
Does not alter the Queue Monster LIFF apps or any other service.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

CHANNEL = "2012346974"
ENDPOINT = "https://hub-google.github.io/ctee-line-bot/"
DESCRIPTION = "工商時報每日剪報"
PRESERVE_IDS = {"2012346974-bmC3fZuf", "2012346974-jSefrnfw"}
BASE = "https://api.line.me/liff/v1/apps"
SCOPES = {"openid", "profile", "chat_message.write"}


def api(operation, method, url, *, token=None, body=None, form=None):
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    elif form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(form).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{operation}: LINE API returned HTTP {exc.code}; credentials/response redacted") from None
    except urllib.error.URLError:
        raise RuntimeError(f"{operation}: LINE API network unavailable") from None


def main():
    channel = os.environ.get("LINE_LOGIN_CHANNEL_ID", "").strip()
    secret = os.environ.get("LINE_LOGIN_CHANNEL_SECRET", "").strip()
    if channel != CHANNEL:
        raise RuntimeError("Configured LINE Login channel does not match required 2012346974; aborting")
    if not secret:
        raise RuntimeError("LINE_LOGIN_CHANNEL_SECRET not available in this repository's Actions secrets")
    result = api("Get LINE Login channel access token", "POST",
        "https://api.line.me/v2/oauth/accessToken",
        form={"grant_type": "client_credentials", "client_id": channel, "client_secret": secret})
    token = result.get("access_token", "")
    if not token:
        raise RuntimeError("LINE Login channel token was not issued")
    apps = api("List existing LIFF apps", "GET", BASE, token=token).get("apps", [])
    if not isinstance(apps, list):
        raise RuntimeError("Unexpected LINE LIFF list response")
    ids = {app.get("liffId", "") for app in apps}
    missing = PRESERVE_IDS - ids
    if missing:
        raise RuntimeError("Existing Queue Monster LIFF apps not found in channel: refusing to modify channel")
    matches = [app for app in apps if (app.get("view") or {}).get("url") == ENDPOINT]
    if len(matches) > 1:
        raise RuntimeError("Multiple CTEE LIFF apps already use this endpoint; cannot select safely")
    if matches:
        liff_id = matches[0].get("liffId", "")
        scopes = set(matches[0].get("scope", []))
        if not SCOPES.issubset(scopes):
            api("Add missing CTEE LIFF scopes", "PUT",
                BASE + "/" + urllib.parse.quote(liff_id, safe=""),
                token=token, body={"scope": sorted(scopes | SCOPES)})
        print("Reused existing CTEE LIFF app.")
    else:
        new = api("Create independent CTEE LIFF", "POST", BASE, token=token,
            body={"view": {"type": "full", "url": ENDPOINT},
                  "description": DESCRIPTION,
                  "features": {"qrCode": False},
                  "permanentLinkPattern": "concat",
                  "scope": ["openid", "profile", "chat_message.write"],
                  "botPrompt": "none"})
        liff_id = new.get("liffId", "")
        print("Created new independent CTEE LIFF app.")
    if not re.fullmatch(r"2012346974-[A-Za-z0-9]+", liff_id) or liff_id in PRESERVE_IDS:
        raise RuntimeError("Invalid LIFF ID or conflict with Queue Monster")
    verified = api("Verify CTEE LIFF", "GET", BASE, token=token).get("apps", [])
    target = next((app for app in verified if app.get("liffId") == liff_id), None)
    if not target:
        raise RuntimeError("New LIFF not present in channel")
    if (target.get("view") or {}).get("url") != ENDPOINT:
        raise RuntimeError("New LIFF endpoint mismatch")
    if not SCOPES.issubset(set(target.get("scope") or [])):
        raise RuntimeError("New LIFF required scopes not granted")
    if not PRESERVE_IDS.issubset({app.get("liffId", "") for app in verified}):
        raise RuntimeError("Existing Queue Monster LIFF app missing from read-back")
    print("Verified independent CTEE endpoint, full view, required scopes, original two LIFF apps intact.")
    print("CTEE_PUBLIC_LIFF_ID=" + liff_id)


if __name__ == "__main__":
    main()
