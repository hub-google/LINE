"""
tests/test_webhook_advanced.py
測試 LINE Webhook 進階事件 (join/memberJoined/leave/memberLeft)、遠端群組名稱解析與 AuditLogs 端點 (FR-3.3.1)
"""
import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from core.cloud_sync import CloudSyncClient
from core.db import get_db_adapter
from core.task_state import DissolveTask, TaskStatus
from server.app import app
from server.security import generate_cancel_token

client = TestClient(app)


class MockSource:
    def __init__(self, group_id: str):
        self.type = "group"
        self.group_id = group_id


class MockEvent:
    def __init__(self, event_type: str, group_id: str):
        self.type = event_type
        self.source = MockSource(group_id)


import uuid

def test_webhook_member_joined_with_group_summary():
    """測試 Bot 透過 memberJoined 加入群組，並使用 get_group_summary 解析群名比對任務"""
    db = get_db_adapter()
    unique_name = f"戶外登山露營團_{uuid.uuid4().hex[:6]}"
    task = DissolveTask(group_name=unique_name, status=TaskStatus.INVITING_BOT)
    task.cancel_token = generate_cancel_token(task.task_id)
    db.save_task(task)

    mock_event = MockEvent("memberJoined", "c_hiking_group_999")

    with patch("server.app.bot_service.parse_webhook_events", return_value=[mock_event]), \
         patch("server.app.bot_service.get_group_summary") as mock_summary, \
         patch("server.app.bot_service.push_dissolve_notice") as mock_notice:

        mock_summary.return_value = {"group_name": unique_name}
        mock_notice.return_value = True

        res = client.post(
            "/webhook",
            json={"dummy": "payload"},
            headers={"X-Line-Signature": "dummy_sig"},
        )
        assert res.status_code == 200

        # 驗證 task 已被配對並轉入 NOTICE_ACTIVE
        updated_task = db.get_task(task.task_id)
        assert updated_task.status == TaskStatus.NOTICE_ACTIVE
        assert updated_task.group_id == "c_hiking_group_999"
        mock_notice.assert_called_once()



def test_webhook_bot_kicked_aborts_task():
    """測試 Bot 被成員踢出群組 (leave/memberLeft) 自動將任務標記為 ABORTED_BOT_KICKED (FR-3.3.4)"""
    db = get_db_adapter()
    task = DissolveTask(
        group_name="測試防踢群組",
        group_id="c_kicked_group_123",
        status=TaskStatus.NOTICE_ACTIVE,
    )
    db.save_task(task)

    mock_event = MockEvent("leave", "c_kicked_group_123")

    with patch("server.app.bot_service.parse_webhook_events", return_value=[mock_event]):
        res = client.post(
            "/webhook",
            json={"dummy": "payload"},
            headers={"X-Line-Signature": "dummy_sig"},
        )
        assert res.status_code == 200

        updated_task = db.get_task(task.task_id)
        assert updated_task.status == TaskStatus.ABORTED_BOT_KICKED
        assert "踢出" in updated_task.notes


def test_audit_logs_api_and_cloud_sync():
    """測試 /api/audit-logs API 端點與 CloudSyncClient.list_audit_logs() 整合"""
    res = client.get("/api/audit-logs?limit=10")
    assert res.status_code == 200
    logs = res.json()
    assert isinstance(logs, list)

    cloud = CloudSyncClient(base_url="http://testserver")
    with patch("httpx.Client.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "timestamp": "2026-08-17T00:00:00Z",
                "task_id": "task_abc",
                "event_type": "NOTICE_SENT",
                "operator": "LINE_BOT",
                "details": "已發送公示訊息",
            }
        ]
        mock_get.return_value = mock_resp

        client_logs = cloud.list_audit_logs(limit=5)
        assert len(client_logs) == 1
        assert client_logs[0].event_type == "NOTICE_SENT"
        assert client_logs[0].task_id == "task_abc"
