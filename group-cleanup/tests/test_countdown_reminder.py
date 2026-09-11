"""
tests/test_countdown_reminder.py
測試 24 小時到期前最後提醒通知、Flex Message 產生與排程器觸發邏輯 (FR-3.3.2)
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from core.db import get_db_adapter
from core.task_state import DissolveTask, TaskStatus
from server.flex_templates import build_countdown_reminder_flex
from server.scheduler import TaskScheduler


def test_countdown_reminder_flex_generation():
    """測試 24 小時提醒 Flex Message JSON 結構產生"""
    flex = build_countdown_reminder_flex(
        group_name="專案封裝群",
        remaining_hours=24,
        revoke_url="https://example.com/revoke/task123?token=abc",
    )
    assert flex["type"] == "bubble"
    assert "24 小時" in flex["header"]["contents"][0]["text"]
    assert "專案封裝群" in flex["body"]["contents"][0]["text"]
    footer_btn = flex["footer"]["contents"][0]
    assert "點此保留群組" in footer_btn["action"]["label"]
    assert footer_btn["action"]["uri"] == "https://example.com/revoke/task123?token=abc"


def test_task_reminder_sent_flag_serialization():
    """測試 DissolveTask 的 reminder_sent 序列化與反序列化"""
    task = DissolveTask(group_name="提醒測試群", reminder_sent=False)
    d = task.to_dict()
    assert d["reminder_sent"] is False

    task.reminder_sent = True
    d2 = task.to_dict()
    assert d2["reminder_sent"] is True

    restored = DissolveTask.from_dict(d2)
    assert restored.reminder_sent is True
    assert restored.group_name == "提醒測試群"


def test_scheduler_24h_reminder_trigger():
    """測試 Scheduler 在任務剩餘時間 <= 24 小時且 reminder_sent == False 時發送提醒"""
    db = get_db_adapter()
    now = datetime.now(timezone.utc)
    # 建立一個剩餘 12 小時到期的任務
    dissolve_at = (now + timedelta(hours=12)).isoformat()
    task = DissolveTask(
        group_name="24h提醒測試群組",
        group_id="c_test_group_24h",
        status=TaskStatus.NOTICE_ACTIVE,
        dissolve_at=dissolve_at,
        reminder_sent=False,
        cancel_token="token123",
    )
    db.save_task(task)

    scheduler = TaskScheduler()

    with patch.object(scheduler._bot, "push_countdown_reminder") as mock_push:
        mock_push.return_value = True

        scheduler.check_active_tasks()

        # 驗證 push_countdown_reminder 有被呼叫
        mock_push.assert_called_once()
        assert mock_push.call_args.kwargs["group_id"] == "c_test_group_24h"
        assert mock_push.call_args.kwargs["group_name"] == "24h提醒測試群組"

        # 驗證資料庫中的 reminder_sent 已被設為 True
        updated = db.get_task(task.task_id)
        assert updated.reminder_sent is True

        # 第二次執行時不應重複發送
        mock_push.reset_mock()
        scheduler.check_active_tasks()
        mock_push.assert_not_called()

