#!/usr/bin/env python3
"""Add Work custom-domain Auth redirect without disturbing other Supabase apps."""
import json
import os
import urllib.request

PROJECT = "unapiwajmgqqtdkixaab"
URL = "https://api.supabase.com/v1/projects/" + PROJECT + "/config/auth"
REDIRECT = "https://work.monsterport.com/**"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if not TOKEN:
    raise SystemExit("Missing encrypted Supabase access token")

def request(method, payload=None):
    headers={"Authorization":"Bearer "+TOKEN,"Content-Type":"application/json"}
    req=urllib.request.Request(URL,method=method,headers=headers,
        data=None if payload is None else json.dumps(payload).encode())
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

before=request("GET")
raw=before.get("uri_allow_list") or ""
if not isinstance(raw,str): raise SystemExit("Unexpected Supabase Auth redirect format")
allowed=[item.strip() for item in raw.split(",") if item.strip()]
if REDIRECT not in allowed:
    request("PATCH",{"uri_allow_list":",".join(dict.fromkeys(allowed+[REDIRECT]))})
after=request("GET")
actual=set(item.strip() for item in (after.get("uri_allow_list") or "").split(","))
assert REDIRECT in actual,"Work Auth redirect was not saved"
assert after.get("site_url")==before.get("site_url"),"Unexpected Supabase Auth Site URL change"
assert set(allowed).issubset(actual),"Existing app redirects were unexpectedly removed"
print("Work Auth redirect configured; existing redirects and Site URL preserved.")
