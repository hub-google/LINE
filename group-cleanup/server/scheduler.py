"""
server/scheduler.py
72 小時公示排程引擎 (APScheduler)
- 定期檢查 NOTICE_ACTIVE 任務之倒數狀態
- 公示期滿且無異議時，自動轉移狀態至 READY_FOR_DISSOLUTION
- 觸發 Bot 推播最終告別通知
- 記錄稽核日誌
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from loguru import logger

from config.settings import settings
from core.audit_log import AuditLogEntry, AuditLogManager
from core.db import get_db_adapter
from core.task_state import TaskStatus
from server.line_bot import LineBotService


class TaskScheduler:
    """任務排程器"""

    def __init__(
        self,
        bot_service: Optional[LineBotService] = None,
        audit_mgr: Optional[AuditLogManager] = None,
    ):
        self._bot = bot_service or LineBotService()
        self._audit = audit_mgr or AuditLogManager()
        self._scheduler = BackgroundScheduler(timezone="UTC")
        self._running = False

    def start(self) -> None:
        """啟動排程器"""
        if self._running:
            return
        self._scheduler.add_job(
            self.check_active_tasks,
            "interval",
            seconds=30,
            id="check_active_dissolve_tasks",
            replace_existing=True,
        )
        self._scheduler.start()
        self._running = True
        logger.info("✔ 72 小時公示任務排程引擎已啟動 (每 30 秒巡檢一次)")

    def shutdown(self) -> None:
        """停止排程器"""
        if self._running:
            self._scheduler.shutdown(wait=False)
            self._running = False
            logger.info("公示任務排程引擎已關閉")

    def check_active_tasks(self) -> None:
        """巡檢所有 NOTICE_ACTIVE 任務是否期滿或進入最後 24 小時倒數"""
        try:
            db = get_db_adapter()
            tasks = db.list_all_tasks()
            now = datetime.now(timezone.utc)

            for task in tasks:
                if task.status != TaskStatus.NOTICE_ACTIVE or not task.dissolve_at:
                    continue

                try:
                    dissolve_time = datetime.fromisoformat(task.dissolve_at)
                except Exception:
                    continue

                # 1. 檢查是否已期滿
                if now >= dissolve_time:
                    logger.info(f"[{task.task_id}] 72 小時公示期滿無異議，標記為 READY_FOR_DISSOLUTION")
                    task.transition_to(
                        TaskStatus.READY_FOR_DISSOLUTION,
                        notes="72 小時公示期滿，無成員反對",
                    )
                    db.save_task(task)

                    # 發送告別公告
                    if task.group_id:
                        self._bot.push_farewell_notice(task.group_id, task.group_name)

                    # 記錄稽核日誌
                    self._audit.record(
                        task_id=task.task_id,
                        event_type="NOTICE_EXPIRED",
                        operator="SCHEDULER",
                        details=f"群組 [{task.group_name}] 72 小時公示期滿，進入待解散狀態",
                    )

                # 2. 檢查是否進入解散前 24 小時倒數提醒（且尚未發送過）
                elif not getattr(task, "reminder_sent", False):
                    remaining_sec = (dissolve_time - now).total_seconds()
                    if 0 < remaining_sec <= 24 * 3600:
                        remaining_hours = max(1, int(round(remaining_sec / 3600)))
                        logger.info(f"[{task.task_id}] 進入解散前 {remaining_hours} 小時倒數，發送警示提醒")
                        base_url = settings.app_base_url.rstrip("/")
                        revoke_url = f"{base_url}/revoke/{task.task_id}?token={task.cancel_token}"
                        if task.group_id:
                            self._bot.push_countdown_reminder(
                                group_id=task.group_id,
                                group_name=task.group_name,
                                remaining_hours=remaining_hours,
                                revoke_url=revoke_url,
                            )
                        task.reminder_sent = True
                        db.save_task(task)
                        self._audit.record(
                            task_id=task.task_id,
                            event_type="COUNTDOWN_REMINDER_SENT",
                            operator="SCHEDULER",
                            details=f"已向群組 [{task.group_name}] 發送解散前 {remaining_hours} 小時倒數警示",
                        )

        except Exception as exc:
            logger.error(f"巡檢待解散任務時發生異常：{exc}")
