"""
core/db/base.py
資料庫存取層抽象基底類別 (Database Adapter Interface)
定義 Tasks, Whitelist, AuditLogs 三大資料表操作介面
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from core.audit_log import AuditLogEntry
from core.task_state import DissolveTask, TaskStatus
from core.whitelist import WhitelistEntry


class DatabaseAdapter(ABC):
    """資料庫適配器抽象基底介面"""

    # --- Tasks 操作 ---
    @abstractmethod
    def get_task(self, task_id: str) -> Optional[DissolveTask]:
        """取得單一任務"""
        pass

    @abstractmethod
    def save_task(self, task: DissolveTask) -> bool:
        """建立或更新任務"""
        pass

    @abstractmethod
    def list_all_tasks(self) -> list[DissolveTask]:
        """列出所有任務"""
        pass

    @abstractmethod
    def delete_task(self, task_id: str) -> bool:
        """刪除任務"""
        pass

    # --- Whitelist 操作 ---
    @abstractmethod
    def list_whitelist(self) -> list[WhitelistEntry]:
        """列出所有白名單條目"""
        pass

    @abstractmethod
    def add_whitelist(self, entry: WhitelistEntry) -> bool:
        """新增白名單條目"""
        pass

    @abstractmethod
    def remove_whitelist(self, group_name: str) -> bool:
        """移除白名單條目"""
        pass

    # --- AuditLogs 操作 ---
    @abstractmethod
    def add_audit_log(self, entry: AuditLogEntry) -> bool:
        """新增一筆稽核日誌"""
        pass

    @abstractmethod
    def list_audit_logs(self, limit: Optional[int] = None) -> list[AuditLogEntry]:
        """列出稽核日誌"""
        pass
