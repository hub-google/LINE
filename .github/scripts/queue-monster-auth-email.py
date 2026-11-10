#!/usr/bin/env python3
"""Queue Monster-only branded auth mail on a SHARED Supabase Auth project.

All other brands retain their current message bodies and subjects.
Read then minimally PATCH existing config; never alter site_url or SMTP settings.
"""
import json
import os
import urllib.error
import urllib.request

project = "unapiwajmgqqtdkixaab"
token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if not token:
    raise SystemExit("Missing SUPABASE_ACCESS_TOKEN repository secret")
endpoint = f"https://api.supabase.com/v1/projects/{project}/config/auth"
headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
def api(method, payload=None):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(endpoint, data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        # Do not log the raw response, which can include account configuration.
        raise RuntimeError(f"Supabase Auth config API returned HTTP {error.code} on {method}") from None

original = api("GET")
assert isinstance(original, dict), "Auth config was not an object"

invite_redirect = "https://hub-google.github.io/LINE/booking/merchant-register.html?mode=login&from=staff-invite"
login_redirect = "https://hub-google.github.io/LINE/booking/merchant-register.html?mode=login&from=queue-monster"
reset_redirect = "https://hub-google.github.io/LINE/booking/merchant-register.html?mode=login&intent=recovery"
stamp = "queue-monster-mail-v1"
base_style = ('<div style="background:#f6f1fa;padding:28px 16px;font-family:Arial,sans-serif;color:#352849;">'
    '<div style="background:white;max-width:560px;margin:auto;padding:30px;border-radius:18px;border:1px solid #e7d8f1">'
    '<div style="font-size:22px;font-weight:800;color:#523b70;margin-bottom:18px">排隊怪獸</div>')
footer = ('<p style="font-size:13px;color:#71657c;margin-top:28px">此信為排隊怪獸系統通知。'
          '若您並未提出申請，可以忽略此信。</p></div></div>')
button_style = ('style="display:inline-block;background:#523b70;color:#ffffff;text-decoration:none;'
    'padding:13px 22px;border-radius:10px;font-size:16px;font-weight:700"')

def card(headline,description,button_label,tail=""):
    return (f'<!-- {stamp} -->' + base_style +
            f'<h2 style="font-size:22px;margin:0 0 16px">{headline}</h2>' +
            f'<p style="font-size:16px;line-height:1.8">{description}</p>' +
            f'<p style="margin:25px 0"><a href="{{{{ .ConfirmationURL }}}}" {button_style}>{button_label}</a></p>' +
            f'<p style="font-size:14px;line-height:1.7;color:#71657c">{tail}</p>' + footer)

brand_invite = card(
    "邀請您加入排隊怪獸",
    '您已收到企業 {{ if .Data.tenant_name }}<b>{{ .Data.tenant_name }}</b>{{ else }}管理者{{ end }} '
    '發出的員工邀請。請按下按鈕，完成身分驗證、設定登入密碼，之後即可進入企業管理後台。',
    "接受邀請並設定密碼",
    "此連結僅供受邀電子信箱使用。完成密碼設定前，無法使用企業後台。"
)
brand_recovery = card(
    "重設排隊怪獸登入密碼",
    "我們收到您的排隊怪獸帳號密碼重設申請。請使用下方安全連結重新設定密碼。",
    "設定新密碼",
    "密碼完成更新後，請使用新密碼登入排隊怪獸。"
)
brand_magic = card(
    "登入排隊怪獸",
    "請使用下方一次性連結開啟排隊怪獸。受邀員工如果尚未完成密碼設定，系統會先要求設定密碼。",
    "開啟排隊怪獸",
    "若非本人要求登入，請忽略此信。"
)
brand_confirmation = card(
    "驗證排隊怪獸帳號",
    "歡迎使用排隊怪獸。請驗證電子信箱以完成帳號建立；受邀員工驗證後再設定密碼與接受企業邀請。",
    "驗證電子信箱"
)
mail = [
    ("invite", '{{ if eq .Data.app "queue-monster" }}', brand_invite,
     "【排隊怪獸】企業員工邀請"),
    ("recovery", '{{ if eq .RedirectTo "' + reset_redirect + '" }}', brand_recovery,
     "【排隊怪獸】重設登入密碼"),
    ("magic_link",
     '{{ if or (eq .RedirectTo "' + invite_redirect + '") (eq .RedirectTo "' + login_redirect + '") }}',
     brand_magic, "【排隊怪獸】登入與接受企業邀請"),
    ("confirmation", '{{ if eq .Data.app "queue-monster" }}', brand_confirmation,
     "【排隊怪獸】驗證電子信箱")
]
defaults = {
 "invite": ("You've been invited", '<h2>You have been invited</h2><p>Follow the link to complete registration.</p><a href="{{ .ConfirmationURL }}">Accept invite</a>'),
 "recovery": ("Reset your password", '<h2>Reset your password</h2><p>Use this link to reset your password.</p><a href="{{ .ConfirmationURL }}">Reset password</a>'),
 "magic_link": ("Your sign-in link", '<h2>Your login link</h2><p><a href="{{ .ConfirmationURL }}">Sign in</a></p>'),
 "confirmation": ("Confirm your email address", '<h2>Confirm your email</h2><p><a href="{{ .ConfirmationURL }}">Confirm email</a></p>')
}
patch = {}
for name,condition,branded,branded_subject in mail:
    body_key = f"mailer_templates_{name}_content"
    subject_key = f"mailer_subjects_{name}"
    current_body = original.get(body_key) or defaults[name][1]
    current_subject = original.get(subject_key) or defaults[name][0]
    # Refuse an unreviewed reapplication instead of nesting templates indefinitely.
    if stamp in current_body:
        print(f"{name}: already branded, preserving")
        continue
    patch[body_key] = condition + branded + "{{ else }}" + current_body + "{{ end }}"
    patch[subject_key] = condition + branded_subject + "{{ else }}" + current_subject + "{{ end }}"
assert all(key not in patch for key in ("site_url","smtp_host","smtp_pass","uri_allow_list"))
if patch:
    api("PATCH", patch)
    changed = api("GET")
    for name,*_ in mail:
        key = f"mailer_templates_{name}_content"
        if key in patch and stamp not in (changed.get(key) or ""):
            raise RuntimeError(f"Branded {name} template did not persist")
    print("Branded Queue Monster-only invite, password reset, sign-in and confirmation templates verified.")
else:
    print("Queue Monster mail templates were already configured.")

# Native Supabase Auth enforces a >=6-character minimum in hosted projects.
# Never weaken this shared Auth project's policy for Chat/Workforce/OpenData.
# Queue Monster's client-only short-password encoding makes 1-character user
# input compatible with the existing native minimum (without adding entropy).
config = api("GET")
print("Shared Supabase Auth password minimum retained:",config.get("password_min_length"))
print("Queue Monster shorter passwords are encoded client-side; other products are unaffected.")
