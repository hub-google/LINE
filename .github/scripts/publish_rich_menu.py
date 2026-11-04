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
ITEMS = [
    ("搜尋店家", "找店家並預約", "search", {"type": "uri", "label": "搜尋店家", "uri": BASE + "directory.html?mode=search"}),
    ("我的預約", "查看與取消", "features", {"type": "uri", "label": "我的預約", "uri": BASE + "directory.html?mode=mine"}),
    ("現場取號", "選店家領號碼", "play", {"type": "uri", "label": "現場取號", "uri": BASE + "directory.html?mode=queue"}),
    ("商家免費開通", "沒有 OA 也能用", "store", {"type": "uri", "label": "商家免費開通", "uri": CENTER + "#activate"}),
    ("商家管理後台", "預約與叫號管理", "dashboard", {"type": "uri", "label": "商家管理後台", "uri": BASE + "?view=staff"}),
    ("客服與教學", "操作說明與協助", "support", {"type": "uri", "label": "客服與教學", "uri": CENTER + "#guide"}),
]


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


def create_image():
    im = Image.new("RGB", (WIDTH, HEIGHT), "#073d35")
    d = ImageDraw.Draw(im)
    ink = "#06473d"
    bold = font(96, True)
    small = font(42)
    for i, (title, description, glyph, _) in enumerate(ITEMS):
        row, col = divmod(i, 3)
        left, right = SPLITS_X[col], SPLITS_X[col + 1]
        top, bottom = SPLITS_Y[row], SPLITS_Y[row + 1]
        bg = "#def5e8" if i == 1 else "#fffdfa"
        d.rounded_rectangle((left + 7, top + 7, right - 7, bottom - 7), radius=28, fill=bg)
        center_x = (left + right) // 2
        center_y = top + 275
        d.ellipse((center_x - 143, center_y - 143, center_x + 143, center_y + 143), fill="#e5f5ed")
        icon(d, glyph, center_x, center_y, ink)
        d.text((center_x, top + 510), title, font=bold, fill=ink, anchor="mm")
        pill_width, pill_height = 460, 82
        d.rounded_rectangle((center_x - pill_width // 2, top + 630, center_x + pill_width // 2, top + 630 + pill_height), radius=40, fill="#caedda")
        d.text((center_x, top + 672), description, font=small, fill=ink, anchor="mm")
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    value = buf.getvalue()
    if len(value) > 1024 * 1024:
        raise RuntimeError("LINE rich menu image exceeds 1MB")
    return value


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


def main():
    token = os.environ.get("LINE_MESSAGING_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("Missing LINE_MESSAGING_ACCESS_TOKEN Actions secret")
    image = create_image()
    areas = []
    for i, (_, _, _, action) in enumerate(ITEMS):
        row, col = divmod(i, 3)
        areas.append({
            "bounds": {
                "x": SPLITS_X[col], "y": SPLITS_Y[row],
                "width": SPLITS_X[col + 1] - SPLITS_X[col],
                "height": SPLITS_Y[row + 1] - SPLITS_Y[row],
            },
            "action": action,
        })
    config = {
        "size": {"width": WIDTH, "height": HEIGHT},
        "selected": True,
        "name": "hq-merchant-" + hashlib.sha256(image + json.dumps(areas, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:16],
        "chatBarText": "商家服務選單",
        "areas": areas,
    }
    info = api("/v2/bot/info", token)
    if not info.get("userId", "").startswith("U"):
        raise RuntimeError("LINE token does not belong to a valid Official Account")
    menus = api("/v2/bot/richmenu/list", token).get("richmenus", [])
    existing = next((m for m in menus if m.get("name") == config["name"]), None)
    if existing:
        menu_id = existing["richMenuId"]
        print("Reusing existing versioned rich menu.")
    else:
        result = api("/v2/bot/richmenu", token, "POST", json.dumps(config, ensure_ascii=False).encode("utf-8"))
        menu_id = result["richMenuId"]
        print("Created new versioned rich menu.")
    try:
        api(f"/v2/bot/richmenu/{menu_id}/content", token, host="https://api-data.line.me")
        print("Rich menu image already uploaded.")
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise
        api(f"/v2/bot/richmenu/{menu_id}/content", token, "POST", image,
            host="https://api-data.line.me", content_type="image/png")
        print("Uploaded rich menu image.")
    api(f"/v2/bot/user/all/richmenu/{menu_id}", token, "POST")
    current = api("/v2/bot/user/all/richmenu", token)
    if current.get("richMenuId") != menu_id:
        raise RuntimeError("Default rich menu verification failed")
    print("LIVE: headquarters rich menu set as Messaging API default.")
    print("richMenuId=" + menu_id)


if __name__ == "__main__":
    main()
