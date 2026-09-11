"""
tests/test_server_app.py
測試 FastAPI 伺服器端點、兩階段防爬蟲異議終止與跨端 API
"""
from fastapi.testclient import TestClient

from core.db import get_db_adapter
from core.task_state import DissolveTask, TaskStatus
from server.app import app
from server.security import generate_cancel_token

client = TestClient(app)


def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"


def test_api_create_and_list_tasks():
    res = client.post(
        "/api/tasks",
        json={"group_name": "API測試群組", "initiator_name": "APIUser", "notice_hours": 72},
    )
    assert res.status_code == 200
    task_data = res.json()
    assert task_data["group_name"] == "API測試群組"
    assert task_data["status"] == "INVITING_BOT"
    assert task_data["cancel_token"] != ""

    task_id = task_data["task_id"]

    # 查詢任務清單
    list_res = client.get("/api/tasks")
    assert list_res.status_code == 200
    all_tasks = list_res.json()
    assert any(t["task_id"] == task_id for t in all_tasks)


def test_anti_crawler_revocation_flow():
    """
    測試防爬蟲兩階段異議終止：
    1. GET 請求只渲染 HTML，不改變狀態（防爬蟲預覽誤觸）
    2. POST 請求手動確認後正式終止
    """
    db = get_db_adapter()
    task = DissolveTask(group_name="爬蟲防護測試群組", initiator_name="陳大明")
    task.transition_to(TaskStatus.INVITING_BOT)
    task.transition_to(TaskStatus.NOTICE_ACTIVE)
    task.cancel_token = generate_cancel_token(task.task_id)
    db.save_task(task)

    # 1. 模擬 LINE 爬蟲 GET 抓取網頁縮圖
    get_res = client.get(f"/revoke/{task.task_id}?token={task.cancel_token}")
    assert get_res.status_code == 200
    assert "保留群組確認" in get_res.text
    # 確認狀態仍為 NOTICE_ACTIVE，未被撤銷
    saved_task = db.get_task(task.task_id)
    assert saved_task.status == TaskStatus.NOTICE_ACTIVE

    # 2. 模擬成員手動點擊「確認保留」按鈕 (POST 請求)
    post_res = client.post(
        f"/revoke/{task.task_id}",
        data={"token": task.cancel_token, "member_name": "林小美"},
    )
    assert post_res.status_code == 200
    assert "解散程序已終止" in post_res.text

    # 驗證狀態已轉為 CANCELLED_BY_MEMBER 且記錄反對者暱稱
    after_task = db.get_task(task.task_id)
    assert after_task.status == TaskStatus.CANCELLED_BY_MEMBER
    assert after_task.cancelled_by == "林小美"
