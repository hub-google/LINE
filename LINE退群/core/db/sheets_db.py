"""
core/db/sheets_db.py
Google Sheets 資料庫適配器 (gspread + google-auth)
- 連接 Google 試算表
- 自動建立與維護 3 個工作表：Tasks, Whitelist, AuditLogs
- 支援與本機資料庫降級備援
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from loguru import logger

from core.audit_log import AuditLogEntry
from core.db.base import DatabaseAdapter
from core.task_state import DissolveTask, TaskStatus
from core.whitelist import WhitelistEntry

# 工作表欄位表頭定義（嚴格依據 SRS 6.2 規範）
TASKS_HEADERS = [
    "task_id",
    "group_id",
    "group_name",
    "initiator_name",
    "status",
    "created_at",
    "dissolve_at",
    "cancelled_at",
    "cancelled_by",
    "cancel_token",
    "notes",
    "reminder_sent",
]

WHITELIST_HEADERS = [
    "group_name",
    "category",
    "added_at",
    "notes",
]

AUDIT_HEADERS = [
    "timestamp",
    "task_id",
    "event_type",
    "operator",
    "details",
]


class GoogleSheetsAdapter(DatabaseAdapter):
    """Google Sheets 試算表資料庫適配器"""

    def __init__(
        self,
        spreadsheet_id: str,
        credentials_path: str = "./credentials.json",
    ):
        self.spreadsheet_id = spreadsheet_id
        self.credentials_path = credentials_path
        self._client = None
        self._spreadsheet = None
        self._connected = False
        self._init_client()

    def _init_client(self) -> bool:
        """初始化 gspread 授權客戶端"""
        try:
            import gspread
            from google.oauth2.service_account import Credentials

            scopes = [
                "https://www.googleapis.com/auth/spreadsheets",
                "https://www.googleapis.com/auth/drive",
            ]

            cred_p = Path(self.credentials_path)
            if not cred_p.exists():
                logger.warning(f"Google 憑證檔案不存在：{cred_p}")
                return False

            credentials = Credentials.from_service_account_file(
                str(cred_p), scopes=scopes
            )
            self._client = gspread.authorize(credentials)
            if self.spreadsheet_id:
                self._spreadsheet = self._client.open_by_key(self.spreadsheet_id)
                self._ensure_worksheets()
                self._connected = True
                logger.info(f"✔ 已成功連接 Google 試算表：{self._spreadsheet.title}")
                return True
        except Exception as exc:
            logger.error(f"Google Sheets 連線初始化失敗：{exc}")
            self._connected = False
        return False

    def is_connected(self) -> bool:
        return self._connected

    def _ensure_worksheets(self) -> None:
        """確保 Tasks, Whitelist, AuditLogs 三個工作表存在且有正確表頭"""
        if not self._spreadsheet:
            return

        sheets_needed = {
            "Tasks": TASKS_HEADERS,
            "Whitelist": WHITELIST_HEADERS,
            "AuditLogs": AUDIT_HEADERS,
        }

        existing = {ws.title: ws for ws in self._spreadsheet.worksheets()}

        for title, headers in sheets_needed.items():
            if title not in existing:
                try:
                    ws = self._spreadsheet.add_worksheet(title=title, rows=100, cols=len(headers))
                    ws.append_row(headers)
                    logger.info(f"已建立 Google 工作表：{title}")
                except Exception as exc:
                    logger.error(f"建立工作表 {title} 失敗：{exc}")
            else:
                # 檢查表頭是否已填寫
                ws = existing[title]
                values = ws.row_values(1)
                if not values:
                    ws.append_row(headers)

    # --- Tasks 操作 ---

    def get_task(self, task_id: str) -> Optional[DissolveTask]:
        tasks = self.list_all_tasks()
        for t in tasks:
            if t.task_id == task_id:
                return t
        return None

    def save_task(self, task: DissolveTask) -> bool:
        if not self._connected:
            return False
        try:
            ws = self._spreadsheet.worksheet("Tasks")
            records = ws.get_all_records()
            row_idx = None
            for idx, r in enumerate(records, start=2):
                if str(r.get("task_id")) == task.task_id:
                    row_idx = idx
                    break

            row_data = [
                task.task_id,
                task.group_id or "",
                task.group_name,
                task.initiator_name,
                task.status.value,
                task.created_at or "",
                task.dissolve_at or "",
                task.cancelled_at or "",
                task.cancelled_by or "",
                task.cancel_token or "",
                task.notes or "",
                str(task.reminder_sent),
            ]

            if row_idx is not None:
                # 更新現有行
                cell_range = f"A{row_idx}:L{row_idx}"
                ws.update(cell_range, [row_data])
            else:
                # 新增行
                ws.append_row(row_data)
            return True
        except Exception as exc:
            logger.error(f"Google Sheets 儲存任務失敗：{exc}")
            return False

    def list_all_tasks(self) -> list[DissolveTask]:
        if not self._connected:
            return []
        try:
            ws = self._spreadsheet.worksheet("Tasks")
            records = ws.get_all_records()
            tasks = []
            for r in records:
                if not r.get("task_id"):
                    continue
                tasks.append(
                    DissolveTask(
                        task_id=str(r.get("task_id")),
                        group_name=str(r.get("group_name", "")),
                        group_id=str(r.get("group_id", "")),
                        initiator_name=str(r.get("initiator_name", "使用者")),
                        status=TaskStatus(r.get("status", "DRAFT")),
                        created_at=str(r.get("created_at", "")),
                        dissolve_at=str(r.get("dissolve_at", "")),
                        cancelled_at=str(r.get("cancelled_at", "")),
                        cancelled_by=str(r.get("cancelled_by", "")),
                        cancel_token=str(r.get("cancel_token", "")),
                        notes=str(r.get("notes", "")),
                        reminder_sent=str(r.get("reminder_sent", "False")).lower() in ("true", "1", "yes"),
                    )
                )
            return tasks
        except Exception as exc:
            logger.error(f"Google Sheets 讀取任務失敗：{exc}")
            return []

    def delete_task(self, task_id: str) -> bool:
        if not self._connected:
            return False
        try:
            ws = self._spreadsheet.worksheet("Tasks")
            records = ws.get_all_records()
            for idx, r in enumerate(records, start=2):
                if str(r.get("task_id")) == task_id:
                    ws.delete_rows(idx)
                    return True
            return False
        except Exception as exc:
            logger.error(f"Google Sheets 刪除任務失敗：{exc}")
            return False

    # --- Whitelist 操作 ---

    def list_whitelist(self) -> list[WhitelistEntry]:
        if not self._connected:
            return []
        try:
            ws = self._spreadsheet.worksheet("Whitelist")
            records = ws.get_all_records()
            entries = []
            for r in records:
                if not r.get("group_name"):
                    continue
                entries.append(
                    WhitelistEntry(
                        group_name=str(r.get("group_name")),
                        category=str(r.get("category", "其他")),
                        added_at=str(r.get("added_at", "")),
                        notes=str(r.get("notes", "")),
                    )
                )
            return entries
        except Exception as exc:
            logger.error(f"Google Sheets 讀取白名單失敗：{exc}")
            return []

    def add_whitelist(self, entry: WhitelistEntry) -> bool:
        if not self._connected:
            return False
        try:
            ws = self._spreadsheet.worksheet("Whitelist")
            records = ws.get_all_records()
            for r in records:
                if str(r.get("group_name")) == entry.group_name:
                    return False
            ws.append_row([entry.group_name, entry.category, entry.added_at, entry.notes])
            return True
        except Exception as exc:
            logger.error(f"Google Sheets 新增白名單失敗：{exc}")
            return False

    def remove_whitelist(self, group_name: str) -> bool:
        if not self._connected:
            return False
        try:
            ws = self._spreadsheet.worksheet("Whitelist")
            records = ws.get_all_records()
            for idx, r in enumerate(records, start=2):
                if str(r.get("group_name")) == group_name.strip():
                    ws.delete_rows(idx)
                    return True
            return False
        except Exception as exc:
            logger.error(f"Google Sheets 移除白名單失敗：{exc}")
            return False

    # --- AuditLogs 操作 ---

    def add_audit_log(self, entry: AuditLogEntry) -> bool:
        if not self._connected:
            return False
        try:
            ws = self._spreadsheet.worksheet("AuditLogs")
            ws.append_row([
                entry.timestamp,
                entry.task_id,
                entry.event_type,
                entry.operator,
                entry.details,
            ])
            return True
        except Exception as exc:
            logger.error(f"Google Sheets 寫入日誌失敗：{exc}")
            return False

    def list_audit_logs(self, limit: Optional[int] = None) -> list[AuditLogEntry]:
        if not self._connected:
            return []
        try:
            ws = self._spreadsheet.worksheet("AuditLogs")
            records = ws.get_all_records()
            logs = [
                AuditLogEntry(
                    timestamp=str(r.get("timestamp")),
                    task_id=str(r.get("task_id")),
                    event_type=str(r.get("event_type")),
                    operator=str(r.get("operator")),
                    details=str(r.get("details")),
                )
                for r in records if r.get("timestamp")
            ]
            logs.sort(key=lambda x: x.timestamp, reverse=True)
            return logs[:limit] if limit else logs
        except Exception as exc:
            logger.error(f"Google Sheets 讀取日誌失敗：{exc}")
            return []
