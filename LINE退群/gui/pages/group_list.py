"""
gui/pages/group_list.py
群組清單主頁面
- 連接 LINE / 掃描群組
- 搜尋篩選、全選/反選
- 執行批次退群、批次直接解散、或 3 天緩衝公示解散 (推薦)
"""
from __future__ import annotations

import csv
import re
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Optional

import customtkinter as ctk

from automation.actions import ActionExecutor, ActionLog, ActionResult
from automation.line_controller import GroupInfo, LINEController
from config.settings import settings
from core.cloud_sync import CloudSyncClient
from core.rate_limiter import RateLimiter
from core.task_state import DissolveTask, TaskManager, TaskStatus
from core.whitelist import WhitelistManager
from gui.components.confirm_dialog import ConfirmDialog
from gui.components.group_card import GroupCard


class GroupListPage(ctk.CTkFrame):
    """群組清單與批次操作頁面"""

    def __init__(
        self,
        master,
        controller: LINEController,
        rate_limiter: RateLimiter,
        whitelist: WhitelistManager,
        task_manager: Optional[TaskManager] = None,
        cloud_sync: Optional[CloudSyncClient] = None,
        on_log: Optional[Callable[[str], None]] = None,
        **kwargs,
    ):
        super().__init__(master, fg_color="transparent", **kwargs)
        self._ctrl = controller
        self._limiter = rate_limiter
        self._whitelist = whitelist
        self._task_mgr = task_manager or TaskManager()
        self._cloud_sync = cloud_sync or CloudSyncClient()
        self._on_log = on_log or (lambda msg: None)

        self._all_groups: list[GroupInfo] = []
        self._cards: dict[str, GroupCard] = {}
        self._selected_group_names: set[str] = set()
        self._last_action_logs: list[ActionLog] = []
        self._is_running = False

        self._build_ui()

    # ──────────────────────────────────────────────
    # UI 建構
    # ──────────────────────────────────────────────

    def _build_ui(self) -> None:
        self.rowconfigure(2, weight=1)
        self.columnconfigure(0, weight=1)

        # ── 頂部工具列 ──
        toolbar = ctk.CTkFrame(self, fg_color="#16213e", corner_radius=12)
        toolbar.grid(row=0, column=0, sticky="ew", padx=0, pady=(0, 12))
        toolbar.columnconfigure(1, weight=1)

        # 連線狀態指示
        self._status_dot = ctk.CTkLabel(
            toolbar,
            text="●",
            font=ctk.CTkFont(size=16),
            text_color="#EF4444",  # 預設紅色（未連線）
            width=20,
        )
        self._status_dot.grid(row=0, column=0, padx=(16, 4), pady=12)

        self._status_label = ctk.CTkLabel(
            toolbar,
            text="未連線",
            font=ctk.CTkFont(size=12),
            text_color="#9CA3AF",
            anchor="w",
        )
        self._status_label.grid(row=0, column=1, sticky="w", pady=12)

        # 搜尋框
        self._search_var = ctk.StringVar()
        self._search_var.trace_add("write", self._on_search_changed)
        search_entry = ctk.CTkEntry(
            toolbar,
            textvariable=self._search_var,
            placeholder_text="🔍 關鍵字搜尋（支援正則表達式）",
            fg_color="#0f3460",
            border_color="#374151",
            height=36,
            width=280,
        )
        search_entry.grid(row=0, column=2, padx=12, pady=10)

        # 連線/掃描按鈕
        self._scan_btn = ctk.CTkButton(
            toolbar,
            text="🔄 連線並掃描群組",
            fg_color="#3B82F6",
            hover_color="#2563EB",
            height=36,
            command=self._scan_groups_async,
        )
        self._scan_btn.grid(row=0, column=3, padx=(0, 16), pady=10)

        # ── 選擇工具列 ──
        select_bar = ctk.CTkFrame(self, fg_color="#0f3460", corner_radius=10)
        select_bar.grid(row=1, column=0, sticky="ew", pady=(0, 8))

        self._selected_count_label = ctk.CTkLabel(
            select_bar,
            text="已選 0 個群組",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#93C5FD",
        )
        self._selected_count_label.pack(side="left", padx=16, pady=8)

        btn_row = ctk.CTkFrame(select_bar, fg_color="transparent")
        btn_row.pack(side="right", padx=12, pady=6)

        for text, cmd in [
            ("全選", self._select_all),
            ("全不選", self._deselect_all),
            ("反選", self._invert_selection),
        ]:
            ctk.CTkButton(
                btn_row, text=text, width=64, height=28,
                fg_color="#1e3a5f", hover_color="#2d4f7a",
                font=ctk.CTkFont(size=11),
                command=cmd,
            ).pack(side="left", padx=3)

        # ── 群組清單（可捲動）──
        self._scroll_frame = ctk.CTkScrollableFrame(
            self,
            fg_color="#0d1117",
            corner_radius=12,
            scrollbar_button_color="#374151",
            scrollbar_button_hover_color="#4B5563",
        )
        self._scroll_frame.grid(row=2, column=0, sticky="nsew", pady=(0, 12))
        self._scroll_frame.columnconfigure(0, weight=1)

        # 空白提示
        self._empty_label = ctk.CTkLabel(
            self._scroll_frame,
            text="📭  請先點擊「連線並掃描群組」",
            font=ctk.CTkFont(size=14),
            text_color="#4B5563",
        )
        self._empty_label.grid(row=0, column=0, pady=60)

        # ── 底部執行列 ──
        action_bar = ctk.CTkFrame(self, fg_color="#16213e", corner_radius=12)
        action_bar.grid(row=3, column=0, sticky="ew")
        action_bar.columnconfigure(0, weight=1)

        # 進度條
        self._progress_var = ctk.DoubleVar(value=0.0)
        self._progress_bar = ctk.CTkProgressBar(
            action_bar,
            variable=self._progress_var,
            height=6,
            progress_color="#3B82F6",
        )
        self._progress_bar.grid(row=0, column=0, columnspan=4, sticky="ew", padx=16, pady=(10, 0))
        self._progress_bar.grid_remove()

        self._progress_label = ctk.CTkLabel(
            action_bar,
            text="",
            font=ctk.CTkFont(size=11),
            text_color="#6B7280",
        )
        self._progress_label.grid(row=1, column=0, sticky="w", padx=16, pady=(4, 0))

        # 執行按鈕群組
        btn_area = ctk.CTkFrame(action_bar, fg_color="transparent")
        btn_area.grid(row=2, column=0, sticky="ew", padx=12, pady=10)

        self._stop_btn = ctk.CTkButton(
            btn_area,
            text="🛑 緊急停止",
            fg_color="#991B1B",
            hover_color="#7F1D1D",
            width=110,
            state="disabled",
            command=self._emergency_stop,
        )
        self._stop_btn.pack(side="left", padx=(4, 0))

        # 3 天緩衝公示按鈕 (推薦)
        self._notice_btn = ctk.CTkButton(
            btn_area,
            text="⏱️ 3 天公示解散 (推薦)",
            fg_color="#2563EB",
            hover_color="#1D4ED8",
            width=165,
            font=ctk.CTkFont(weight="bold"),
            command=lambda: self._confirm_action("notice"),
        )
        self._notice_btn.pack(side="right", padx=(0, 4))

        self._dissolve_btn = ctk.CTkButton(
            btn_area,
            text="💣 立即解散 (管理者)",
            fg_color="#7C3AED",
            hover_color="#6D28D9",
            width=145,
            command=lambda: self._confirm_action("dissolve"),
        )
        self._dissolve_btn.pack(side="right", padx=4)

        self._leave_btn = ctk.CTkButton(
            btn_area,
            text="🚪 僅自己退出",
            fg_color="#EF4444",
            hover_color="#DC2626",
            width=125,
            command=lambda: self._confirm_action("leave"),
        )
        self._leave_btn.pack(side="right", padx=4)

        ctk.CTkButton(
            btn_area,
            text="📤 匯出日誌",
            fg_color="#374151",
            hover_color="#4B5563",
            width=90,
            command=self._export_log,
        ).pack(side="right", padx=4)

    # ──────────────────────────────────────────────
    # 群組掃描
    # ──────────────────────────────────────────────

    def _scan_groups_async(self) -> None:
        """在背景執行緒掃描群組，避免凍結 GUI"""
        self._scan_btn.configure(state="disabled", text="掃描中...")
        self._set_status("連線中...", "#F59E0B")

        def _worker():
            connected = self._ctrl.connect()
            if not connected:
                self.after(0, lambda: self._set_status("連線失敗 (模擬模式)", "#F59E0B"))
                self._log("⚠️ 無法連接 LINE 視窗，已進入模擬模式")

            self.after(0, lambda: self._set_status("掃描中...", "#F59E0B"))

            groups = self._ctrl.scan_groups(
                progress_callback=lambda pct, msg: self.after(
                    0, lambda: self._update_progress(pct / 100, msg)
                )
            )
            self.after(0, lambda: self._on_scan_complete(groups))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_scan_complete(self, groups: list[GroupInfo]) -> None:
        self._all_groups = groups
        self._set_status(f"已連線  •  共 {len(groups)} 個群組", "#22C55E")
        self._scan_btn.configure(state="normal", text="🔄 重新掃描")
        self._render_groups(groups)
        self._progress_bar.grid_remove()
        self._log(f"✅ 掃描完成，共找到 {len(groups)} 個群組")

    # ──────────────────────────────────────────────
    # 群組渲染
    # ──────────────────────────────────────────────

    def _render_groups(self, groups: list[GroupInfo]) -> None:
        for widget in self._scroll_frame.winfo_children():
            widget.destroy()
        self._cards.clear()

        if not groups:
            ctk.CTkLabel(
                self._scroll_frame,
                text="📭  沒有找到任何群組",
                font=ctk.CTkFont(size=14),
                text_color="#4B5563",
            ).grid(row=0, column=0, pady=60)
            return

        for idx, group in enumerate(groups):
            is_protected = self._whitelist.is_protected(group.name)
            card = GroupCard(
                master=self._scroll_frame,
                group_name=group.name,
                index=idx + 1,
                is_protected=is_protected,
                on_select_change=self._on_selection_changed,
            )
            if group.name in self._selected_group_names and not is_protected:
                card.set_selected(True)
            card.grid(row=idx, column=0, sticky="ew", padx=8, pady=3)
            self._cards[group.name] = card

        self._scroll_frame.columnconfigure(0, weight=1)
        self._update_selected_count_label()

    # ──────────────────────────────────────────────
    # 搜尋篩選
    # ──────────────────────────────────────────────

    def _on_search_changed(self, *args) -> None:
        keyword = self._search_var.get().strip()
        if not keyword:
            filtered = self._all_groups
        else:
            try:
                pattern = re.compile(keyword, re.IGNORECASE)
                filtered = [g for g in self._all_groups if pattern.search(g.name)]
            except re.error:
                filtered = [g for g in self._all_groups if keyword.lower() in g.name.lower()]

        self._render_groups(filtered)

    # ──────────────────────────────────────────────
    # 選擇管理
    # ──────────────────────────────────────────────

    def _update_selected_count_label(self) -> None:
        count = len(self._selected_group_names)
        self._selected_count_label.configure(text=f"已選 {count} 個群組")

    def _on_selection_changed(self, group_name: str, is_selected: bool) -> None:
        if is_selected:
            self._selected_group_names.add(group_name)
        else:
            self._selected_group_names.discard(group_name)
        self._update_selected_count_label()

    def _select_all(self) -> None:
        for name, card in self._cards.items():
            if not card.is_protected:
                card.set_selected(True)
                self._selected_group_names.add(name)
        self._update_selected_count_label()

    def _deselect_all(self) -> None:
        for card in self._cards.values():
            card.set_selected(False)
        self._selected_group_names.clear()
        self._update_selected_count_label()

    def _invert_selection(self) -> None:
        for name, card in self._cards.items():
            if not card.is_protected:
                new_state = not card.is_selected
                card.set_selected(new_state)
                if new_state:
                    self._selected_group_names.add(name)
                else:
                    self._selected_group_names.discard(name)
        self._update_selected_count_label()

    def _get_selected_groups(self) -> list[GroupInfo]:
        return [
            g for g in self._all_groups
            if g.name in self._selected_group_names and not self._whitelist.is_protected(g.name)
        ]

    # ──────────────────────────────────────────────
    # 執行動作
    # ──────────────────────────────────────────────

    def _confirm_action(self, action: str) -> None:
        selected = self._get_selected_groups()
        if not selected:
            self._log("⚠️ 請先勾選至少一個群組")
            return

        if action == "notice":
            title = "確認啟動 3 天公示解散排程"
            desc = (
                f"即將為 {len(selected)} 個群組建立 3 天緩衝解散排程。\n"
                f"系統將自動進入群組邀請機器人發布公示與異議保留連結。"
            )
            color = "#2563EB"
        elif action == "dissolve":
            title = "確認立即解散群組"
            desc = f"即將【強制踢除所有成員並退出】 {len(selected)} 個群組"
            color = "#7C3AED"
        else:
            title = "確認退出群組"
            desc = f"即將【僅自己退出】 {len(selected)} 個群組"
            color = "#EF4444"

        ConfirmDialog(
            parent=self.winfo_toplevel(),
            title=title,
            action_desc=desc,
            group_names=[g.name for g in selected],
            on_confirm=lambda: self._execute_action(action, selected),
            action_color=color,
        )

    def _execute_action(self, action: str, groups: list[GroupInfo]) -> None:
        """在背景執行緒執行批次操作"""
        self._is_running = True
        self._stop_btn.configure(state="normal")
        self._leave_btn.configure(state="disabled")
        self._dissolve_btn.configure(state="disabled")
        self._notice_btn.configure(state="disabled")
        self._limiter.reset()
        self._progress_bar.grid()

        executor = ActionExecutor(self._ctrl, self._limiter, self._whitelist)

        def _progress(done: int, total: int, name: str) -> None:
            pct = done / max(1, total)
            self.after(0, lambda: self._update_progress(pct, f"{name} ({done}/{total})"))

        def _worker():
            if action == "notice":
                # 3 天緩衝公示流程
                cloud_active = self._cloud_sync.is_available()
                hours = settings.disband_notice_hours
                for idx, g in enumerate(groups, 1):
                    if self._limiter.is_stopped():
                        break
                    _progress(idx - 1, len(groups), f"正在建立任務：{g.name}")

                    # 建立本機任務
                    task = self._task_mgr.create(group_name=g.name, notice_hours=hours)
                    now = datetime.now(timezone.utc)
                    task.dissolve_at = (now + timedelta(hours=hours)).isoformat()
                    task.transition_to(TaskStatus.INVITING_BOT)
                    self._task_mgr._save()

                    # 註冊至雲端
                    if cloud_active:
                        cloud_t = self._cloud_sync.register_task(group_name=g.name, notice_hours=hours)
                        if cloud_t:
                            task.cancel_token = cloud_t.cancel_token
                            self._task_mgr._save()

                    # 邀請 Bot
                    log = executor._invite_bot_single(g, settings.line_bot_basic_id)
                    task.transition_to(TaskStatus.NOTICE_ACTIVE, notes=log.message)
                    self._task_mgr._save()

                    if idx < len(groups):
                        self._limiter.wait()

                self.after(0, lambda: self._on_notice_complete(len(groups)))

            elif action == "leave":
                logs = executor.bulk_leave(
                    groups,
                    progress_callback=_progress,
                    stop_check=self._limiter.is_stopped,
                )
                success = sum(1 for l in logs if l.result == ActionResult.SUCCESS)
                failed = sum(1 for l in logs if l.result == ActionResult.FAILED)
                self.after(0, lambda: self._on_action_complete(logs, success, failed))
            else:
                logs = executor.bulk_dissolve(
                    groups,
                    progress_callback=_progress,
                    stop_check=self._limiter.is_stopped,
                )
                success = sum(1 for l in logs if l.result == ActionResult.SUCCESS)
                failed = sum(1 for l in logs if l.result == ActionResult.FAILED)
                self.after(0, lambda: self._on_action_complete(logs, success, failed))

        threading.Thread(target=_worker, daemon=True).start()

    def _on_notice_complete(self, total: int) -> None:
        self._is_running = False
        self._stop_btn.configure(state="disabled")
        self._leave_btn.configure(state="normal")
        self._dissolve_btn.configure(state="normal")
        self._notice_btn.configure(state="normal")
        self._update_progress(1.0, f"已完成 {total} 個群組之 3 天公示排程啟動")
        self._log(f"✅ 已成功為 {total} 個群組啟動 3 天公示排程，請至「公示儀表板」查看倒數")

    def _on_action_complete(self, logs: list[ActionLog], success: int, failed: int) -> None:
        self._last_action_logs = logs
        self._is_running = False
        self._stop_btn.configure(state="disabled")
        self._leave_btn.configure(state="normal")
        self._dissolve_btn.configure(state="normal")
        self._notice_btn.configure(state="normal")
        self._update_progress(1.0, f"完成  ✓ {success} 成功  ✗ {failed} 失敗")
        self._log(f"✅ 執行完成：{success} 成功，{failed} 失敗")
        self._scan_groups_async()

    def _emergency_stop(self) -> None:
        self._limiter.stop()
        self._log("🛑 緊急停止已觸發，等待當前操作結束...")
        self._stop_btn.configure(state="disabled")

    # ──────────────────────────────────────────────
    # 工具方法
    # ──────────────────────────────────────────────

    def _set_status(self, text: str, color: str) -> None:
        self._status_dot.configure(text_color=color)
        self._status_label.configure(text=text)

    def _update_progress(self, fraction: float, message: str = "") -> None:
        self._progress_var.set(fraction)
        if message:
            self._progress_label.configure(text=message)

    def _log(self, message: str) -> None:
        self._on_log(message)

    def _export_log(self) -> None:
        from tkinter import filedialog

        logs_to_export = self._last_action_logs
        if not logs_to_export:
            self._log("ℹ️ 目前無即時操作紀錄可供匯出，請先執行退群或解散操作")
            return

        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV 檔案", "*.csv"), ("文字檔報告", "*.txt")],
            initialfile=f"line_leave_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
        )
        if not path:
            return

        try:
            p = Path(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            if path.lower().endswith(".txt"):
                total = len(logs_to_export)
                success_count = sum(1 for l in logs_to_export if l.result == ActionResult.SUCCESS)
                skipped_count = sum(1 for l in logs_to_export if l.result == ActionResult.SKIPPED_WHITELIST)
                not_admin_count = sum(1 for l in logs_to_export if l.result == ActionResult.SKIPPED_NOT_ADMIN)
                failed_count = total - success_count - skipped_count - not_admin_count

                lines = [
                    "=" * 60,
                    "           LINE 批次退群與清理工具 - 執行報告",
                    "=" * 60,
                    f"產生時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                    f"總處理群組數: {total}",
                    f"  • 成功退出/解散: {success_count}",
                    f"  • 白名單安全保護略過: {skipped_count}",
                    f"  • 無權限僅自己退出: {not_admin_count}",
                    f"  • 失敗或異常: {failed_count}",
                    "-" * 60,
                    "【明細紀錄】",
                ]
                for idx, l in enumerate(logs_to_export, 1):
                    lines.append(
                        f"[{idx:02d}] {l.timestamp[:19]} | {l.group_name} | {l.action} | {l.result.value} | {l.message}"
                    )
                lines.append("=" * 60)
                p.write_text("\n".join(lines), encoding="utf-8")
            else:
                with open(p, "w", newline="", encoding="utf-8-sig") as f:
                    writer = csv.writer(f)
                    writer.writerow(["時間", "群組名稱", "動作", "結果", "訊息"])
                    for l in logs_to_export:
                        writer.writerow([l.timestamp, l.group_name, l.action, l.result.value, l.message])
            self._log(f"📤 操作日誌已成功匯出至：{path}")
        except Exception as exc:
            self._log(f"❌ 匯出日誌失敗：{exc}")
