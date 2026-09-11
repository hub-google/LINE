"""
gui/pages/settings.py
設定與白名單管理頁面
- 新增/刪除白名單條目
- 延遲設定調整 (Rate Limiter)
- 雲端伺服器與資料庫連線診斷 (Cloud & Database Status)
- 版本資訊
"""
from __future__ import annotations

import threading
from typing import Optional

import customtkinter as ctk

from config.settings import settings
from core.cloud_sync import CloudSyncClient
from core.db import get_db_adapter
from core.rate_limiter import RateLimiter
from core.whitelist import WhitelistEntry, WhitelistManager


class SettingsPage(ctk.CTkFrame):
    """設定與白名單管理頁面"""

    _CATEGORIES = ["家人", "工作", "朋友", "置頂", "其他"]

    def __init__(
        self,
        master,
        whitelist: WhitelistManager,
        rate_limiter: RateLimiter,
        cloud_sync: Optional[CloudSyncClient] = None,
        **kwargs,
    ):
        super().__init__(master, fg_color="transparent", **kwargs)
        self._wl = whitelist
        self._limiter = rate_limiter
        self._cloud = cloud_sync or CloudSyncClient()
        self._build_ui()

    def _build_ui(self) -> None:
        self.columnconfigure(0, weight=1)
        self.columnconfigure(1, weight=1)
        self.rowconfigure(0, weight=1)

        # ── 左欄：白名單管理 ──
        left = ctk.CTkFrame(self, fg_color="#16213e", corner_radius=12)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 6))
        left.rowconfigure(2, weight=1)
        left.columnconfigure(0, weight=1)

        ctk.CTkLabel(
            left,
            text="🔒  群組安全白名單",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color="#E5E7EB",
        ).grid(row=0, column=0, padx=16, pady=(16, 4), sticky="w")

        ctk.CTkLabel(
            left,
            text="白名單中的群組將無法被勾選、退出或解散，保護重要群組安全",
            font=ctk.CTkFont(size=11),
            text_color="#6B7280",
            wraplength=280,
            justify="left",
        ).grid(row=1, column=0, padx=16, sticky="w", pady=(0, 8))

        # 白名單清單
        self._wl_scroll = ctk.CTkScrollableFrame(
            left,
            fg_color="#0d1117",
            corner_radius=10,
        )
        self._wl_scroll.grid(row=2, column=0, sticky="nsew", padx=12, pady=(0, 12))
        self._wl_scroll.columnconfigure(0, weight=1)

        # 新增白名單
        add_frame = ctk.CTkFrame(left, fg_color="#0f3460", corner_radius=10)
        add_frame.grid(row=3, column=0, sticky="ew", padx=12, pady=(0, 16))
        add_frame.columnconfigure(0, weight=1)

        ctk.CTkLabel(
            add_frame,
            text="新增群組到白名單：",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color="#9CA3AF",
        ).grid(row=0, column=0, padx=12, pady=(10, 4), sticky="w", columnspan=2)

        self._add_name_entry = ctk.CTkEntry(
            add_frame,
            placeholder_text="群組名稱（支援關鍵字，如：家人）",
            fg_color="#16213e",
            height=36,
        )
        self._add_name_entry.grid(row=1, column=0, padx=12, pady=(0, 8), sticky="ew", columnspan=2)

        self._category_var = ctk.StringVar(value="其他")
        ctk.CTkOptionMenu(
            add_frame,
            variable=self._category_var,
            values=self._CATEGORIES,
            fg_color="#16213e",
            button_color="#374151",
            height=32,
        ).grid(row=2, column=0, padx=12, pady=(0, 10), sticky="ew")

        ctk.CTkButton(
            add_frame,
            text="+ 加入白名單",
            fg_color="#22C55E",
            hover_color="#16A34A",
            height=32,
            command=self._add_whitelist,
        ).grid(row=2, column=1, padx=(4, 12), pady=(0, 10), sticky="ew")

        add_frame.columnconfigure(0, weight=2)
        add_frame.columnconfigure(1, weight=1)

        self._refresh_whitelist()

        # ── 右欄：操作設定與連線診斷 ──
        right = ctk.CTkFrame(self, fg_color="#16213e", corner_radius=12)
        right.grid(row=0, column=1, sticky="nsew", padx=(6, 0))
        right.columnconfigure(0, weight=1)

        ctk.CTkLabel(
            right,
            text="⚙️  操作設定與連線診斷",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color="#E5E7EB",
        ).grid(row=0, column=0, padx=16, pady=(16, 12), sticky="w")

        # 延遲設定
        delay_frame = ctk.CTkFrame(right, fg_color="#0f3460", corner_radius=10)
        delay_frame.grid(row=1, column=0, sticky="ew", padx=12, pady=(0, 12))
        delay_frame.columnconfigure(0, weight=1)

        ctk.CTkLabel(
            delay_frame,
            text="⏱  防限流延遲間隔（秒）",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#93C5FD",
        ).grid(row=0, column=0, padx=12, pady=(10, 4), sticky="w")

        ctk.CTkLabel(
            delay_frame,
            text="每次退群/踢人之間的隨機等待時間，防止 LINE 觸發防刷機制",
            font=ctk.CTkFont(size=10),
            text_color="#6B7280",
        ).grid(row=1, column=0, padx=12, sticky="w", pady=(0, 8))

        row_min = ctk.CTkFrame(delay_frame, fg_color="transparent")
        row_min.grid(row=2, column=0, padx=12, sticky="ew")
        row_min.columnconfigure(1, weight=1)

        ctk.CTkLabel(row_min, text="最小：", font=ctk.CTkFont(size=11),
                     text_color="#9CA3AF", width=50).grid(row=0, column=0, sticky="w")
        self._min_slider = ctk.CTkSlider(
            row_min, from_=0.5, to=5.0, number_of_steps=45,
            progress_color="#3B82F6", command=self._on_delay_change
        )
        self._min_slider.set(self._limiter._min)
        self._min_slider.grid(row=0, column=1, sticky="ew", padx=8)
        self._min_label = ctk.CTkLabel(row_min, text=f"{self._limiter._min}s", font=ctk.CTkFont(size=11),
                                        text_color="#E5E7EB", width=36)
        self._min_label.grid(row=0, column=2)

        row_max = ctk.CTkFrame(delay_frame, fg_color="transparent")
        row_max.grid(row=3, column=0, padx=12, sticky="ew", pady=(4, 12))
        row_max.columnconfigure(1, weight=1)

        ctk.CTkLabel(row_max, text="最大：", font=ctk.CTkFont(size=11),
                     text_color="#9CA3AF", width=50).grid(row=0, column=0, sticky="w")
        self._max_slider = ctk.CTkSlider(
            row_max, from_=0.5, to=10.0, number_of_steps=95,
            progress_color="#EF4444", command=self._on_delay_change
        )
        self._max_slider.set(self._limiter._max)
        self._max_slider.grid(row=0, column=1, sticky="ew", padx=8)
        self._max_label = ctk.CTkLabel(row_max, text=f"{self._limiter._max}s", font=ctk.CTkFont(size=11),
                                        text_color="#E5E7EB", width=36)
        self._max_label.grid(row=0, column=2)

        # 雲端與資料庫連線診斷
        diag_frame = ctk.CTkFrame(right, fg_color="#0f3460", corner_radius=10)
        diag_frame.grid(row=2, column=0, sticky="ew", padx=12, pady=(0, 12))
        diag_frame.columnconfigure(1, weight=1)

        ctk.CTkLabel(
            diag_frame,
            text="🌐  雲端中繼與資料庫連線狀態",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#93C5FD",
        ).grid(row=0, column=0, columnspan=2, padx=12, pady=(10, 8), sticky="w")

        db_name = type(get_db_adapter()).__name__
        ctk.CTkLabel(diag_frame, text="資料庫模式：", font=ctk.CTkFont(size=11), text_color="#9CA3AF").grid(
            row=1, column=0, padx=12, pady=2, sticky="w"
        )
        ctk.CTkLabel(
            diag_frame,
            text=f"{db_name} (Google Sheets / JSON)",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color="#E5E7EB",
        ).grid(row=1, column=1, padx=12, pady=2, sticky="w")

        ctk.CTkLabel(diag_frame, text="雲端伺服器：", font=ctk.CTkFont(size=11), text_color="#9CA3AF").grid(
            row=2, column=0, padx=12, pady=2, sticky="w"
        )
        self._server_status_label = ctk.CTkLabel(
            diag_frame,
            text="檢查中...",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color="#F59E0B",
        )
        self._server_status_label.grid(row=2, column=1, padx=12, pady=2, sticky="w")

        btn_diag_row = ctk.CTkFrame(diag_frame, fg_color="transparent")
        btn_diag_row.grid(row=3, column=0, columnspan=2, padx=12, pady=(8, 12), sticky="ew")
        btn_diag_row.columnconfigure(0, weight=1)
        btn_diag_row.columnconfigure(1, weight=1)

        ctk.CTkButton(
            btn_diag_row,
            text="🔍 測試伺服器連線",
            height=28,
            fg_color="#1E3A8A",
            hover_color="#1D4ED8",
            font=ctk.CTkFont(size=11),
            command=self._test_connection,
        ).grid(row=0, column=0, padx=(0, 4), sticky="ew")

        ctk.CTkButton(
            btn_diag_row,
            text="📜 檢視稽核日誌",
            height=28,
            fg_color="#047857",
            hover_color="#059669",
            font=ctk.CTkFont(size=11),
            command=self._show_audit_logs_dialog,
        ).grid(row=0, column=1, padx=(4, 0), sticky="ew")

        # 關於資訊
        about_frame = ctk.CTkFrame(right, fg_color="#0f3460", corner_radius=10)
        about_frame.grid(row=3, column=0, sticky="ew", padx=12, pady=(0, 16))

        ctk.CTkLabel(
            about_frame,
            text="LINE 批次退群與群組清理工具",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color="#E5E7EB",
        ).pack(pady=(12, 2))

        ctk.CTkLabel(
            about_frame,
            text="版本 1.0.0 (SRS 全功能實作完成)",
            font=ctk.CTkFont(size=10),
            text_color="#6B7280",
        ).pack()

        ctk.CTkLabel(
            about_frame,
            text="支援 3 天公示通知、LINE Bot Webhook、Google Sheets 整合",
            font=ctk.CTkFont(size=10),
            text_color="#9CA3AF",
        ).pack(pady=(2, 10))

        # 初始檢查連線
        self._test_connection()

    # ──────────────────────────────────────────────
    # 白名單操作
    # ──────────────────────────────────────────────

    def _refresh_whitelist(self) -> None:
        for w in self._wl_scroll.winfo_children():
            w.destroy()

        entries = self._wl.list_all()
        if not entries:
            ctk.CTkLabel(
                self._wl_scroll,
                text="（白名單為空）\n加入白名單的群組將無法被誤退",
                font=ctk.CTkFont(size=11),
                text_color="#4B5563",
                justify="center",
            ).pack(pady=30)
            return

        for entry in entries:
            row = ctk.CTkFrame(self._wl_scroll, fg_color="#16213e", corner_radius=8)
            row.pack(fill="x", padx=4, pady=3)
            row.columnconfigure(1, weight=1)

            ctk.CTkLabel(
                row,
                text="🔒",
                font=ctk.CTkFont(size=13),
                text_color="#22C55E",
                width=24,
            ).grid(row=0, column=0, padx=(10, 6), pady=8)

            ctk.CTkLabel(
                row,
                text=entry.group_name,
                font=ctk.CTkFont(size=12, weight="bold"),
                text_color="#D1FAE5",
                anchor="w",
            ).grid(row=0, column=1, sticky="ew")

            ctk.CTkLabel(
                row,
                text=f"[{entry.category}]",
                font=ctk.CTkFont(size=10),
                text_color="#6B7280",
            ).grid(row=0, column=2, padx=8)

            ctk.CTkButton(
                row,
                text="移除",
                width=52,
                height=24,
                fg_color="#7F1D1D",
                hover_color="#991B1B",
                font=ctk.CTkFont(size=10),
                command=lambda n=entry.group_name: self._remove_whitelist(n),
            ).grid(row=0, column=3, padx=(0, 8), pady=6)

    def _add_whitelist(self) -> None:
        name = self._add_name_entry.get().strip()
        if not name:
            return
        self._wl.add(name, category=self._category_var.get())
        self._add_name_entry.delete(0, "end")
        self._refresh_whitelist()

    def _remove_whitelist(self, name: str) -> None:
        self._wl.remove(name)
        self._refresh_whitelist()

    # ──────────────────────────────────────────────
    # 延遲設定
    # ──────────────────────────────────────────────

    def _on_delay_change(self, value=None) -> None:
        min_val = round(self._min_slider.get(), 1)
        max_val = round(self._max_slider.get(), 1)
        if min_val > max_val:
            self._max_slider.set(min_val + 0.5)
            max_val = min_val + 0.5
        self._min_label.configure(text=f"{min_val}s")
        self._max_label.configure(text=f"{max_val}s")
        self._limiter.set_range(min_val, max_val)

    def _test_connection(self) -> None:
        self._server_status_label.configure(text="檢測中...", text_color="#F59E0B")

        def _worker():
            online = self._cloud.is_available()
            if online:
                self.after(
                    0,
                    lambda: self._server_status_label.configure(
                        text=f"已連線 ({settings.app_base_url})", text_color="#22C55E"
                    ),
                )
            else:
                self.after(
                    0,
                    lambda: self._server_status_label.configure(
                        text=f"未連線 ({settings.app_base_url})", text_color="#EF4444"
                    ),
                )

        threading.Thread(target=_worker, daemon=True).start()

    def _show_audit_logs_dialog(self) -> None:
        """顯示稽核日誌 (AuditLogs) 瀏覽彈窗"""
        db = get_db_adapter()
        logs = db.list_audit_logs(limit=100)

        dialog = ctk.CTkToplevel(self)
        dialog.title("📜 系統稽核日誌 (Audit Logs)")
        dialog.geometry("700x520")
        dialog.configure(fg_color="#0F172A")
        dialog.grab_set()

        # 標題列
        top_frame = ctk.CTkFrame(dialog, fg_color="#1E293B", corner_radius=0)
        top_frame.pack(fill="x", padx=0, pady=0)
        top_frame.columnconfigure(0, weight=1)

        ctk.CTkLabel(
            top_frame,
            text=f"📜 系統操作與事件稽核日誌 (最新 {len(logs)} 筆)",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color="#F8FAFC",
        ).grid(row=0, column=0, padx=16, pady=12, sticky="w")

        def _export_audit_csv():
            from tkinter import filedialog
            import csv
            path = filedialog.asksaveasfilename(
                defaultextension=".csv",
                filetypes=[("CSV 檔案", "*.csv")],
                initialfile="audit_logs.csv",
            )
            if path:
                with open(path, "w", newline="", encoding="utf-8-sig") as f:
                    writer = csv.writer(f)
                    writer.writerow(["時間", "任務ID", "事件類型", "操作主體", "詳細內容"])
                    for l in logs:
                        writer.writerow([l.timestamp, l.task_id, l.event_type, l.operator, l.details])

        ctk.CTkButton(
            top_frame,
            text="📤 匯出 CSV",
            width=90,
            height=28,
            fg_color="#059669",
            hover_color="#047857",
            font=ctk.CTkFont(size=11),
            command=_export_audit_csv,
        ).grid(row=0, column=1, padx=16, pady=12, sticky="e")

        # 文字內容區
        scroll_box = ctk.CTkTextbox(
            dialog,
            fg_color="#0d1117",
            text_color="#E2E8F0",
            font=ctk.CTkFont(family="Consolas", size=11),
            corner_radius=8,
        )
        scroll_box.pack(fill="both", expand=True, padx=16, pady=16)

        if not logs:
            scroll_box.insert("end", "目前尚無任何稽核日誌紀錄。\n")
        else:
            for l in logs:
                ts = l.timestamp[:19] if l.timestamp else "-"
                scroll_box.insert(
                    "end",
                    f"[{ts}] [{l.event_type:<18}] [{l.operator:<14}] {l.details}\n",
                )
        scroll_box.configure(state="disabled")

