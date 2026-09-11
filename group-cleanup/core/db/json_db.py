"""
core/db/json_db.py
本機 JSON 資料庫適配器
實現 Tasks, Whitelist, AuditLogs 之本機 JSON 檔案儲存
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from loguru import logger

from core.audit_log import AuditLogEntry
from core.db.base import DatabaseAdapter
from core.task_state import DissolveTask
from core.whitelist import WhitelistEntry

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


class LocalJsonAdapter(DatabaseAdapter):
    """本機 JSON 資料庫實作"""

    def __init__(self, data_dir: Path = _DATA_DIR):
        self._data_dir = data_dir
        self._tasks_path = data_dir / "tasks.json"
        self._whitelist_path = data_dir / "whitelist.json"
        self._audit_logs_path = data_dir / "audit_logs.json"
        self._data_dir.mkdir(parents=True, exist_ok=True)

    # --- Tasks 操作 ---

    def get_task(self, task_id: str) -> Optional[DissolveTask]:
        tasks = self.list_all_tasks()
        for t in tasks:
            if t.task_id == task_id:
                return t
        return None

    def save_task(self, task: DissolveTask) -> bool:
        tasks = self.list_all_tasks()
        found = False
        for idx, t in enumerate(tasks):
            if t.task_id == task.task_id:
                tasks[idx] = task
                found = True
                break
        if not found:
            tasks.append(task)
        self._write_json(self._tasks_path, [t.to_dict() for t in tasks])
        return True

    def list_all_tasks(self) -> list[DissolveTask]:
        data = self._read_json(self._tasks_path)
        return [DissolveTask.from_dict(d) for d in data]

    def delete_task(self, task_id: str) -> bool:
        tasks = self.list_all_tasks()
        orig_len = len(tasks)
        tasks = [t for t in tasks if t.task_id != task_id]
        if len(tasks) < orig_len:
            self._write_json(self._tasks_path, [t.to_dict() for t in tasks])
            return True
        return False

    # --- Whitelist 操作 ---

    def list_whitelist(self) -> list[WhitelistEntry]:
        data = self._read_json(self._whitelist_path)
        return [WhitelistEntry.from_dict(d) for d in data]

    def add_whitelist(self, entry: WhitelistEntry) -> bool:
        entries = self.list_whitelist()
        for e in entries:
            if e.group_name == entry.group_name:
                return False
        entries.append(entry)
        self._write_json(self._whitelist_path, [e.to_dict() for e in entries])
        return True

    def remove_whitelist(self, group_name: str) -> bool:
        entries = self.list_whitelist()
        orig_len = len(entries)
        entries = [e for e in entries if e.group_name != group_name.strip()]
        if len(entries) < orig_len:
            self._write_json(self._whitelist_path, [e.to_dict() for e in entries])
            return True
        return False

    # --- AuditLogs 操作 ---

    def add_audit_log(self, entry: AuditLogEntry) -> bool:
        logs = self.list_audit_logs()
        logs.append(entry)
        self._write_json(self._audit_logs_path, [l.to_dict() for l in logs])
        return True

    def list_audit_logs(self, limit: Optional[int] = None) -> list[AuditLogEntry]:
        data = self._read_json(self._audit_logs_path)
        logs = [AuditLogEntry.from_dict(d) for d in data]
        logs.sort(key=lambda x: x.timestamp, reverse=True)
        if limit:
            return logs[:limit]
        return logs

    # --- 工具方法 ---

    def _read_json(self, path: Path) -> list[dict]:
        if not path.exists():
            return []
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error(f"讀取 JSON 失敗 ({path})：{exc}")
            return []

    def _write_json(self, path: Path, data: list[dict]) -> None:
        try:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.error(f"寫入 JSON 失敗 ({path})：{exc}")
