"""
server/app.py
FastAPI 雲端中繼伺服器與 Webhook 核心應用程式
- 提供 LINE Messaging API Webhook 接收器 (/callback)
- 提供防爬蟲誤觸之兩階段異議終止網頁 (/revoke/{task_id})
- 提供本機桌面端 / CLI 跨端通訊同步 REST APIs (/api/tasks, /api/sync)
- 整合 APScheduler、HMAC-SHA256 安全簽章與 Google Sheets 資料庫
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Body, FastAPI, Form, Header, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from loguru import logger
from pydantic import BaseModel, Field

from config.settings import settings
from core.audit_log import AuditLogManager
from core.db import get_db_adapter
from core.task_state import DissolveTask, TaskStatus
from core.whitelist import WhitelistEntry
from server.line_bot import LineBotService
from server.scheduler import TaskScheduler
from server.security import generate_cancel_token, verify_cancel_token

# 模板引擎
_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
templates = Jinja2Templates(directory=str(_TEMPLATES_DIR))

# 全域服務實例
bot_service = LineBotService()
audit_mgr = AuditLogManager()
scheduler = TaskScheduler(bot_service=bot_service, audit_mgr=audit_mgr)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    logger.info("🚀 啟動 LINE 退群中繼 Webhook 伺服器...")
    scheduler.start()
    yield
    logger.info("🛑 關閉中繼伺服器...")
    scheduler.shutdown()


app = FastAPI(
    title="LINE 批次退群與群組管家 - 雲端中繼微服務",
    description="處理 LINE Bot Webhook、72 小時公示倒數排程、防爬蟲異議終止確認頁面與跨端同步",
    version="1.0.0",
    lifespan=lifespan,
)


# ──────────────────────────────────────────────
# Pydantic 請求模型
# ──────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    group_name: str
    group_id: Optional[str] = ""
    initiator_name: str = "使用者"
    notice_hours: int = Field(default=72, ge=1, le=720)


class UpdateTaskStatusRequest(BaseModel):
    status: TaskStatus
    notes: Optional[str] = ""


class WhitelistAddRequest(BaseModel):
    group_name: str
    category: str = "其他"
    notes: str = ""


# ──────────────────────────────────────────────
# 1. 系統健康檢查與資訊
# ──────────────────────────────────────────────

@app.get("/", response_class=JSONResponse)
async def root():
    return {
        "app": "LINE Group Manager Cloud Relay",
        "status": "operational",
        "version": "1.0.0",
        "bot_configured": bot_service.is_configured(),
    }


@app.get("/api/health", response_class=JSONResponse)
async def health_check():
    db = get_db_adapter()
    return {
        "status": "healthy",
        "database": type(db).__name__,
        "bot_configured": bot_service.is_configured(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ──────────────────────────────────────────────
# 2. LINE Webhook 接收端點
# ──────────────────────────────────────────────

@app.post("/callback")
@app.post("/webhook")
async def line_webhook(
    request: Request,
    x_line_signature: Optional[str] = Header(None, alias="X-Line-Signature"),
):
    """
    LINE Messaging API Webhook 事件處理器
    - 監聽 join / memberJoined: 綁定 groupId 並推播 3 天公示 Flex Message
    - 監聽 leave / memberLeft: 若 Bot 被踢出，標記 ABORTED_BOT_KICKED
    """
    body = await request.body()
    body_text = body.decode("utf-8")

    if not x_line_signature:
        logger.warning("收到未附帶 X-Line-Signature 的 Webhook 請求")
        # 若未設定 LINE Bot 密鑰（開發測試模式），允許通過
        if not bot_service.secret:
            return JSONResponse({"status": "dev_mode_ok"})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing signature")

    try:
        events = bot_service.parse_webhook_events(body_text, x_line_signature)
    except Exception as exc:
        logger.error(f"Webhook 簽章驗證失敗：{exc}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    db = get_db_adapter()

    for event in events:
        event_type = getattr(event, "type", "")
        source = getattr(event, "source", None)
        source_type = getattr(source, "type", "") if source else ""
        group_id = getattr(source, "group_id", "") if source_type == "group" else ""

        logger.info(f"收到 LINE Webhook 事件：type={event_type}, source_type={source_type}, group_id={group_id}")

        # 事件 A：Bot 加入群組 (join 或 memberJoined)
        if event_type in ("join", "memberJoined") and group_id:
            audit_mgr.record("", "BOT_JOINED", "LINE_BOT", f"Bot 加入群組：group_id={group_id}")
            
            # 嘗試取得 LINE 遠端群組真實名稱
            summary = bot_service.get_group_summary(group_id)
            remote_group_name = summary.get("group_name", "").strip() if summary else ""

            tasks = db.list_all_tasks()
            target_task = None

            # 1. 優先嘗試名稱精確匹配
            if remote_group_name:
                for t in tasks:
                    if t.status in (TaskStatus.INVITING_BOT, TaskStatus.DRAFT) and t.group_name == remote_group_name:
                        target_task = t
                        break

            # 2. 若無名稱匹配，依序選取最早建立的待邀請任務
            if not target_task:
                for t in tasks:
                    if t.status in (TaskStatus.INVITING_BOT, TaskStatus.DRAFT):
                        target_task = t
                        break

            if target_task:
                target_task.group_id = group_id
                target_task.status = TaskStatus.NOTICE_ACTIVE
                now = datetime.now(timezone.utc)
                hours = settings.disband_notice_hours
                target_task.dissolve_at = (now + timedelta(hours=hours)).isoformat()
                target_task.cancel_token = generate_cancel_token(target_task.task_id)
                db.save_task(target_task)

                # 產生異議終止連結
                base_url = settings.app_base_url.rstrip("/")
                revoke_url = f"{base_url}/revoke/{target_task.task_id}?token={target_task.cancel_token}"

                # 推播 3 天待解散公告 Flex Message
                dissolve_dt_str = (now + timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M")
                bot_service.push_dissolve_notice(
                    group_id=group_id,
                    group_name=target_task.group_name,
                    initiator_name=target_task.initiator_name,
                    dissolve_at_str=dissolve_dt_str,
                    revoke_url=revoke_url,
                )

                audit_mgr.record(
                    target_task.task_id,
                    "NOTICE_SENT",
                    "LINE_BOT",
                    f"已向群組 [{target_task.group_name}] 推播 3 天解散公告",
                )

        # 事件 B：Bot 離開或被踢出群組 (leave 或 memberLeft)
        elif event_type in ("leave", "memberLeft") and group_id:
            tasks = db.list_all_tasks()
            for t in tasks:
                if t.group_id == group_id and t.status == TaskStatus.NOTICE_ACTIVE:
                    t.transition_to(
                        TaskStatus.ABORTED_BOT_KICKED,
                        notes="Bot 在公示期間被群組成員踢出",
                    )
                    db.save_task(t)
                    audit_mgr.record(
                        t.task_id,
                        "BOT_KICKED",
                        "LINE_MEMBER",
                        f"群組 [{t.group_name}] 之機器人被踢出，已中止倒數",
                    )

    return JSONResponse({"status": "success"})


# ──────────────────────────────────────────────
# 3. 防爬蟲預覽誤觸之兩階段異議終止 Web 路由
# ──────────────────────────────────────────────

@app.get("/revoke/{task_id}", response_class=HTMLResponse)
async def get_revoke_page(
    request: Request,
    task_id: str,
    token: Optional[str] = None,
):
    """
    第一階段：顯示異議確認 Web 頁面 (GET 請求)
    ⚠️ 重要安全防護：GET 請求絕不直接執行撤銷，防止 LINE 爬蟲預覽縮圖誤觸！
    """
    db = get_db_adapter()
    task = db.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="找不到指定的解散任務")

    # 驗證 Token（若有傳入）
    query_token = token or task.cancel_token
    if not query_token or not verify_cancel_token(task_id, query_token):
        raise HTTPException(status_code=403, detail="無效或已過期的安全驗證碼")

    dissolve_at_formatted = "-"
    if task.dissolve_at:
        try:
            dt = datetime.fromisoformat(task.dissolve_at)
            dissolve_at_formatted = dt.strftime("%Y-%m-%d %H:%M (UTC)")
        except Exception:
            dissolve_at_formatted = task.dissolve_at

    return templates.TemplateResponse(
        request=request,
        name="revoke.html",
        context={
            "task_id": task_id,
            "group_name": task.group_name,
            "initiator_name": task.initiator_name,
            "dissolve_at": dissolve_at_formatted,
            "token": query_token,
            "liff_id": settings.line_liff_id,
            "member_name": "",
        },
    )


@app.post("/revoke/{task_id}", response_class=HTMLResponse)
async def post_revoke_action(
    request: Request,
    task_id: str,
    token: str = Form(...),
    member_name: Optional[str] = Form(""),
):
    """
    第二階段：使用者點擊「確認保留此群組」按鈕 (POST 請求)
    正式執行撤銷程序：
    1. 驗證 HMAC Token
    2. 狀態轉為 CANCELLED_BY_MEMBER
    3. 群組推播保留確認公告
    4. Bot 自動退出群組 (leaveGroup)
    """
    db = get_db_adapter()
    task = db.get_task(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="找不到指定的解散任務")

    if not verify_cancel_token(task_id, token):
        raise HTTPException(status_code=403, detail="安全驗證失敗")

    if task.is_terminal:
        # 已處於終止或已撤銷狀態
        return templates.TemplateResponse(
            request=request,
            name="revoked_success.html",
            context={"group_name": task.group_name},
        )

    # 執行狀態轉移
    cancelled_by_name = (member_name or "群組成員").strip()
    task.transition_to(
        TaskStatus.CANCELLED_BY_MEMBER,
        notes=f"由成員【{cancelled_by_name}】點擊終止",
    )
    task.cancelled_at = datetime.now(timezone.utc).isoformat()
    task.cancelled_by = cancelled_by_name
    db.save_task(task)

    # 推播終止公告並離群
    if task.group_id:
        bot_service.push_revoked_notice(task.group_id, task.group_name, cancelled_by_name)
        bot_service.leave_group(task.group_id)

    audit_mgr.record(
        task_id=task.task_id,
        event_type="REVOKED_BY_MEMBER",
        operator="LINE_MEMBER",
        details=f"成員 [{cancelled_by_name}] 確認保留群組 [{task.group_name}]",
    )

    return templates.TemplateResponse(
        request=request,
        name="revoked_success.html",
        context={"group_name": task.group_name},
    )


# ──────────────────────────────────────────────
# 4. 跨端通訊同步 REST APIs (提供桌面端與 CLI 使用)
# ──────────────────────────────────────────────

@app.get("/api/tasks", response_class=JSONResponse)
async def api_list_tasks(status: Optional[str] = None):
    """查詢任務清單"""
    db = get_db_adapter()
    tasks = db.list_all_tasks()
    if status:
        tasks = [t for t in tasks if t.status.value == status]
    return [t.to_dict() for t in tasks]


@app.post("/api/tasks", response_class=JSONResponse)
async def api_create_task(req: CreateTaskRequest):
    """本機桌面端註冊 3 天緩衝解散新任務"""
    db = get_db_adapter()
    now = datetime.now(timezone.utc)
    task = DissolveTask(
        group_name=req.group_name,
        group_id=req.group_id or "",
        initiator_name=req.initiator_name,
        status=TaskStatus.INVITING_BOT,
        created_at=now.isoformat(),
        dissolve_at=(now + timedelta(hours=req.notice_hours)).isoformat(),
    )
    task.cancel_token = generate_cancel_token(task.task_id)
    db.save_task(task)

    audit_mgr.record(
        task.task_id,
        "TASK_REGISTERED",
        "DESKTOP_CLIENT",
        f"發起人 [{req.initiator_name}] 註冊待解散任務 [{req.group_name}]",
    )
    return task.to_dict()


@app.get("/api/tasks/ready", response_class=JSONResponse)
async def api_list_ready_tasks():
    """查詢所有公示期滿 (READY_FOR_DISSOLUTION) 待執行的任務"""
    db = get_db_adapter()
    tasks = [t for t in db.list_all_tasks() if t.status == TaskStatus.READY_FOR_DISSOLUTION]
    return [t.to_dict() for t in tasks]


@app.post("/api/tasks/{task_id}/cancel", response_class=JSONResponse)
async def api_cancel_task(task_id: str):
    """發起人於桌面端/CLI 主動撤回任務"""
    db = get_db_adapter()
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")

    success = task.transition_to(TaskStatus.CANCELLED_BY_INITIATOR, notes="發起人主動撤回")
    if success:
        task.cancelled_at = datetime.now(timezone.utc).isoformat()
        db.save_task(task)
        if task.group_id:
            bot_service.push_revoked_notice(task.group_id, task.group_name, "發起人")
            bot_service.leave_group(task.group_id)
        audit_mgr.record(task.task_id, "CANCELLED_BY_INITIATOR", "DESKTOP_CLIENT", f"發起人撤回任務 [{task.group_name}]")
        return {"success": True, "task": task.to_dict()}
    raise HTTPException(status_code=400, detail=f"任務當前狀態 ({task.status}) 無法撤回")


@app.post("/api/tasks/{task_id}/complete", response_class=JSONResponse)
async def api_complete_task(task_id: str):
    """本機端批次踢人/解散完成後標記完成"""
    db = get_db_adapter()
    task = db.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")

    task.status = TaskStatus.COMPLETED
    task.notes = "解散完成"
    db.save_task(task)
    audit_mgr.record(task.task_id, "DISSOLVE_COMPLETED", "DESKTOP_CLIENT", f"群組 [{task.group_name}] 已成功解散")
    return {"success": True, "task": task.to_dict()}


@app.get("/api/whitelist", response_class=JSONResponse)
async def api_get_whitelist():
    """取得白名單清單"""
    db = get_db_adapter()
    entries = db.list_whitelist()
    return [e.to_dict() for e in entries]


@app.post("/api/whitelist", response_class=JSONResponse)
async def api_add_whitelist(req: WhitelistAddRequest):
    """新增白名單"""
    db = get_db_adapter()
    entry = WhitelistEntry(group_name=req.group_name, category=req.category, notes=req.notes)
    success = db.add_whitelist(entry)
    return {"success": success, "entry": entry.to_dict()}


@app.get("/api/audit-logs", response_class=JSONResponse)
async def api_get_audit_logs(limit: Optional[int] = 50):
    """取得稽核日誌紀錄"""
    db = get_db_adapter()
    logs = db.list_audit_logs(limit=limit)
    return [l.to_dict() for l in logs]

