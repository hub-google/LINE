#!/usr/bin/env python3
"""Restore Arena's default Supabase Auth mailer after Gmail login rejected (535)."""
import json
import os
import urllib.error
import urllib.request

REF = "fanffwnhkxpfhttylntw"
token = os.environ["SUPABASE_ACCESS_TOKEN"]
url = "https://api.supabase.com/v1/projects/" + REF + "/config/auth"

def req(method="GET", payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url, method=method, data=body,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as err:
        raise RuntimeError(method + " config HTTP " + str(err.code)) from None

previous = req()
if previous.get("smtp_host") != "smtp.gmail.com":
    raise RuntimeError("SMTP provider has changed; refusing unrelated rollback")
nulls = {key: None for key in
         ["smtp_admin_email","smtp_host","smtp_port","smtp_user","smtp_pass","smtp_sender_name"]}
try:
    req("PATCH", nulls)
except RuntimeError as error:
    if "HTTP 400" not in str(error):
        raise
    req("PATCH", {key: "" for key in nulls})
current = req()
if current.get("smtp_host"):
    raise RuntimeError("SMTP remains enabled despite rollback")
for key in ["site_url","uri_allow_list","mailer_subjects_recovery",
            "mailer_templates_recovery_content","mailer_subjects_confirmation",
            "mailer_templates_confirmation_content","mailer_autoconfirm","external_email_enabled"]:
    if previous.get(key) != current.get(key):
        raise RuntimeError("Unexpected change to " + key)
print("PASS: Arena custom SMTP removed; default Supabase Auth mailer restored", flush=True)
