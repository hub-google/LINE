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
signup_redirect = "https://hub-google.github.io/LINE/booking/merchant-register.html?mode=login&intent=complete-signup"
reset_redirect = "https://hub-google.github.io/LINE/booking/merchant-register.html?mode=login&intent=recovery"
stamp = "queue-monster-mail-v3"
legacy_stamp = "queue-monster-mail-v2"
# Use tables and inline styles for broad email-client compatibility. No remote
# fonts, embedded SVG, scripting, or images that become broken when blocked.
brand_start = (
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    '<body style="margin:0;padding:0;background:#f5f1f8;color:#30263a;'
    'font-family:Arial,Microsoft JhengHei,PingFang TC,sans-serif">'
)
body_open = (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
    'style="background:#f5f1f8;padding:32px 12px"><tr><td align="center">'
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
    'style="max-width:560px;background:#ffffff;border:1px solid #e9dff1;'
    'border-radius:18px;overflow:hidden;text-align:left">'
    '<tr><td style="padding:27px 32px 23px;background:#523b70;color:#fff">'
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    '<td style="vertical-align:middle;padding-right:13px">'
    '<img src="https://hub-google.github.io/LINE/booking/pwa-icon-192.png" '
    'width="47" height="47" alt="排隊怪獸" '
    'style="display:block;border:0;border-radius:10px"></td>'
    '<td style="vertical-align:middle">'
    '<div style="font-size:24px;line-height:1.3;font-weight:800;'
    'letter-spacing:1px">排隊怪獸</div>'
    '<div style="font-size:12px;opacity:.85;letter-spacing:1.2px">'
    'QUEUING MONSTER</div></td></tr></table></td></tr>'
    '<tr><td style="padding:32px 32px 27px">'
    '<div style="color:#79628c;font-size:13px;font-weight:700;'
    'letter-spacing:1px;margin-bottom:12px">讓等待少一點，服務順一點</div>'
)
button_style = (
    'style="display:inline-block;background:#523b70;color:#ffffff;'
    'text-decoration:none;padding:15px 28px;border-radius:10px;'
    'font-size:16px;font-weight:700"'
)
footer = (
    '<div style="margin-top:30px;border-top:1px solid #efe8f3;padding-top:18px;'
    'font-size:12px;line-height:1.9;color:#7b7282">'
    '這封信由排隊怪獸系統自動寄出，請勿直接回覆。'
    '我們不會透過電子郵件索取您的登入密碼。'
    '<br>排隊怪獸｜讓每一次等待都更輕鬆'
    '<br><a href="https://hub-google.github.io/LINE/booking/" '
    'style="color:#523b70;text-decoration:none">前往排隊怪獸網站</a>'
    '</div></td></tr></table></td></tr></table></body></html>'
)
def card(headline, description, button_label, tail="", preview=""):
    preheader = (preview or headline).replace("&", "&amp;").replace("<", "&lt;")
    hidden = ('<div style="display:none;max-height:0;overflow:hidden;'
              'opacity:0;color:transparent">' + preheader + '</div>')
    return (f'<!-- {stamp} -->' + brand_start + hidden + body_open +
        f'<h1 style="font-size:27px;line-height:1.35;color:#352849;'
        f'margin:0 0 18px;font-weight:800">{headline}</h1>' +
        f'<p style="font-size:16px;line-height:1.85;margin:0;color:#44374f">{description}</p>' +
        f'<p style="margin:28px 0 24px"><a href="{{{{ .ConfirmationURL }}}}" '
        f'{button_style}>{button_label}</a></p>' +
        (f'<p style="font-size:13px;line-height:1.85;color:#71667a;margin:0">'
         f'{tail}</p>' if tail else '') + footer)

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
    "歡迎加入排隊怪獸！",
    "歡迎來到排隊怪獸。只差最後一步，請點選下方按鈕驗證您的電子信箱。"
    "驗證完成後，即可登入並建立店家專屬的預約、取號、叫號與線上點餐服務。",
    "完成信箱驗證",
    "如果您沒有註冊排隊怪獸，請直接忽略此信，無須進行任何操作。",
    "歡迎加入排隊怪獸！確認電子信箱，就能開始打造更輕鬆的店家服務。"
)
mail = [
    ("invite", '{{ if eq .Data.app "queue-monster" }}', brand_invite,
     "【排隊怪獸】企業員工邀請"),
    ("recovery", '{{ if eq .RedirectTo "' + reset_redirect + '" }}', brand_recovery,
     "【排隊怪獸】重設登入密碼"),
    ("magic_link",
     '{{ if or (eq .RedirectTo "' + invite_redirect + '") (eq .RedirectTo "' + login_redirect + '") (eq .RedirectTo "' + signup_redirect + '") }}',
     brand_magic, "【排隊怪獸】登入與接受企業邀請"),
    ("confirmation", '{{ if eq .Data.app "queue-monster" }}', brand_confirmation,
     "【排隊怪獸】歡迎加入！請驗證電子信箱")
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
    # Idempotent v2 upgrade: replace only Queue Monster's legacy branded markup.
    # Keep the shared project's pre-existing non-Queue-Monster {{ else }} branch.
    if stamp in current_body:
        if name == "magic_link" and signup_redirect not in current_body:
            old_condition = ('{{ if or (eq .RedirectTo "' + invite_redirect +
                             '") (eq .RedirectTo "' + login_redirect + '") }}')
            if old_condition not in current_body or old_condition not in current_subject:
                raise RuntimeError("magic_link: unexpected branded template; refusing shared config overwrite")
            patch[body_key] = current_body.replace(old_condition, condition, 1)
            patch[subject_key] = current_subject.replace(old_condition, condition, 1)
            print("magic_link: added Queue Monster registration verification redirect")
        else:
            print(f"{name}: v3 brand already installed")
        continue
    if legacy_stamp in current_body:
        import re
        legacy_pattern = re.compile(
            r'<!-- queue-monster-mail-v2 --><!doctype html>.*?</html>', re.DOTALL
        )
        upgraded, replaced = legacy_pattern.subn(lambda _: branded, current_body, count=1)
        if replaced != 1 or condition not in upgraded:
            raise RuntimeError(f"{name}: unable to safely upgrade old branded email")
        patch[body_key] = upgraded
        old_brand_subjects = {
            "invite": "【排隊怪獸】企業員工邀請",
            "recovery": "【排隊怪獸】重設登入密碼",
            "magic_link": "【排隊怪獸】登入與接受企業邀請",
            "confirmation": "【排隊怪獸】歡迎加入！請驗證電子信箱",
        }
        old_title = old_brand_subjects[name]
        if old_title not in current_subject:
            raise RuntimeError(f"{name}: unexpected shared Auth subject; refusing overwrite")
        patch[subject_key] = current_subject.replace(old_title, branded_subject, 1)
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
    if "mailer_templates_magic_link_content" in patch:
        if signup_redirect not in (changed.get("mailer_templates_magic_link_content") or ""):
            raise RuntimeError("Queue Monster signup verification not included in Magic Link brand routing")
    print("Queue Monster branded templates and subjects saved and verified.")
else:
    print("Queue Monster mail templates were already configured.")

# Native Supabase Auth enforces a >=6-character minimum in hosted projects.
# Never weaken this shared Auth project's policy for Chat/Workforce/OpenData.
# Queue Monster's client-only short-password encoding makes 1-character user
# input compatible with the existing native minimum (without adding entropy).
config = api("GET")
print("Shared Supabase Auth password minimum retained:",config.get("password_min_length"))
print("Queue Monster shorter passwords are encoded client-side; other products are unaffected.")
