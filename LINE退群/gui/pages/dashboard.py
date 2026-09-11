"""
gui/pages/dashboard.py
3 天緩衝公示監控儀表板頁面
- 顯示所有進行中的解散任務與倒數計時
- 支援與雲端伺服器進行任務雙向同步
- 提供「公示期滿一鍵解散」快速操作
- 支援發起人手動撤回任務
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Callable, Optional

import customtkinter as ctk

from automation.actions import ActionExecutor, ActionResult
from automation.line_controller import GroupInfo, LINEController
from core.cloud_sync import CloudSyncClient
from core.rate_limiter import RateLimiter
from core.task_state import DissolveTask, TaskManager, TaskStatus
from core.whitelist import WhitelistManager

# 狀態對應的顏色與標籤
_STATUS_INFO: dict[TaskStatus, dict] = {
    TaskStatus.DRAFT: {"color": "#6B7280", "label": "📝 草稿"},
    TaskStatus.INVITING_BOT: {"color": "#F59E0B", "label": "🤖 邀請Bot中"},
    TaskStatus.NOTICE_ACTIVE: {"color": "#3B82F6", "label": "📢 公示進行中"},
    TaskStatus.CANCELLED_BY_MEMBER: {"color": "#10B981", "label": "✋ 成員保留"},
    TaskStatus.CANCELLED_BY_INITIATOR: {"color": "#6B7280", "label": "↩️ 已撤回"},
    TaskStatus.READY_FOR_DISSOLUTION: {"color": "#EF4444", "label": "⏰ 待解散"},
    TaskStatus.EXECUTING: {"color": "#F59E0B", "label": "⚡ 執行中"},
    TaskStatus.COMPLETED: {"color": "#22C55E", "label": "✅ 已完成"},
    TaskStatus.ABORTED_BOT_KICKED: {"color": "#EF4444", "label": "⚠️ Bot被踢"},
    TaskStatus.FAILED: {"color": "#EF4444", "label": "❌ 失敗"},
}


class TaskCard(ctk.CTkFrame):
    """單個解散任務狀態卡片"""

    def __init__(
        self,
        master,
        task: DissolveTask,
        on_cancel: Optional[Callable[[str], None]] = None,
        on_execute: Optional[Callable[[DissolveTask], None]] = None,
        **kwargs,
    ):
        super().__init__(
            master,
            fg_color="#16213e",
            corner_radius=12,
            border_width=1,
            border_color="#2d3748",
            **kwargs,
        )
        self._task = task
        self._on_cancel = on_cancel
        self._on_execute = on_execute
        self._countdown_label: Optional[ctk.CTkLabel] = None
        self._build_ui()

    def _build_ui(self) -> None:
        info = _STATUS_INFO.get(self._task.status, {"color": "#6B7280", "label": "未知"})
        self.columnconfigure(1, weight=1)

        # 狀態顏色條
        status_bar = ctk.CTkFrame(self, fg_color=info["color"], corner_radius=6, width=4)
        status_bar.grid(row=0, column=0, rowspan=3, sticky="ns", padx=(12, 10), pady=12)

        # 群組名稱
        ctk.CTkLabel(
            self,
            text=self._task.group_name,
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color="#E5E7EB",
            anchor="w",
        ).grid(row=0, column=1, sticky="ew", pady=(12, 2))

        # 狀態徽章 + 發起人
        info_row = ctk.CTkFrame(self, fg_color="transparent")
        info_row.grid(row=1, column=1, sticky="ew", pady=2)

        ctk.CTkLabel(
            info_row,
            text=info["label"],
            font=ctk.CTkFont(size=11),
            text_color=info["color"],
            fg_color=self._make_bg(info["color"]),
            corner_radius=6,
            padx=8,
            pady=2,
        ).pack(side="left")

        ctk.CTkLabel(
            info_row,
            text=f"  發起人：{self._task.initiator_name}  •  任務 {self._task.task_id}",
            font=ctk.CTkFont(size=10),
            text_color="#6B7280",
        ).pack(side="left", padx=8)

        # 倒數計時（僅 NOTICE_ACTIVE 顯示）
        if self._task.status == TaskStatus.NOTICE_ACTIVE:
            self._countdown_label = ctk.CTkLabel(
                self,
                text=self._format_countdown(),
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color="#93C5FD",
                anchor="w",
            )
            self._countdown_label.grid(row=2, column=1, sticky="ew", pady=(0, 10))
            self._start_countdown()
        elif self._task.notes:
            ctk.CTkLabel(
                self,
                text=f"備註：{self._task.notes}",
                font=ctk.CTkFont(size=11),
                text_color="#9CA3AF",
                anchor="w",
            ).grid(row=2, column=1, sticky="ew", pady=(0, 8))

        # 操作按鈕（右側）
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=0, column=2, rowspan=3, padx=12, pady=12, sticky="e")

        if not self._task.is_terminal:
            ctk.CTkButton(
                btn_frame,
                text="撤回",
                width=64,
                height=28,
                fg_color="#374151",
                hover_color="#4B5563",
                font=ctk.CTkFont(size=11),
                command=self._cancel,
            ).pack(pady=2)

        if self._task.status == TaskStatus.READY_FOR_DISSOLUTION:
            ctk.CTkButton(
                btn_frame,
                text="⚡ 立即解散",
                width=90,
                height=28,
                fg_color="#EF4444",
                hover_color="#DC2626",
                font=ctk.CTkFont(size=11, weight="bold"),
                command=self._execute,
            ).pack(pady=2)

    def _format_countdown(self) -> str:
        remaining = self._task.countdown_seconds
        if remaining is None:
            return ""
        h = int(remaining // 3600)
        m = int((remaining % 3600) // 60)
        s = int(remaining % 60)
        return f"⏱  距解散還有：{h:02d}:{m:02d}:{s:02d}"

    def _start_countdown(self) -> None:
        def _tick():
            if self._countdown_label and self._countdown_label.winfo_exists():
                self._countdown_label.configure(text=self._format_countdown())
                self.after(1000, _tick)

        self.after(1000, _tick)

    def _cancel(self) -> None:
        if self._on_cancel:
            self._on_cancel(self._task.task_id)

    def _execute(self) -> None:
        if self._on_execute:
            self._on_execute(self._task)

    @staticmethod
    def _make_bg(hex_color: str) -> str:
        hex_color = hex_color.lstrip("#")
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        return f"#{int(r*0.2):02x}{int(g*0.2):02x}{int(b*0.2):02x}"


class DashboardPage(ctk.CTkFrame):
    """3天緩衝解散任務監控儀表板"""

    def __init__(
        self,
        master,
        task_manager: TaskManager,
        controller: Optional[LINEController] = None,
        rate_limiter: Optional[RateLimiter] = None,
        cloud_sync: Optional[CloudSyncClient] = None,
        **kwargs,
    ):
        super().__init__(master, fg_color="transparent", **kwargs)
        self._tm = task_manager
        self._ctrl = controller or LINEController()
        self._limiter = rate_limiter or RateLimiter()
        self._cloud_sync = cloud_sync or CloudSyncClient()
        self._build_ui()
        self._refresh()
        self._start_auto_sync()

    def _start_auto_sync(self) -> None:
        """啟動定時自動同步與倒數狀態巡檢"""
        def _poll():
            if self.winfo_exists():
                self._sync_cloud(quiet=True)
                self.after(20000, _poll)

        self.after(20000, _poll)

    def _build_ui(self) -> None:
        self.rowconfigure(3, weight=1)
        self.columnconfigure(0, weight=1)

        # 標頭
        header = ctk.CTkFrame(self, fg_color="#16213e", corner_radius=12)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 10))
        header.columnconfigure(1, weight=1)

        ctk.CTkLabel(
            header,
            text="📊  3 天緩衝公示儀表板",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color="#E5E7EB",
        ).grid(row=0, column=0, padx=16, pady=12, sticky="w")

        self._task_count_label = ctk.CTkLabel(
            header,
            text="",
            font=ctk.CTkFont(size=12),
            text_color="#9CA3AF",
        )
        self._task_count_label.grid(row=0, column=1, sticky="e", padx=16)

        btn_area = ctk.CTkFrame(header, fg_color="transparent")
        btn_area.grid(row=0, column=2, padx=(0, 16), pady=8)

        ctk.CTkButton(
            btn_area,
            text="☁️ 雲端同步",
            width=90,
            height=32,
            fg_color="#1E3A8A",
            hover_color="#1E40AF",
            font=ctk.CTkFont(size=11),
            command=self._sync_cloud,
        ).pack(side="left", padx=3)

        ctk.CTkButton(
            btn_area,
            text="🔄 重新整理",
            width=80,
            height=32,
            fg_color="#374151",
            hover_color="#4B5563",
            font=ctk.CTkFont(size=11),
            command=self._refresh,
        ).pack(side="left", padx=3)

        # 警示橫幅（期滿待解散任務提醒）
        self._banner_frame = ctk.CTkFrame(self, fg_color="#7F1D1D", corner_radius=10)
        self._banner_frame.grid(row=1, column=0, sticky="ew", pady=(0, 10))
        self._banner_frame.columnconfigure(0, weight=1)

        self._banner_label = ctk.CTkLabel(
            self._banner_frame,
            text="⏰ 有群組公示期滿待解散！",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color="#FCA5A5",
        )
        self._banner_label.grid(row=0, column=0, padx=16, pady=10, sticky="w")

        self._banner_btn = ctk.CTkButton(
            self._banner_frame,
            text="⚡ 一鍵解散所有期滿群組",
            fg_color="#DC2626",
            hover_color="#B91C1C",
            height=30,
            font=ctk.CTkFont(size=11, weight="bold"),
            command=self._execute_all_ready,
        )
        self._banner_btn.grid(row=0, column=1, padx=16, pady=8)
        self._banner_frame.grid_remove()  # 預設隱藏

        # 統計摘要
        stats_frame = ctk.CTkFrame(self, fg_color="#0f3460", corner_radius=10)
        stats_frame.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        self._stats_frame = stats_frame

        # 任務清單
        self._scroll = ctk.CTkScrollableFrame(
            self,
            fg_color="#0d1117",
            corner_radius=12,
            scrollbar_button_color="#374151",
        )
        self._scroll.grid(row=3, column=0, sticky="nsew")
        self._scroll.columnconfigure(0, weight=1)

    def _refresh(self) -> None:
        """刷新儀表板資料，並自動檢查是否有 NOTICE_ACTIVE 任務已期滿"""
        all_tasks = self._tm.list_all()
        now = datetime.now(timezone.utc)
        has_updated = False

        for t in all_tasks:
            if t.status == TaskStatus.NOTICE_ACTIVE and t.dissolve_at:
                try:
                    dt = datetime.fromisoformat(t.dissolve_at)
                    if now >= dt:
                        t.transition_to(TaskStatus.READY_FOR_DISSOLUTION, notes="72 小時公示期滿無異議")
                        has_updated = True
                except Exception:
                    pass

        if has_updated:
            self._tm._save()
            all_tasks = self._tm.list_all()

        active = sum(1 for t in all_tasks if t.status == TaskStatus.NOTICE_ACTIVE)
        ready = sum(1 for t in all_tasks if t.status == TaskStatus.READY_FOR_DISSOLUTION)
        completed = sum(1 for t in all_tasks if t.status == TaskStatus.COMPLETED)
        cancelled = sum(
            1
            for t in all_tasks
            if t.status in (TaskStatus.CANCELLED_BY_MEMBER, TaskStatus.CANCELLED_BY_INITIATOR)
        )

        self._task_count_label.configure(text=f"共 {len(all_tasks)} 個任務")
        self._render_stats(active, ready, completed, cancelled)

        # 控制期滿警示橫幅
        if ready > 0:
            self._banner_label.configure(text=f"⏰ 目前有 {ready} 個群組 72 小時公示期滿無人反對，可立即執行解散！")
            self._banner_frame.grid()
        else:
            self._banner_frame.grid_remove()

        self._render_tasks(all_tasks)

    def _render_stats(self, active: int, ready: int, completed: int, cancelled: int) -> None:
        for w in self._stats_frame.winfo_children():
            w.destroy()

        for col, (label, value, color) in enumerate([
            ("公示進行中", active, "#3B82F6"),
            ("待解散", ready, "#EF4444"),
            ("已完成", completed, "#22C55E"),
            ("已撤回", cancelled, "#6B7280"),
        ]):
            self._stats_frame.columnconfigure(col, weight=1)
            frame = ctk.CTkFrame(self._stats_frame, fg_color="transparent")
            frame.grid(row=0, column=col, padx=16, pady=10, sticky="ew")

            ctk.CTkLabel(
                frame,
                text=str(value),
                font=ctk.CTkFont(size=26, weight="bold"),
                text_color=color,
            ).pack()
            ctk.CTkLabel(
                frame,
                text=label,
                font=ctk.CTkFont(size=11),
                text_color="#9CA3AF",
            ).pack()

    def _render_tasks(self, tasks: list[DissolveTask]) -> None:
        for w in self._scroll.winfo_children():
            w.destroy()

        if not tasks:
            ctk.CTkLabel(
                self._scroll,
                text="📭  目前沒有進行中的解散任務\n\n請在「群組清單」頁面選擇「⏱️ 3 天公示解散」",
                font=ctk.CTkFont(size=13),
                text_color="#4B5563",
                justify="center",
            ).grid(row=0, column=0, pady=80)
            return

        priority = {
            TaskStatus.READY_FOR_DISSOLUTION: 0,
            TaskStatus.NOTICE_ACTIVE: 1,
            TaskStatus.EXECUTING: 2,
            TaskStatus.INVITING_BOT: 3,
            TaskStatus.DRAFT: 4,
        }
        sorted_tasks = sorted(tasks, key=lambda t: priority.get(t.status, 99))

        for idx, task in enumerate(sorted_tasks):
            card = TaskCard(
                self._scroll,
                task=task,
                on_cancel=self._cancel_task,
                on_execute=self._execute_single_task,
            )
            card.grid(row=idx, column=0, sticky="ew", padx=8, pady=4)

    def _cancel_task(self, task_id: str) -> None:
        self._tm.update_status(task_id, TaskStatus.CANCELLED_BY_INITIATOR, "發起人於桌面端撤回")
        if self._cloud_sync.is_available():
            self._cloud_sync.cancel_task(task_id)
        self._refresh()

    def _execute_single_task(self, task: DissolveTask) -> None:
        """執行單一群組期滿解散"""
        def _worker():
            executor = ActionExecutor(self._ctrl, self._limiter)
            group = GroupInfo(name=task.group_name, index=0)
            executor._dissolve_single(group)
            self._tm.update_status(task.task_id, TaskStatus.COMPLETED, notes="期滿解散完成")
            if self._cloud_sync.is_available():
                self._cloud_sync.complete_task(task.task_id)
            self.after(0, self._refresh)

        threading.Thread(target=_worker, daemon=True).start()

    def _execute_all_ready(self) -> None:
        """一鍵解散所有期滿群組"""
        ready_tasks = self._tm.list_by_status(TaskStatus.READY_FOR_DISSOLUTION)
        if not ready_tasks:
            return

        def _worker():
            executor = ActionExecutor(self._ctrl, self._limiter)
            groups = [GroupInfo(name=t.group_name, index=0) for t in ready_tasks]
            executor.bulk_dissolve(groups)
            for t in ready_tasks:
                self._tm.update_status(t.task_id, TaskStatus.COMPLETED, notes="期滿解散完成")
                if self._cloud_sync.is_available():
                    self._cloud_sync.complete_task(t.task_id)
            self.after(0, self._refresh)

        threading.Thread(target=_worker, daemon=True).start()

    def _sync_cloud(self, quiet: bool = False) -> None:
        """與雲端同步任務清單"""
        if not self._cloud_sync.is_available():
            return
        remote = self._cloud_sync.list_tasks()
        changed = False
        for rt in remote:
            lt = self._tm.get(rt.task_id)
            if not lt:
                self._tm._tasks[rt.task_id] = rt
                changed = True
            else:
                if lt.status != rt.status or lt.notes != rt.notes:
                    lt.status = rt.status
                    lt.notes = rt.notes
                    lt.cancelled_by = rt.cancelled_by
                    lt.cancelled_at = rt.cancelled_at
                    changed = True
        if changed:
            self._tm._save()
        self._refresh()
