"""
gui/app_window.py
主應用程式視窗
- CustomTkinter 深色主題
- 三分頁：群組清單 / 儀表板 / 設定
- 底部日誌區
- 全域緊急停止快捷鍵 (Esc / Ctrl+Q)
"""
from __future__ import annotations

import sys
import threading
from datetime import datetime, timezone

import customtkinter as ctk

from automation.line_controller import LINEController
from core.cloud_sync import CloudSyncClient
from core.rate_limiter import RateLimiter
from core.task_state import TaskManager, TaskStatus
from core.whitelist import WhitelistManager
from gui.pages.dashboard import DashboardPage
from gui.pages.group_list import GroupListPage
from gui.pages.settings import SettingsPage

# 全域外觀設定
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

_APP_TITLE = "LINE 批次退群與群組清理工具"
_APP_VERSION = "v1.0.0"
_WIN_MIN_W = 1000
_WIN_MIN_H = 700


class AppWindow(ctk.CTk):
    """
    主應用程式視窗

    組合所有服務實例並注入各頁面：
    - LINEController：視窗自動化
    - RateLimiter：防限流
    - WhitelistManager：白名單
    - TaskManager：任務狀態機
    - CloudSyncClient：跨端通訊同步
    """

    def __init__(self):
        super().__init__()

        # 服務實例
        self._ctrl = LINEController()
        self._limiter = RateLimiter()
        self._whitelist = WhitelistManager()
        self._task_mgr = TaskManager()
        self._cloud_sync = CloudSyncClient()

        # 視窗設定
        self.title(f"{_APP_TITLE}  {_APP_VERSION}")
        self.minsize(_WIN_MIN_W, _WIN_MIN_H)
        self.geometry(f"{_WIN_MIN_W + 100}x{_WIN_MIN_H + 80}")
        self.configure(fg_color="#0d1117")

        self._build_ui()
        self._bind_shortcuts()
        self._log(f"🚀 {_APP_TITLE} 已啟動  {_APP_VERSION}")
        self._log("💡 提示：點擊「連線並掃描群組」開始，Esc / Ctrl+Q 觸發緊急停止")
        self.after(600, self._check_startup_ready_tasks)

    # ──────────────────────────────────────────────
    # UI 建構
    # ──────────────────────────────────────────────

    def _build_ui(self) -> None:
        self.rowconfigure(1, weight=1)
        self.columnconfigure(0, weight=1)

        # ── 頂部標題列 ──
        header = ctk.CTkFrame(self, fg_color="#111827", corner_radius=0, height=56)
        header.grid(row=0, column=0, sticky="ew")
        header.grid_propagate(False)
        header.columnconfigure(1, weight=1)

        # Logo / 標題
        ctk.CTkLabel(
            header,
            text="▶  LINE 群組管家",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color="#E5E7EB",
        ).grid(row=0, column=0, padx=20, pady=12, sticky="w")

        ctk.CTkLabel(
            header,
            text=_APP_VERSION,
            font=ctk.CTkFont(size=11),
            text_color="#4B5563",
        ).grid(row=0, column=1, padx=8, sticky="w")

        # 緊急停止按鈕
        self._emergency_btn = ctk.CTkButton(
            header,
            text="🛑  緊急停止 [Esc]",
            fg_color="#7F1D1D",
            hover_color="#991B1B",
            text_color="#FCA5A5",
            width=160,
            height=36,
            font=ctk.CTkFont(size=12, weight="bold"),
            command=self._emergency_stop,
        )
        self._emergency_btn.grid(row=0, column=2, padx=20, pady=10)

        # ── 主體區（分頁 + 日誌）──
        main_frame = ctk.CTkFrame(self, fg_color="transparent")
        main_frame.grid(row=1, column=0, sticky="nsew", padx=0, pady=0)
        main_frame.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)

        # 分頁容器
        content_area = ctk.CTkFrame(main_frame, fg_color="transparent")
        content_area.grid(row=0, column=0, sticky="nsew", padx=16, pady=(16, 0))
        content_area.rowconfigure(1, weight=1)
        content_area.columnconfigure(0, weight=1)

        # 分頁選擇按鈕列
        tab_bar = ctk.CTkFrame(content_area, fg_color="#111827", corner_radius=10, height=44)
        tab_bar.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        tab_bar.grid_propagate(False)

        self._tab_buttons: dict[str, ctk.CTkButton] = {}
        self._pages: dict[str, ctk.CTkFrame] = {}
        self._active_tab = ""

        tab_defs = [
            ("group_list", "🏠  群組清單"),
            ("dashboard", "📊  公示儀表板"),
            ("settings", "⚙️  設定與診斷"),
        ]

        for tab_id, tab_label in tab_defs:
            btn = ctk.CTkButton(
                tab_bar,
                text=tab_label,
                fg_color="transparent",
                hover_color="#1e2a3a",
                text_color="#9CA3AF",
                corner_radius=8,
                height=36,
                font=ctk.CTkFont(size=13),
                command=lambda t=tab_id: self._switch_tab(t),
            )
            btn.pack(side="left", padx=4, pady=4)
            self._tab_buttons[tab_id] = btn

        # 建立各頁面容器
        page_frame = ctk.CTkFrame(content_area, fg_color="transparent")
        page_frame.grid(row=1, column=0, sticky="nsew")
        page_frame.rowconfigure(0, weight=1)
        page_frame.columnconfigure(0, weight=1)
        self._page_frame = page_frame

        # 建立群組清單頁
        group_page = GroupListPage(
            page_frame,
            controller=self._ctrl,
            rate_limiter=self._limiter,
            whitelist=self._whitelist,
            task_manager=self._task_mgr,
            cloud_sync=self._cloud_sync,
            on_log=self._log,
        )
        group_page.grid(row=0, column=0, sticky="nsew")
        self._pages["group_list"] = group_page

        self._pages["dashboard"] = None
        self._pages["settings"] = None

        # ── 底部日誌區 ──
        log_frame = ctk.CTkFrame(main_frame, fg_color="#111827", corner_radius=0)
        log_frame.grid(row=1, column=0, sticky="ew", padx=0, pady=0)
        log_frame.columnconfigure(0, weight=1)

        ctk.CTkLabel(
            log_frame,
            text="📋 執行日誌",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color="#6B7280",
        ).grid(row=0, column=0, padx=16, pady=(8, 0), sticky="w")

        self._log_box = ctk.CTkTextbox(
            log_frame,
            height=100,
            fg_color="#0d1117",
            text_color="#6EE7B7",
            font=ctk.CTkFont(family="Consolas", size=11),
            corner_radius=0,
            border_width=0,
        )
        self._log_box.grid(row=1, column=0, sticky="ew", padx=0)
        self._log_box.configure(state="disabled")

        # 預設顯示群組清單頁
        self._switch_tab("group_list")

    # ──────────────────────────────────────────────
    # 分頁切換
    # ──────────────────────────────────────────────

    def _switch_tab(self, tab_id: str) -> None:
        if self._active_tab == tab_id:
            return

        for tid, btn in self._tab_buttons.items():
            if tid == tab_id:
                btn.configure(fg_color="#1e3a5f", text_color="#93C5FD")
            else:
                btn.configure(fg_color="transparent", text_color="#9CA3AF")

        if self._active_tab and self._pages.get(self._active_tab):
            self._pages[self._active_tab].grid_remove()

        page = self._pages.get(tab_id)
        if page is None:
            page = self._create_page(tab_id)
            self._pages[tab_id] = page

        page.grid(row=0, column=0, sticky="nsew")
        self._active_tab = tab_id

    def _create_page(self, tab_id: str) -> ctk.CTkFrame:
        if tab_id == "dashboard":
            return DashboardPage(
                self._page_frame,
                task_manager=self._task_mgr,
                controller=self._ctrl,
                rate_limiter=self._limiter,
                cloud_sync=self._cloud_sync,
            )
        elif tab_id == "settings":
            return SettingsPage(
                self._page_frame,
                whitelist=self._whitelist,
                rate_limiter=self._limiter,
                cloud_sync=self._cloud_sync,
            )
        raise ValueError(f"未知分頁：{tab_id}")

    # ──────────────────────────────────────────────
    # 快捷鍵
    # ──────────────────────────────────────────────

    def _bind_shortcuts(self) -> None:
        self.bind("<Escape>", lambda e: self._emergency_stop())
        self.bind("<Control-q>", lambda e: self._emergency_stop())
        self.bind("<Control-Q>", lambda e: self._emergency_stop())

    def _emergency_stop(self) -> None:
        self._limiter.stop()
        self._log("🛑 緊急停止已觸發（Esc / Ctrl+Q）")

    # ──────────────────────────────────────────────
    # 日誌
    # ──────────────────────────────────────────────

    def _log(self, message: str) -> None:
        """在日誌區追加一行訊息（執行緒安全）"""
        def _append():
            ts = datetime.now().strftime("%H:%M:%S")
            self._log_box.configure(state="normal")
            self._log_box.insert("end", f"[{ts}] {message}\n")
            self._log_box.see("end")
            self._log_box.configure(state="disabled")

        if threading.current_thread() is threading.main_thread():
            _append()
        else:
            self.after(0, _append)

    def _check_startup_ready_tasks(self) -> None:
        """開機/啟動時檢查是否有 72 小時公示期滿待解散的任務 (FR-3.3.5)"""
        all_tasks = self._task_mgr.list_all()
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
            self._task_mgr._save()

        ready_tasks = self._task_mgr.list_by_status(TaskStatus.READY_FOR_DISSOLUTION)
        if ready_tasks:
            count = len(ready_tasks)
            self._log(f"⏰ 【待處理提醒】有 {count} 個群組 72 小時公示期滿無人反對，請至「公示儀表板」一鍵解散！")
            if "dashboard" in self._tab_buttons:
                self._tab_buttons["dashboard"].configure(text=f"📊  公示儀表板 ({count})", text_color="#EF4444")

