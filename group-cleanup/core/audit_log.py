"""
core/audit_log.py
操作與事件稽核日誌記錄器 (Audit Log Manager)
- 記錄系統關鍵事件 (BOT_JOINED, NOTICE_SENT, REVOKED, DISSOLVE_EXEC 等)
- 支援本機 JSON 與 Google Sheets 雙向同步
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from loguru import logger

_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "audit_logs.json"


@dataclass
class AuditLogEntry:
    """稽核日誌條目實體"""
    timestamp: str
    task_id: str
    event_type: str
    operator: str
    details: str

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "task_id": self.task_id,
            "event_type": self.event_type,
            "operator": self.operator,
            "details": self.details,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "AuditLogEntry":
        return cls(
            timestamp=d.get("timestamp", datetime.now(timezone.utc).isoformat()),
            task_id=d.get("task_id", ""),
            event_type=d.get("event_type", "UNKNOWN"),
            operator=d.get("operator", "SYSTEM"),
            details=d.get("details", ""),
        )


class AuditLogManager:
    """稽核日誌管理器"""

    def __init__(self, path: Path = _DEFAULT_PATH):
        self._path = path
        self._logs: list[AuditLogEntry] = []
        self._load()

    def record(
        self,
        task_id: str,
        event_type: str,
        operator: str,
        details: str,
        timestamp: Optional[str] = None,
    ) -> AuditLogEntry:
        """記錄一筆新的稽核日誌"""
        ts = timestamp or datetime.now(timezone.utc).isoformat()
        entry = AuditLogEntry(
            timestamp=ts,
            task_id=task_id,
            event_type=event_type,
            operator=operator,
            details=details,
        )
        self._logs.append(entry)
        self._save()
        logger.info(f"[AUDIT] [{event_type}] task={task_id} op={operator}: {details}")
        return entry

    def list_all(self, limit: Optional[int] = None) -> list[AuditLogEntry]:
        """取得所有日誌（依時間倒序）"""
        sorted_logs = sorted(self._logs, key=lambda x: x.timestamp, reverse=True)
        if limit:
            return sorted_logs[:limit]
        return sorted_logs

    def list_by_task(self, task_id: str) -> list[AuditLogEntry]:
        """查詢特定任務的所有日誌"""
        return [l for l in self._logs if l.task_id == task_id]

    def _load(self) -> None:
        if not self._path.exists():
            self._path.parent.mkdir(parents=True, exist_ok=True)
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            self._logs = [AuditLogEntry.from_dict(d) for d in data]
        except Exception as exc:
            logger.error(f"稽核日誌讀取失敗：{exc}")
            self._logs = []

    def _save(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps([e.to_dict() for e in self._logs], ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            logger.error(f"稽核日誌寫入失敗：{exc}")
