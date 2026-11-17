#!/usr/bin/env python3
"""Publish the WORKFORCE official-account rich menu. No credentials enter git/logs."""
from __future__ import annotations

import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686
MINI = {
    "developing": "2012649404-nz3TBQdG",
    "published": "2012649406-KzlLEZT6",
}
ACTIONS = [
    ("上下班打卡", "每日打卡・確認時間", "punch", "clock"),
    ("我的班表", "快速查看排班", "schedule", "calendar"),
    ("差勤申請", "請假・加班・補卡", "requests", "document"),
    ("通知紀錄", "申請與異動進度", "inbox", "bell"),
    ("工作總覽", "回到我的工作台", "overview", "grid"),
    ("審核中心", "主管專用", "approvals", "check"),
]
X = (0, 833, 1666, 2500)
Y = (0, 843, 1686)


def menu_body(environment: str) -> dict:
    if environment not in MINI:
        raise ValueError("Unsupported OA environment; choose developing or published")
    app_id = MINI[environment]
    return {
        "size": {"width": W, "height": H},
        "selected": True,
        "name": f"工作怪獸-{environment}-v1",
        "chatBarText": "工作怪獸｜打卡・排班",
        "areas": [
            {
                "bounds": {
                    "x": X[i % 3],
                    "y": Y[i // 3],
                    "width": X[i % 3 + 1] - X[i % 3],
                    "height": Y[i // 3 + 1] - Y[i // 3],
                },
                "action": {
                    "type": "uri",
                    "label": title,
                    "uri": f"https://miniapp.line.me/{app_id}?tab={tab}",
                },
            }
            for i, (title, _, tab, _) in enumerate(ACTIONS)
        ],
    }


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "NotoSansCJK-Bold.ttc" if bold else "NotoSansCJK-Regular.ttc"
    candidates = [
        f"/usr/share/fonts/opentype/noto/{name}",
        f"/usr/share/fonts/truetype/noto/{name}",
    ]
    for candidate in candidates:
        if os.path.isfile(candidate):
            return ImageFont.truetype(candidate, size, index=3)
    raise RuntimeError("Missing Noto Sans CJK font; install fonts-noto-cjk")


def generate_image() -> bytes:
    image = Image.new("RGB", (W, H), "#F2F6F5")
    draw = ImageDraw.Draw(image)
    heading = font(89, True)
    caption = font(36, False)
    dark, green = "#183F3B", "#12765C"

    def stroke(points, width=12):
        draw.line(points, fill=green, width=width, joint="curve")

    def icon(kind, cx, cy):
        if kind == "clock":
            draw.ellipse((cx-66, cy-66, cx+66, cy+66), outline=green, width=14)
            stroke([(cx, cy-43), (cx, cy), (cx+38, cy+21)], 15)
        elif kind == "calendar":
            draw.rounded_rectangle((cx-67,cy-58,cx+67,cy+63),radius=17,outline=green,width=13)
            stroke([(cx-61,cy-18),(cx+61,cy-18)],9)
            stroke([(cx-30,cy-73),(cx-30,cy-43)],12)
            stroke([(cx+30,cy-73),(cx+30,cy-43)],12)
            for dx in (-30,18):
                for dy in (6,37):
                    draw.ellipse((cx+dx-6,cy+dy-6,cx+dx+6,cy+dy+6),fill=green)
        elif kind == "document":
            draw.rounded_rectangle((cx-56,cy-70,cx+57,cy+69),radius=14,outline=green,width=12)
            for dy in (-28,2,32):
                stroke([(cx-30,cy+dy),(cx+32,cy+dy)],9)
        elif kind == "bell":
            draw.arc((cx-57,cy-65,cx+57,cy+55),182,359,fill=green,width=12)
            stroke([(cx-61,cy+47),(cx+61,cy+47)],12)
            draw.ellipse((cx-13,cy+60,cx+13,cy+78),fill=green)
        elif kind == "grid":
            for dx in (-48,24):
                for dy in (-55,17):
                    draw.rounded_rectangle((cx+dx,cy+dy,cx+dx+51,cy+dy+51),
                                           radius=10,outline=green,width=10)
        elif kind == "check":
            draw.ellipse((cx-66,cy-66,cx+66,cy+66),outline=green,width=12)
            stroke([(cx-35,cy+4),(cx-6,cy+29),(cx+42,cy-25)],16)

    for i, (title, description, _, shape) in enumerate(ACTIONS):
        c, row = i % 3, i // 3
        x1, x2, y1, y2 = X[c], X[c+1], Y[row], Y[row+1]
        cx, cy = (x1+x2)//2, y1 + 245
        draw.rounded_rectangle((x1+24,y1+31,x2-24,y2-17),
                               radius=38,fill="#DFE8E5")
        draw.rounded_rectangle((x1+24,y1+24,x2-24,y2-24),
                               radius=38,fill="#FFFFFF")
        draw.rounded_rectangle((cx-113,cy-114,cx+113,cy+113),
                               radius=55,fill="#E7F5EF")
        icon(shape,cx,cy)
        bbox=draw.textbbox((0,0),title,font=heading)
        draw.text((cx-(bbox[2]-bbox[0])/2,y1+430),title,font=heading,fill=dark)
        bbox=draw.textbbox((0,0),description,font=caption)
        draw.text((cx-(bbox[2]-bbox[0])/2,y1+570),description,font=caption,fill="#657D7A")
    output=io.BytesIO()
    image.save(output,"PNG",optimize=True)
    raw=output.getvalue()
    if not (raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw)<1024*1024):
        raise RuntimeError("Invalid LINE rich-menu image (must be PNG <1MB)")
    return raw


def call(host: str, path: str, method: str, token: str, *, payload=None, mime="application/json"):
    body=None
    if payload is not None:
        body=json.dumps(payload,ensure_ascii=False).encode() if isinstance(payload,dict) else payload
    headers={"Authorization":f"Bearer {token}"}
    if body is not None:
        headers["Content-Type"]=mime
    request=urllib.request.Request("https://"+host+path,data=body,headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=25) as response:
            response_data=response.read()
            if not response_data:
                return {}
            return json.loads(response_data)
    except urllib.error.HTTPError as e:
        # Never log the request, Authorization header, or token!
        raise RuntimeError(f"LINE API {method} {path.split('?')[0]} failed with HTTP {e.code}") from None


def validate_token(token: str, channel_id: str) -> None:
    form=urllib.parse.urlencode({"access_token":token}).encode()
    request=urllib.request.Request(
        "https://api.line.me/v2/oauth/verify",
        data=form,method="POST",headers={"Content-Type":"application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(request,timeout=25) as response:
            identity=json.load(response)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"LINE access token verification failed (HTTP {e.code})") from None
    if identity.get("client_id") != channel_id:
        raise RuntimeError("LINE access token belongs to a different Messaging API Channel; refusing to modify OA")
    if int(identity.get("expires_in",0)) <= 0:
        raise RuntimeError("LINE access token expired")


def publish(environment: str, token: str, channel_id: str) -> str:
    if not (channel_id.isdecimal() and len(channel_id) >= 8):
        raise RuntimeError("Invalid WF_LINE_MESSAGING_CHANNEL_ID secret")
    if not token or len(token)<32:
        raise RuntimeError("Missing WF_LINE_MESSAGING_ACCESS_TOKEN secret")
    validate_token(token,channel_id)
    info=call("api.line.me","/v2/bot/info","GET",token)
    if not info.get("userId","").startswith("U"):
        raise RuntimeError("LINE OA identity could not be verified")
    menu=menu_body(environment)
    try:
        old=call("api.line.me","/v2/bot/user/all/richmenu","GET",token)
        prior=old.get("richMenuId")
    except RuntimeError as e:
        if "HTTP 404" not in str(e):raise
        prior=None
    if prior:
        prior_data=call("api.line.me","/v2/bot/richmenu/"+prior,"GET",token)
        old_name=prior_data.get("name","")
        if not old_name.startswith("工作怪獸-"):
            raise RuntimeError("The OA already has a rich menu not owned by WORKFORCE; refusing overwrite")
        if old_name==menu["name"]:
            print("WORKFORCE rich menu already configured for requested MINI App environment.")
            return prior

    png=generate_image()
    result=call("api.line.me","/v2/bot/richmenu","POST",token,payload=menu)
    rich_menu_id=result["richMenuId"]
    if not rich_menu_id.startswith("richmenu-"):
        raise RuntimeError("LINE rich-menu creation returned invalid ID")
    call("api-data.line.me",f"/v2/bot/richmenu/{rich_menu_id}/content",
         "POST",token,payload=png,mime="image/png")
    call("api.line.me",f"/v2/bot/user/all/richmenu/{rich_menu_id}","POST",token)
    confirmation=call("api.line.me","/v2/bot/user/all/richmenu","GET",token)
    if confirmation.get("richMenuId")!=rich_menu_id:
        raise RuntimeError("LINE rich menu was created, but default menu did not match")
    print(f"WORKFORCE OA rich menu configured and verified: {environment} ({rich_menu_id}).")
    return rich_menu_id


def main():
    environment=os.environ.get("WF_LINE_OA_ENV","developing")
    menu=menu_body(environment)
    png=generate_image()
    print(f"WORKFORCE {environment} image validated: {W}x{H}, {len(png)} bytes.")
    assert len(menu["areas"])==6
    if "--validate" in sys.argv:
        print("Validated 6 distinct MINI App URI targets; no API request made.")
        return
    channel=os.environ.get("WF_LINE_MESSAGING_CHANNEL_ID","")
    token=os.environ.get("WF_LINE_MESSAGING_ACCESS_TOKEN","")
    if not os.environ.get("WF_LINE_MESSAGING_CHANNEL_SECRET"):
        raise RuntimeError("Missing WF_LINE_MESSAGING_CHANNEL_SECRET secret")
    publish(environment,token,channel)

if __name__=="__main__":
    try:
        main()
    except Exception as err:
        # Security rule: never print exception repr/traceback which might contain authorization values.
        print("::error title=WORKFORCE OA menu::"+str(err),file=sys.stderr)
        raise SystemExit(1)
