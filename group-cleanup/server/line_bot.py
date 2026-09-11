"""
server/line_bot.py
LINE 官方 Messaging API v3 封裝服務
- 驗證 Webhook 簽章 (X-Line-Signature)
- 發送 Flex Message 待解散公告、撤銷公告與告別通知
- 執行機器人自動離群 (leaveGroup)
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from config.settings import settings
from loguru import logger
from server.flex_templates import (
    build_countdown_reminder_flex,
    build_dissolve_notice_flex,
    build_farewell_notice_flex,
    build_revoked_notice_flex,
)

try:
    from linebot.v3 import WebhookHandler, WebhookParser
    from linebot.v3.exceptions import InvalidSignatureError
    from linebot.v3.messaging import (
        ApiClient,
        Configuration,
        FlexContainer,
        FlexMessage,
        MessagingApi,
        PushMessageRequest,
        ReplyMessageRequest,
        TextMessage,
    )
    _LINE_SDK_AVAILABLE = True
except ImportError:
    _LINE_SDK_AVAILABLE = False
    logger.warning("line-bot-sdk 未正確載入，將啟用模擬 Bot 模式")


class LineBotService:
    """LINE Bot Messaging API 服務"""

    def __init__(
        self,
        channel_secret: str = "",
        channel_access_token: str = "",
    ):
        self.secret = channel_secret or settings.line_channel_secret
        self.token = channel_access_token or settings.line_channel_access_token
        self._messaging_api: Optional[MessagingApi] = None
        self._parser: Optional[WebhookParser] = None
        self._init_client()

    def _init_client(self) -> None:
        if not _LINE_SDK_AVAILABLE or not self.token or not self.secret:
            logger.info("LINE Bot 憑證未完整設定，運行於模擬/日誌模式")
            return

        try:
            config = Configuration(access_token=self.token)
            api_client = ApiClient(config)
            self._messaging_api = MessagingApi(api_client)
            self._parser = WebhookParser(self.secret)
            logger.info("✔ LINE Messaging API 客戶端已成功初始化")
        except Exception as exc:
            logger.error(f"LINE Bot 客戶端初始化失敗：{exc}")

    def is_configured(self) -> bool:
        return bool(self._messaging_api and self._parser)

    def parse_webhook_events(self, body: str, signature: str):
        """解析並驗證 Webhook 事件清單"""
        if not self._parser:
            logger.debug("[模擬] 無法驗證 Webhook 簽章（未配置密鑰）")
            return []
        try:
            return self._parser.parse(body, signature)
        except InvalidSignatureError:
            logger.warning("無效的 LINE Webhook 簽名 (InvalidSignatureError)")
            raise

    # ──────────────────────────────────────────────
    # 推播公告訊息
    # ──────────────────────────────────────────────

    def push_dissolve_notice(
        self,
        group_id: str,
        group_name: str,
        initiator_name: str,
        dissolve_at_str: str,
        revoke_url: str,
    ) -> bool:
        """推播 3 天待解散 Flex Message 公告至群組"""
        flex_dict = build_dissolve_notice_flex(
            group_name=group_name,
            initiator_name=initiator_name,
            dissolve_at_str=dissolve_at_str,
            revoke_url=revoke_url,
        )
        alt_text = f"⚠️【群組待解散公告】此群組已被【{initiator_name}】標註為待解散，將在 {dissolve_at_str} 解散。"
        return self._push_flex_message(group_id, alt_text, flex_dict)

    def push_revoked_notice(
        self,
        group_id: str,
        group_name: str,
        cancelled_by: str,
    ) -> bool:
        """推播異議生效、群組保留公告至群組"""
        flex_dict = build_revoked_notice_flex(group_name, cancelled_by)
        alt_text = f"🔔【解散程序已終止】本群組已由【{cancelled_by or '成員'}】確認保留，機器人即將離群。"
        return self._push_flex_message(group_id, alt_text, flex_dict)

    def push_farewell_notice(
        self,
        group_id: str,
        group_name: str,
    ) -> bool:
        """推播公示期滿告別通知"""
        flex_dict = build_farewell_notice_flex(group_name)
        alt_text = f"⏰ 3 天公示期滿，系統即將啟動解散作業。"
        return self._push_flex_message(group_id, alt_text, flex_dict)

    def push_countdown_reminder(
        self,
        group_id: str,
        group_name: str,
        remaining_hours: int,
        revoke_url: str,
    ) -> bool:
        """推播 24 小時前倒數提醒 Flex Message 至群組"""
        flex_dict = build_countdown_reminder_flex(group_name, remaining_hours, revoke_url)
        alt_text = f"⏳【解散最後倒數】群組【{group_name}】將在約 {remaining_hours} 小時後自動解散！"
        return self._push_flex_message(group_id, alt_text, flex_dict)

    def get_group_summary(self, group_id: str) -> Optional[dict]:
        """取得 LINE 群組名稱與摘要資訊"""
        if not group_id:
            return None
        if not self._messaging_api:
            logger.debug(f"[模擬 Bot] 取得 group_summary: {group_id}")
            return {"group_id": group_id, "group_name": ""}
        try:
            summary = self._messaging_api.get_group_summary(group_id=group_id)
            return {
                "group_id": getattr(summary, "group_id", group_id),
                "group_name": getattr(summary, "group_name", ""),
                "picture_url": getattr(summary, "picture_url", ""),
            }
        except Exception as exc:
            logger.debug(f"取得群組摘要失敗 ({group_id})：{exc}")
            return None

    def leave_group(self, group_id: str) -> bool:
        """命令 Bot 退出指定群組"""
        if not group_id:
            return False

        if not self._messaging_api:
            logger.info(f"[模擬 Bot] 呼叫 leave_group: group_id={group_id}")
            return True

        try:
            self._messaging_api.leave_group(group_id=group_id)
            logger.info(f"✔ LINE Bot 已成功退出群組：{group_id}")
            return True
        except Exception as exc:
            logger.error(f"LINE Bot 退出群組失敗 ({group_id})：{exc}")
            return False

    # ──────────────────────────────────────────────
    # 私有方法
    # ──────────────────────────────────────────────

    def _push_flex_message(self, to: str, alt_text: str, flex_dict: Dict[str, Any]) -> bool:
        if not to:
            logger.warning("推播目標群組 ID 為空")
            return False

        if not self._messaging_api:
            logger.info(f"[模擬 Bot] 向群組 {to} 推播 Flex 訊息：{alt_text}")
            return True

        try:
            container = FlexContainer.from_dict(flex_dict)
            flex_msg = FlexMessage(alt_text=alt_text, contents=container)
            req = PushMessageRequest(to=to, messages=[flex_msg])
            self._messaging_api.push_message(push_message_request=req)
            logger.info(f"✔ 成功向群組 {to} 推播 Flex Message")
            return True
        except Exception as exc:
            logger.error(f"推播 Flex Message 失敗 ({to})：{exc}")
            return False
