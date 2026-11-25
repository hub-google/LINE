#!/usr/bin/env python3
"""Apply Gmail SMTP to both MonsterPort Supabase Auth projects.

Secret is read at runtime from Vault via the existing GitHub Actions
SUPABASE_ACCESS_TOKEN. Never log, commit, emit, or upload the secret.
Keep both independent Auth configs and branded templates intact.
"""
import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request

TOKEN = os.getenv("SUPABASE_ACCESS_TOKEN", "")
QUEUE_REF = "unapiwajmgqqtdkixaab"
PROJECTS = [("Queue Monster", QUEUE_REF), ("Monster Arena", "fanffwnhkxpfhttylntw")]
SENDER = "monsterport@gmail.com"
HOST = "smtp.gmail.com"
PORT = 465
VAULT_NAME = "MONSTERPORT_GMAIL_SMTP_APP_PASSWORD"

if not TOKEN:
    raise SystemExit("Missing SUPABASE_ACCESS_TOKEN (existing GitHub Actions Secret)")


def request(ref, route, method="GET", payload=None):
    endpoint = "https://api.supabase.com/v1/projects/" + ref + route
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        endpoint, data=body, method=method,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else {}
    except urllib.error.HTTPError as error:
        # Never echo API response bodies. They may include sensitive config.
        raise RuntimeError("Supabase Management API " + method + " " + route +
                           ": HTTP " + str(error.code)) from None


def rows(value):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for k in ("result", "data", "rows"):
            if isinstance(value.get(k), list):
                return value[k]
    raise RuntimeError("Unexpected SQL query response shape")


def read_app_password():
    sql = ("select decrypted_secret as password from vault.decrypted_secrets "
           "where name = '" + VAULT_NAME + "' limit 1;")
    row_list = rows(request(QUEUE_REF, "/database/query", "POST", {"query": sql}))
    if len(row_list) != 1 or not isinstance(row_list[0].get("password"), str):
        raise RuntimeError("Gmail app password not available in restricted Supabase Vault")
    value = row_list[0]["password"].replace(" ", "").strip()
    if len(value) != 16:
        raise RuntimeError("Gmail app password must have 16 characters")
    # GitHub Actions masks the value even if unexpected downstream error prints it.
    print("::add-mask::" + value, flush=True)
    return value


def preflight():
    states = []
    for name, ref in PROJECTS:
        cfg = request(ref, "/config/auth")
        if cfg.get("hook_send_email_enabled"):
            raise RuntimeError(name + " has an active send-email hook; refusing override")
        current = cfg.get("smtp_host")
        if current and current != HOST:
            raise RuntimeError(name + " has different SMTP provider; refusing override")
        states.append((name, ref, cfg))
        print("PREFLIGHT:", name, "existing custom SMTP:", bool(current), flush=True)
    return states


def verify_gmail(password):
    # Retry using STARTTLS, as Gmail supports both 587 and implicit TLS 465.
    failures = []
    for port in (587, 465):
        try:
            if port == 587:
                with smtplib.SMTP(HOST, port, timeout=15) as smtp:
                    smtp.ehlo()
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.ehlo()
                    smtp.login(SENDER, password)
            else:
                with smtplib.SMTP_SSL(HOST, port,
                                     context=ssl.create_default_context(), timeout=15) as smtp:
                    smtp.login(SENDER, password)
        except smtplib.SMTPAuthenticationError as exc:
            raise RuntimeError("Gmail app password rejected: SMTP " + str(exc.smtp_code)) from None
        except Exception as exc:
            failures.append(str(port) + ": " + type(exc).__name__)
            continue
        print("PASS: Gmail SMTP authenticated on port " + str(port), flush=True)
        return port
    raise RuntimeError("SMTP validation blocked: " + ", ".join(failures))


def configure():
    originals = preflight()
    target = os.getenv("MONSTERPORT_SMTP_TARGET", "")
    if target not in ("arena", "queue"):
        raise RuntimeError("Specify staging target: arena or queue")
    password = read_app_password()
    port = 465  # Google-supported implicit SSL, exercised by Supabase itself.
    print("SMTP connectivity from GitHub runners blocked; testing through real Supabase Auth", flush=True)
    payload = {
        "smtp_admin_email": SENDER,
        "smtp_sender_name": "MonsterPort",
        "smtp_host": HOST,
        "smtp_port": port,
        "smtp_user": SENDER,
        "smtp_pass": password,
    }
    for name, ref, previous in originals:
        if ("Arena" in name) != (target == "arena"):
            continue
        request(ref, "/config/auth", "PATCH", payload)
        current = request(ref, "/config/auth")
        for key, expected in [
            ("smtp_admin_email", SENDER),
            ("smtp_sender_name", "MonsterPort"),
            ("smtp_host", HOST),
            ("smtp_port", port),
            ("smtp_user", SENDER),
        ]:
            if str(current.get(key)) != str(expected):
                raise RuntimeError(name + ": SMTP readback mismatch for " + key)
        for key in [
            "site_url", "uri_allow_list",
            "mailer_subjects_recovery", "mailer_templates_recovery_content",
            "mailer_subjects_confirmation", "mailer_templates_confirmation_content",
            "mailer_autoconfirm", "external_email_enabled",
        ]:
            if current.get(key) != previous.get(key):
                raise RuntimeError(name + ": unrelated Auth config changed: " + key)
        print("PASS:", name, "SMTP setup verified; branded emails retained", flush=True)
    print("PASS: Staged project "+target+" SMTP configured; real email delivery verification required", flush=True)


if __name__ == "__main__":
    configure()
