"""
core/cloud_sync.py
跨端通訊同步客戶端 (Cloud Sync Client)
- 負責本機桌面端 / CLI 與雲端 Webhook 伺服器之 HTTP API 通訊
- 支援遠端任務註冊、狀態輪詢、期滿清單拉取與離線自動降級
"""
from __future__ import annotations

from typing import Optional

import httpx
from config.settings import settings
from core.audit_log import AuditLogEntry
from core.task_state import DissolveTask, TaskStatus
from core.whitelist import WhitelistEntry
from loguru import logger


class CloudSyncClient:
    """雲端通訊同步客戶端"""

    def __init__(self, base_url: str = ""):
        self.base_url = (base_url or settings.app_base_url).rstrip("/")
        self._timeout = 10.0

    def is_available(self) -> bool:
        """檢查雲端後端伺服器是否在線"""
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"{self.base_url}/api/health")
                return res.status_code == 200
        except Exception:
            return False

    def register_task(
        self,
        group_name: str,
        initiator_name: str = "使用者",
        notice_hours: int = 72,
    ) -> Optional[DissolveTask]:
        """向雲端伺服器註冊 3 天緩衝解散任務"""
        payload = {
            "group_name": group_name,
            "initiator_name": initiator_name,
            "notice_hours": notice_hours,
        }
        try:
            with httpx.Client(timeout=self._timeout) as client:
                res = client.post(f"{self.base_url}/api/tasks", json=payload)
                if res.status_code == 200:
                    data = res.json()
                    return DissolveTask.from_dict(data)
                logger.warning(f"雲端註冊任務失敗：HTTP {res.status_code} - {res.text}")
        except Exception as exc:
            logger.error(f"連線雲端伺服器失敗：{exc}")
        return None

    def list_tasks(self, status: Optional[str] = None) -> list[DissolveTask]:
        """從雲端伺服器拉取任務清單"""
        url = f"{self.base_url}/api/tasks"
        params = {"status": status} if status else {}
        try:
            with httpx.Client(timeout=self._timeout) as client:
                res = client.get(url, params=params)
                if res.status_code == 200:
                    return [DissolveTask.from_dict(d) for d in res.json()]
        except Exception as exc:
            logger.error(f"拉取雲端任務清單失敗：{exc}")
        return []

    def get_ready_tasks(self) -> list[DissolveTask]:
        """取得所有 72 小時公示期滿待解散的任務"""
        url = f"{self.base_url}/api/tasks/ready"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                res = client.get(url)
                if res.status_code == 200:
                    return [DissolveTask.from_dict(d) for d in res.json()]
        except Exception as exc:
            logger.error(f"拉取期滿任務清單失敗：{exc}")
        return []

    def cancel_task(self, task_id: str) -> bool:
        """主動向雲端撤回任務"""
        url = f"{self.base_url}/api/tasks/{task_id}/cancel"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                res = client.post(url)
                return res.status_code == 200
        except Exception as exc:
            logger.error(f"雲端撤回任務失敗 ({task_id})：{exc}")
        return False

    def complete_task(self, task_id: str) -> bool:
        """標記任務已由本機端執行解散完成"""
        url = f"{self.base_url}/api/tasks/{task_id}/complete"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                res = client.post(url)
                return res.status_code == 200
        except Exception as exc:
            logger.error(f"回報任務完成失敗 ({task_id})：{exc}")
        return False

    def list_audit_logs(self, limit: int = 50) -> list[AuditLogEntry]:
        """從雲端伺服器拉取稽核日誌"""
        url = f"{self.base_url}/api/audit-logs"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                res = client.get(url, params={"limit": limit})
                if res.status_code == 200:
                    return [AuditLogEntry.from_dict(d) for d in res.json()]
        except Exception as exc:
            logger.error(f"拉取雲端稽核日誌失敗：{exc}")
        return []

