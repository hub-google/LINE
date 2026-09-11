"""
server/flex_templates.py
LINE Messaging API 結構化 Flex Message 模板產生器
- 3 天緩衝待解散公告 (Notice Broadcast)
- 異議生效終止公告 (Revocation Notice)
- 72 小時公示期滿告別公告 (Farewell Notice)
"""
from __future__ import annotations

from typing import Any, Dict


def build_dissolve_notice_flex(
    group_name: str,
    initiator_name: str,
    dissolve_at_str: str,
    revoke_url: str,
) -> Dict[str, Any]:
    """
    建立高辨識度 3 天待解散公告 Flex Message
    包含警告橫幅、解散時間、發起人、防誤觸異議終止按鈕
    """
    return {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#DC2626",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": "⚠️ 群組待解散通知公告",
                    "weight": "bold",
                    "color": "#FFFFFF",
                    "size": "lg",
                }
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "paddingAll": "20px",
            "contents": [
                {
                    "type": "text",
                    "text": f"此群組已被【{initiator_name}】標註為待解散群組。",
                    "weight": "bold",
                    "size": "md",
                    "wrap": True,
                    "color": "#1F2937",
                },
                {
                    "type": "box",
                    "layout": "vertical",
                    "backgroundColor": "#F3F4F6",
                    "cornerRadius": "8px",
                    "paddingAll": "12px",
                    "margin": "md",
                    "contents": [
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "目標群組：",
                                    "size": "sm",
                                    "color": "#6B7280",
                                    "flex": 3,
                                },
                                {
                                    "type": "text",
                                    "text": group_name,
                                    "size": "sm",
                                    "color": "#111827",
                                    "weight": "bold",
                                    "flex": 7,
                                    "wrap": True,
                                },
                            ],
                        },
                        {
                            "type": "box",
                            "layout": "horizontal",
                            "margin": "sm",
                            "contents": [
                                {
                                    "type": "text",
                                    "text": "預計解散：",
                                    "size": "sm",
                                    "color": "#6B7280",
                                    "flex": 3,
                                },
                                {
                                    "type": "text",
                                    "text": dissolve_at_str,
                                    "size": "sm",
                                    "color": "#DC2626",
                                    "weight": "bold",
                                    "flex": 7,
                                    "wrap": True,
                                },
                            ],
                        },
                    ],
                },
                {
                    "type": "text",
                    "text": "若您認為此群組仍有重要紀錄或不應解散，請點擊下方按鈕進行保留。只要任一成員確認保留，解散程序即刻終止。",
                    "size": "xs",
                    "color": "#4B5563",
                    "wrap": True,
                    "margin": "md",
                },
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": "#059669",
                    "height": "sm",
                    "action": {
                        "type": "uri",
                        "label": "👉 點此保留群組 (終止解散)",
                        "uri": revoke_url,
                    },
                }
            ],
        },
    }


def build_revoked_notice_flex(
    group_name: str,
    cancelled_by: str,
) -> Dict[str, Any]:
    """
    建立異議生效、群組保留公告 Flex Message
    """
    return {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#059669",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": "🔔 解散程序已終止",
                    "weight": "bold",
                    "color": "#FFFFFF",
                    "size": "lg",
                }
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "paddingAll": "20px",
            "contents": [
                {
                    "type": "text",
                    "text": f"本群組解散要求已由成員【{cancelled_by or '群組成員'}】正式終止！",
                    "weight": "bold",
                    "size": "md",
                    "wrap": True,
                    "color": "#065F46",
                },
                {
                    "type": "text",
                    "text": "此群組將繼續完整保留。感謝您的反饋，機器人即將自動退出本群組。",
                    "size": "sm",
                    "color": "#4B5563",
                    "wrap": True,
                    "margin": "md",
                },
            ],
        },
    }


def build_farewell_notice_flex(
    group_name: str,
) -> Dict[str, Any]:
    """
    建立 72 小時公示期滿告別公告 Flex Message
    """
    return {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#4B5563",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": "⏰ 公示期滿通知",
                    "weight": "bold",
                    "color": "#FFFFFF",
                    "size": "lg",
                }
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "paddingAll": "20px",
            "contents": [
                {
                    "type": "text",
                    "text": "3 天公示期已屆滿且無任何成員提出異議。",
                    "weight": "bold",
                    "size": "md",
                    "wrap": True,
                    "color": "#111827",
                },
                {
                    "type": "text",
                    "text": "系統即將啟動後續解散清理程序，感謝大家過去的參與！",
                    "size": "sm",
                    "color": "#6B7280",
                    "wrap": True,
                    "margin": "sm",
                },
            ],
        },
    }


def build_countdown_reminder_flex(
    group_name: str,
    remaining_hours: int,
    revoke_url: str,
) -> Dict[str, Any]:
    """
    建立解散前 24 小時倒數警示 Flex Message
    """
    return {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "backgroundColor": "#EA580C",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "text",
                    "text": f"⏳ 群組解散最後倒數 ({remaining_hours} 小時)",
                    "weight": "bold",
                    "color": "#FFFFFF",
                    "size": "lg",
                }
            ],
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "paddingAll": "20px",
            "contents": [
                {
                    "type": "text",
                    "text": f"提醒您：【{group_name}】即將在約 {remaining_hours} 小時後自動執行解散程序！",
                    "weight": "bold",
                    "size": "md",
                    "wrap": True,
                    "color": "#9A3412",
                },
                {
                    "type": "text",
                    "text": "若您仍需保留本群組，請於解散前點擊下方按鈕提出異議。點擊後系統將立即終止解散並完整保留群組。",
                    "size": "xs",
                    "color": "#4B5563",
                    "wrap": True,
                    "margin": "md",
                },
            ],
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "paddingAll": "16px",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": "#059669",
                    "height": "sm",
                    "action": {
                        "type": "uri",
                        "label": "👉 點此保留群組 (終止解散)",
                        "uri": revoke_url,
                    },
                }
            ],
        },
    }

