"""
core/task_state.py
任務狀態機（Task State Machine）
- 管理群組解散任務的完整生命週期
- 本機存為 tasks.json（後期可遷移至 Google Sheets）
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Optional

from loguru import logger

_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "tasks.json"


class TaskStatus(str, Enum):
    """任務狀態流轉定義"""
    DRAFT = "DRAFT"                              # 本機已勾選，尚未執行
    INVITING_BOT = "INVITING_BOT"                # 正在邀請 Bot 入群
    NOTICE_ACTIVE = "NOTICE_ACTIVE"              # Bot 已入群，72h 公示進行中
    CANCELLED_BY_MEMBER = "CANCELLED_BY_MEMBER"  # 成員點擊異議，解散終止
    CANCELLED_BY_INITIATOR = "CANCELLED_BY_INITIATOR"  # 發起人主動撤回
    READY_FOR_DISSOLUTION = "READY_FOR_DISSOLUTION"    # 72h 公示期滿，待執行解散
    EXECUTING = "EXECUTING"                      # 正在批次踢人/退出
    COMPLETED = "COMPLETED"                      # 解散完成
    ABORTED_BOT_KICKED = "ABORTED_BOT_KICKED"   # Bot 被踢出，異常中斷
    FAILED = "FAILED"                            # 執行失敗（例外捕捉）


# 合法的狀態轉移表
_VALID_TRANSITIONS: dict[TaskStatus, list[TaskStatus]] = {
    TaskStatus.DRAFT: [
        TaskStatus.INVITING_BOT,
        TaskStatus.NOTICE_ACTIVE,
        TaskStatus.EXECUTING,
        TaskStatus.CANCELLED_BY_INITIATOR,
    ],
    TaskStatus.INVITING_BOT: [TaskStatus.NOTICE_ACTIVE, TaskStatus.ABORTED_BOT_KICKED, TaskStatus.FAILED],
    TaskStatus.NOTICE_ACTIVE: [
        TaskStatus.CANCELLED_BY_MEMBER,
        TaskStatus.CANCELLED_BY_INITIATOR,
        TaskStatus.READY_FOR_DISSOLUTION,
        TaskStatus.ABORTED_BOT_KICKED,
    ],
    TaskStatus.READY_FOR_DISSOLUTION: [TaskStatus.EXECUTING, TaskStatus.CANCELLED_BY_INITIATOR],
    TaskStatus.EXECUTING: [TaskStatus.COMPLETED, TaskStatus.FAILED],
    # 終止狀態（無法再轉移）
    TaskStatus.COMPLETED: [],
    TaskStatus.CANCELLED_BY_MEMBER: [],
    TaskStatus.CANCELLED_BY_INITIATOR: [],
    TaskStatus.ABORTED_BOT_KICKED: [],
    TaskStatus.FAILED: [],
}


class DissolveTask:
    """群組解散任務實體"""

    def __init__(
        self,
        group_name: str,
        group_id: str = "",
        initiator_name: str = "使用者",
        task_id: Optional[str] = None,
        status: TaskStatus = TaskStatus.DRAFT,
        created_at: Optional[str] = None,
        dissolve_at: Optional[str] = None,
        cancelled_at: Optional[str] = None,
        cancelled_by: str = "",
        cancel_token: str = "",
        notes: str = "",
        reminder_sent: bool = False,
    ):
        self.task_id = task_id or f"tsk_{uuid.uuid4().hex[:10]}"
        self.group_name = group_name
        self.group_id = group_id
        self.initiator_name = initiator_name
        self.status = status
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()
        self.dissolve_at = dissolve_at  # 設定後才有值（公示模式）
        self.cancelled_at = cancelled_at
        self.cancelled_by = cancelled_by
        self.cancel_token = cancel_token
        self.notes = notes
        self.reminder_sent = reminder_sent

    # ──────────────────────────────────────────────
    # 狀態機轉移
    # ──────────────────────────────────────────────

    def transition_to(self, new_status: TaskStatus, notes: str = "") -> bool:
        """
        嘗試轉移到新狀態，回傳是否成功。
        不合法的轉移會記錄警告並回傳 False。
        """
        allowed = _VALID_TRANSITIONS.get(self.status, [])
        if new_status not in allowed:
            logger.warning(
                f"[{self.task_id}] 非法狀態轉移：{self.status} → {new_status}"
            )
            return False
        logger.info(f"[{self.task_id}] 狀態轉移：{self.status} → {new_status}")
        self.status = new_status
        if notes:
            self.notes = notes
        return True

    # ──────────────────────────────────────────────
    # 便利屬性
    # ──────────────────────────────────────────────

    @property
    def is_terminal(self) -> bool:
        """是否已達終止狀態"""
        return self.status in (
            TaskStatus.COMPLETED,
            TaskStatus.CANCELLED_BY_MEMBER,
            TaskStatus.CANCELLED_BY_INITIATOR,
            TaskStatus.ABORTED_BOT_KICKED,
            TaskStatus.FAILED,
        )

    @property
    def countdown_seconds(self) -> Optional[float]:
        """距離公示期滿的剩餘秒數，若不適用回傳 None"""
        if self.status != TaskStatus.NOTICE_ACTIVE or not self.dissolve_at:
            return None
        target = datetime.fromisoformat(self.dissolve_at)
        remaining = (target - datetime.now(timezone.utc)).total_seconds()
        return max(0.0, remaining)

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "group_name": self.group_name,
            "group_id": self.group_id,
            "initiator_name": self.initiator_name,
            "status": self.status.value,
            "created_at": self.created_at,
            "dissolve_at": self.dissolve_at,
            "cancelled_at": self.cancelled_at,
            "cancelled_by": self.cancelled_by,
            "cancel_token": self.cancel_token,
            "notes": self.notes,
            "reminder_sent": self.reminder_sent,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DissolveTask":
        return cls(
            task_id=d["task_id"],
            group_name=d["group_name"],
            group_id=d.get("group_id", ""),
            initiator_name=d.get("initiator_name", "使用者"),
            status=TaskStatus(d["status"]),
            created_at=d.get("created_at"),
            dissolve_at=d.get("dissolve_at"),
            cancelled_at=d.get("cancelled_at"),
            cancelled_by=d.get("cancelled_by", ""),
            cancel_token=d.get("cancel_token", ""),
            notes=d.get("notes", ""),
            reminder_sent=bool(d.get("reminder_sent", False)),
        )


class TaskManager:
    """任務管理器，負責持久化與查詢"""

    def __init__(self, path: Path = _DEFAULT_PATH):
        self._path = path
        self._tasks: dict[str, DissolveTask] = {}
        self._load()

    # ──────────────────────────────────────────────
    # 公開 API
    # ──────────────────────────────────────────────

    def create(
        self,
        group_name: str,
        group_id: str = "",
        initiator_name: str = "使用者",
        notice_hours: int = 72,
    ) -> DissolveTask:
        """建立新任務（DRAFT 狀態）"""
        task = DissolveTask(
            group_name=group_name,
            group_id=group_id,
            initiator_name=initiator_name,
        )
        self._tasks[task.task_id] = task
        self._save()
        logger.info(f"已建立任務：{task.task_id} [{group_name}]")
        return task

    def get(self, task_id: str) -> Optional[DissolveTask]:
        return self._tasks.get(task_id)

    def update_status(self, task_id: str, new_status: TaskStatus, notes: str = "") -> bool:
        task = self._tasks.get(task_id)
        if not task:
            logger.error(f"任務不存在：{task_id}")
            return False
        success = task.transition_to(new_status, notes=notes)
        if success:
            self._save()
        return success

    def list_active(self) -> list[DissolveTask]:
        """取得所有非終止狀態任務"""
        return [t for t in self._tasks.values() if not t.is_terminal]

    def list_all(self) -> list[DissolveTask]:
        return list(self._tasks.values())

    def list_by_status(self, status: TaskStatus) -> list[DissolveTask]:
        return [t for t in self._tasks.values() if t.status == status]

    def delete(self, task_id: str) -> bool:
        if task_id in self._tasks:
            del self._tasks[task_id]
            self._save()
            return True
        return False

    # ──────────────────────────────────────────────
    # 私有：讀寫 JSON
    # ──────────────────────────────────────────────

    def _load(self) -> None:
        if not self._path.exists():
            self._path.parent.mkdir(parents=True, exist_ok=True)
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            self._tasks = {d["task_id"]: DissolveTask.from_dict(d) for d in data}
            logger.debug(f"已載入任務：{len(self._tasks)} 筆")
        except Exception as exc:
            logger.error(f"任務資料讀取失敗：{exc}")
            self._tasks = {}

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps([t.to_dict() for t in self._tasks.values()], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
