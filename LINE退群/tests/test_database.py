"""
tests/test_database.py
測試資料庫適配器 (Tasks, Whitelist, AuditLogs)
"""
import tempfile
from pathlib import Path

from core.audit_log import AuditLogEntry, AuditLogManager
from core.db.json_db import LocalJsonAdapter
from core.task_state import DissolveTask, TaskStatus
from core.whitelist import WhitelistEntry


def test_local_json_adapter_tasks():
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter = LocalJsonAdapter(data_dir=Path(tmpdir))

        # 建立任務
        task = DissolveTask(group_name="測試群組A", initiator_name="Tester")
        adapter.save_task(task)

        # 讀取任務
        fetched = adapter.get_task(task.task_id)
        assert fetched is not None
        assert fetched.group_name == "測試群組A"
        assert fetched.status == TaskStatus.DRAFT

        # 更新任務狀態
        fetched.status = TaskStatus.NOTICE_ACTIVE
        fetched.notes = "公示中"
        adapter.save_task(fetched)

        updated = adapter.get_task(task.task_id)
        assert updated.status == TaskStatus.NOTICE_ACTIVE
        assert updated.notes == "公示中"

        # 刪除任務
        assert adapter.delete_task(task.task_id) is True
        assert adapter.get_task(task.task_id) is None


def test_local_json_adapter_whitelist():
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter = LocalJsonAdapter(data_dir=Path(tmpdir))

        # 新增白名單
        entry = WhitelistEntry(group_name="家人群", category="家人", notes="不可退出")
        assert adapter.add_whitelist(entry) is True
        assert adapter.add_whitelist(entry) is False  # 重複新增應回傳 False

        # 列出白名單
        items = adapter.list_whitelist()
        assert len(items) == 1
        assert items[0].group_name == "家人群"

        # 移除白名單
        assert adapter.remove_whitelist("家人群") is True
        assert len(adapter.list_whitelist()) == 0


def test_audit_logs():
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter = LocalJsonAdapter(data_dir=Path(tmpdir))

        entry = AuditLogEntry(
            timestamp="2026-08-16T12:00:00Z",
            task_id="tsk_001",
            event_type="NOTICE_SENT",
            operator="LINE_BOT",
            details="推播完成",
        )
        adapter.add_audit_log(entry)

        logs = adapter.list_audit_logs()
        assert len(logs) == 1
        assert logs[0].event_type == "NOTICE_SENT"
        assert logs[0].task_id == "tsk_001"
