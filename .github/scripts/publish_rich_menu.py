#!/usr/bin/env python3
"""Publish a six-tile headquarters LINE rich menu using a GitHub Actions secret.

No credentials, customer identifiers, or access tokens are written to git.
"""
import hashlib
import io
import json
import os
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 2500, 1686
SPLITS_X = [0, 833, 1666, WIDTH]
SPLITS_Y = [0, 843, HEIGHT]
BASE = "https://hub-google.github.io/LINE/booking/"
CENTER = BASE + "merchant-center.html"
CUSTOMER_ITEMS = [
    ("找店家預約", "搜尋全平台", "search", {"type":"uri","label":"找店家預約","uri":BASE+"directory.html?mode=search"}),
    ("現場取號", "選店家領號", "play", {"type":"uri","label":"現場取號","uri":BASE+"directory.html?mode=queue"}),
    ("我的紀錄", "跨店預約與號碼", "features", {"type":"uri","label":"我的紀錄","uri":BASE+"directory.html?mode=mine"}),
    ("遊戲逛街", "另一種找店方式", "store", {"type":"uri","label":"遊戲逛街","uri":BASE+"directory.html?mode=game"}),
    ("即時叫號", "選店查看看板", "dashboard", {"type":"uri","label":"即時叫號","uri":BASE+"directory.html?mode=queue"}),
    ("客服中心", "文字詢問協助", "support", {"type":"message","label":"客服中心","text":"客服"}),
]
MERCHANT_ITEMS = [
    ("商家開通", "不用自有 OA", "store", {"type":"uri","label":"商家開通","uri":BASE+"merchant-register.html"}),
    ("管理後台", "門市營運管理", "dashboard", {"type":"uri","label":"管理後台","uri":BASE+"?view=staff"}),
    ("預約與叫號", "登入後台操作", "features", {"type":"uri","label":"預約與叫號","uri":BASE+"?view=staff"}),
    ("QR 立牌", "取得專屬連結", "play", {"type":"uri","label":"QR 立牌","uri":CENTER+"#publish"}),
    ("操作教學", "圖解商家流程", "guide", {"type":"uri","label":"操作教學","uri":CENTER+"#guide"}),
    ("聯絡平台", "發訊息取得協助", "support", {"type":"message","label":"聯絡平台","text":"商家客服"}),
]
CUSTOMER_ALIAS = "platform-booking-customers"
MERCHANT_ALIAS = "platform-booking-merchants"
TAB_HEIGHT = 240



def font(size, bold=False):
    name = "NotoSansCJK-Bold.ttc" if bold else "NotoSansCJK-Regular.ttc"
    candidates = [
        "/usr/share/fonts/opentype/noto/" + name,
        "/usr/share/fonts/truetype/noto/" + name,
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size, index=0)
    raise RuntimeError("Noto Sans CJK is required to render Traditional Chinese.")


def icon(draw, kind, x, y, ink):
    stroke = 18
    if kind == "search":
        draw.ellipse((x - 98, y - 100, x + 35, y + 33), outline=ink, width=stroke)
        draw.line((x + 23, y + 20, x + 103, y + 102), fill=ink, width=stroke)
    elif kind == "play":
        draw.ellipse((x - 96, y - 96, x + 96, y + 96), outline=ink, width=stroke)
        draw.polygon([(x - 24, y - 52), (x + 68, y), (x - 24, y + 52)], fill=ink)
    elif kind == "store":
        draw.rounded_rectangle((x - 100, y - 31, x + 100, y + 94), radius=10, outline=ink, width=stroke)
        draw.polygon([(x - 118, y - 35), (x - 86, y - 100), (x + 86, y - 100), (x + 118, y - 35)], outline=ink)
        draw.line([(x - 113, y - 35), (x + 113, y - 35)], fill=ink, width=stroke)
        draw.rectangle((x - 25, y + 15, x + 38, y + 94), outline=ink, width=12)
    elif kind == "dashboard":
        draw.rounded_rectangle((x - 113, y - 91, x + 113, y + 91), radius=22, outline=ink, width=stroke)
        draw.line((x - 102, y - 45, x + 102, y - 45), fill=ink, width=10)
        draw.ellipse((x - 78, y - 76, x - 59, y - 57), fill=ink)
        draw.rectangle((x - 69, y + 20, x - 37, y + 60), fill=ink)
        draw.rectangle((x - 15, y - 4, x + 17, y + 60), fill=ink)
        draw.rectangle((x + 39, y - 20, x + 71, y + 60), fill=ink)
    elif kind == "features":
        draw.rounded_rectangle((x - 96, y - 92, x + 96, y + 91), radius=18, outline=ink, width=stroke)
        draw.line((x - 96, y - 38, x + 96, y - 38), fill=ink, width=13)
        draw.line((x - 53, y - 113, x - 53, y - 66), fill=ink, width=16)
        draw.line((x + 53, y - 113, x + 53, y - 66), fill=ink, width=16)
        draw.line((x - 43, y + 20, x - 10, y + 50, x + 54, y - 17), fill=ink, width=15, joint="curve")
    elif kind == "guide":
        draw.line((x, y - 74, x, y + 86), fill=ink, width=12)
        draw.line((x - 111, y - 66, x - 87, y - 84, x - 42, y - 82, x, y - 65, x + 42, y - 82, x + 87, y - 84, x + 111, y - 66), fill=ink, width=15, joint="curve")
        draw.line((x - 111, y - 66, x - 111, y + 70, x - 54, y + 60, x, y + 86, x + 54, y + 60, x + 111, y + 70, x + 111, y - 66), fill=ink, width=15, joint="curve")
    elif kind == "support":
        draw.arc((x - 94, y - 95, x + 94, y + 105), 180, 360, fill=ink, width=19)
        draw.rounded_rectangle((x - 110, y - 11, x - 62, y + 80), radius=18, outline=ink, width=15)
        draw.rounded_rectangle((x + 62, y - 11, x + 110, y + 80), radius=18, outline=ink, width=15)
        draw.arc((x - 1, y + 9, x + 100, y + 120), 3, 100, fill=ink, width=13)
        draw.ellipse((x - 6, y + 94, x + 30, y + 125), fill=ink)


def monster_badge(draw, cx, cy, r):
    """Small illustrated monster stamp; line art stays inside tap regions."""
    ink = "#462B52"
    purple = "#CA90E5"
    yellow = "#FEC55A"
    draw.ellipse((cx-r, cy-r*.83, cx+r, cy+r), fill=purple, outline=ink, width=max(4, int(r*.075)))
    draw.polygon([(cx-r*.9,cy-r*.42),(cx-r*1.08,cy-r*1.16),
                  (cx-r*.35,cy-r*.72)], fill=yellow)
    draw.polygon([(cx+r*.9,cy-r*.42),(cx+r*1.08,cy-r*1.16),
                  (cx+r*.35,cy-r*.72)], fill=yellow)
    w=max(4,int(r*.08))
    draw.arc((cx-r*.55,cy-r*.22,cx-r*.08,cy+r*.23),180,350,fill=ink,width=w)
    draw.arc((cx+r*.08,cy-r*.22,cx+r*.55,cy+r*.23),180,350,fill=ink,width=w)
    draw.ellipse((cx-r*.73,cy+r*.18,cx-r*.40,cy+r*.42),fill="#FCA5C7")
    draw.ellipse((cx+r*.40,cy+r*.18,cx+r*.73,cy+r*.42),fill="#FCA5C7")
    draw.arc((cx-r*.27,cy+r*.02,cx+r*.27,cy+r*.63),0,180,fill=ink,width=w)

def create_image(items, selected):
    im = Image.new("RGB", (WIDTH, HEIGHT), "#462B52")
    d = ImageDraw.Draw(im)
    ink = "#462B52"
    bold = font(82, True)
    small = font(36)
    tab_font = font(70, True)
    for idx, label in enumerate(("顧客服務", "商家服務")):
        x0, x1 = idx * WIDTH // 2, (idx+1) * WIDTH // 2
        is_active = idx == selected
        d.rounded_rectangle((x0+8, 7, x1-8, TAB_HEIGHT-7), radius=35,
                            fill="#F4DEFB" if is_active else "#6D4385")
        d.text(((x0+x1)//2, TAB_HEIGHT//2), label,
               font=tab_font, fill=ink if is_active else "#ffffff", anchor="mm")
        monster_badge(d, x0+100, TAB_HEIGHT//2, 59)
    row_height = (HEIGHT - TAB_HEIGHT) // 2
    for i, (title, description, glyph, _) in enumerate(items):
        row, col = divmod(i, 3)
        left, right = SPLITS_X[col], SPLITS_X[col+1]
        top, bottom = TAB_HEIGHT + row*row_height, TAB_HEIGHT + (row+1)*row_height
        d.rounded_rectangle((left+7, top+7, right-7, bottom-7), radius=25,
                            fill=("#EDD8FB" if i%3==0 else "#FFF0CF" if i%3==1 else "#FFE8F2"))
        cx, cy = (left+right)//2, top+210
        d.ellipse((cx-118, cy-118, cx+118, cy+118), fill="#FCF7FF")
        icon(d, glyph, cx, cy, ink)
        d.text((cx, top+434), title, font=bold, fill=ink, anchor="mm")
        d.rounded_rectangle((cx-280, top+525, cx+280, top+615),
                            radius=42, fill="#E7CAFA")
        d.text((cx, top+570), description, font=small, fill=ink, anchor="mm")
        monster_badge(d, left+94, top+96, 48)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    content = buf.getvalue()
    if len(content) > 1024*1024:
        raise RuntimeError("LINE rich menu image exceeds 1MB")
    return content


def api(path, token, method="GET", body=None, host="https://api.line.me", content_type="application/json"):
    headers = {"Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(host + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            raw = response.read()
            if raw and response.headers.get("Content-Type", "").startswith("application/json"):
                return json.loads(raw.decode("utf-8"))
            return raw
    except urllib.error.HTTPError as e:
        # Do not print request headers or access token.
        raise RuntimeError(f"LINE API {method} {path} returned HTTP {e.code}") from None


def publish_menu(token, items, active, name_prefix):
    image = create_image(items, active)
    areas = [
        {"bounds":{"x":0,"y":0,"width":WIDTH//2,"height":TAB_HEIGHT},
         "action":{"type":"richmenuswitch","label":"顧客服務",
                   "richMenuAliasId":CUSTOMER_ALIAS,"data":"menu:customer"}},
        {"bounds":{"x":WIDTH//2,"y":0,"width":WIDTH-WIDTH//2,"height":TAB_HEIGHT},
         "action":{"type":"richmenuswitch","label":"商家服務",
                   "richMenuAliasId":MERCHANT_ALIAS,"data":"menu:merchant"}},
    ]
    row_height = (HEIGHT-TAB_HEIGHT)//2
    for i, (_, _, _, action) in enumerate(items):
        row, col = divmod(i,3)
        areas.append({"bounds":{"x":SPLITS_X[col],"y":TAB_HEIGHT+row*row_height,
              "width":SPLITS_X[col+1]-SPLITS_X[col],"height":row_height},
              "action":action})
    config = {
        "size":{"width":WIDTH,"height":HEIGHT},
        "selected":True,
        "name":name_prefix + hashlib.sha256(
            image+json.dumps(areas,ensure_ascii=False,sort_keys=True).encode("utf-8")
        ).hexdigest()[:16],
        "chatBarText":"排隊怪獸｜預約取號",
        "areas":areas,
    }
    existing = next((m for m in api("/v2/bot/richmenu/list",token).get("richmenus",[])
                     if m.get("name")==config["name"]),None)
    if existing:
        menu_id=existing["richMenuId"]
        print("Reusing versioned menu",name_prefix)
    else:
        result=api("/v2/bot/richmenu",token,"POST",
                   json.dumps(config,ensure_ascii=False).encode("utf-8"))
        menu_id=result["richMenuId"]
        print("Created versioned menu",name_prefix)
    try:
        api(f"/v2/bot/richmenu/{menu_id}/content",token,host="https://api-data.line.me")
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise
        api(f"/v2/bot/richmenu/{menu_id}/content",token,"POST",image,
            host="https://api-data.line.me",content_type="image/png")
    return menu_id


def sync_alias(token, alias, menu_id):
    payload=json.dumps({"richMenuId":menu_id}).encode("utf-8")
    try:
        existing=api(f"/v2/bot/richmenu/alias/{alias}",token)
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise
        api("/v2/bot/richmenu/alias",token,"POST",
            json.dumps({"richMenuAliasId":alias,"richMenuId":menu_id}).encode("utf-8"))
        print("Created menu alias",alias)
        return
    if existing.get("richMenuId")!=menu_id:
        api(f"/v2/bot/richmenu/alias/{alias}",token,"POST",payload)
        print("Updated menu alias",alias)


def main():
    token=os.environ.get("LINE_MESSAGING_ACCESS_TOKEN","")
    if not token:
        raise RuntimeError("Missing LINE_MESSAGING_ACCESS_TOKEN Actions secret")
    info=api("/v2/bot/info",token)
    if not info.get("userId","").startswith("U"):
        raise RuntimeError("LINE token does not belong to a valid Official Account")
    live_name=info.get("displayName","")
    print("Live LINE OA display name: "+(live_name or "(unknown)"))
    if live_name!="排隊怪獸":
        print("::warning title=OA account name not updated::Change the official account display name to 排隊怪獸 in LINE Official Account Manager; Messaging API cannot rename the actual OA.")
    customers=publish_menu(token,CUSTOMER_ITEMS,0,"platform-customers-")
    merchants=publish_menu(token,MERCHANT_ITEMS,1,"platform-merchants-")
    sync_alias(token,CUSTOMER_ALIAS,customers)
    sync_alias(token,MERCHANT_ALIAS,merchants)
    api(f"/v2/bot/user/all/richmenu/{customers}",token,"POST")
    current=api("/v2/bot/user/all/richmenu",token)
    if current.get("richMenuId")!=customers:
        raise RuntimeError("Default customer rich menu verification failed")
    for alias, expected in ((CUSTOMER_ALIAS,customers),(MERCHANT_ALIAS,merchants)):
        actual=api(f"/v2/bot/richmenu/alias/{alias}",token)
        if actual.get("richMenuId")!=expected:
            raise RuntimeError("Rich menu alias verification failed: "+alias)
    print("LIVE: Customer rich menu set as default, merchant tab linked.")
    print("customerMenuId="+customers)
    print("merchantMenuId="+merchants)


if __name__ == "__main__":
    main()
