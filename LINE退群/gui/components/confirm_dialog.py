"""
gui/components/confirm_dialog.py
二次確認彈窗元件
- 執行退群/解散前強制顯示
- 需手動輸入「CONFIRM」才可執行
- 完整列出即將處理的群組名稱
"""
from __future__ import annotations

import customtkinter as ctk
from typing import Callable, Optional


class ConfirmDialog(ctk.CTkToplevel):
    """
    執行確認彈窗

    使用方式：
        dialog = ConfirmDialog(
            parent=root,
            title="確認批次退群",
            action_desc="退出以下 5 個群組",
            group_names=["群組A", "群組B", ...],
            on_confirm=lambda: execute_leave(),
        )
    """

    _CONFIRM_KEYWORD = "CONFIRM"

    def __init__(
        self,
        parent: ctk.CTk,
        title: str,
        action_desc: str,
        group_names: list[str],
        on_confirm: Callable[[], None],
        action_color: str = "#EF4444",  # 危險操作預設紅色
    ):
        super().__init__(parent)
        self._on_confirm = on_confirm
        self._confirmed = False

        # 視窗設定
        self.title(title)
        self.resizable(False, False)
        self.grab_set()  # 模態視窗
        self.focus_set()

        # 置中顯示
        self.geometry("480x560")
        self._center_on_parent(parent)

        self._build_ui(title, action_desc, group_names, action_color)

    # ──────────────────────────────────────────────
    # UI 建構
    # ──────────────────────────────────────────────

    def _build_ui(self, title: str, action_desc: str, group_names: list[str], action_color: str) -> None:
        self.configure(fg_color="#1a1a2e")

        # 警告標頭
        header_frame = ctk.CTkFrame(self, fg_color="#2d1b1b", corner_radius=10)
        header_frame.pack(fill="x", padx=20, pady=(20, 0))

        ctk.CTkLabel(
            header_frame,
            text="⚠️  執行前確認",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color="#FCA5A5",
        ).pack(pady=(16, 4))

        ctk.CTkLabel(
            header_frame,
            text=action_desc,
            font=ctk.CTkFont(size=13),
            text_color="#E5E7EB",
        ).pack(pady=(0, 16))

        # 群組清單
        list_frame = ctk.CTkFrame(self, fg_color="#16213e", corner_radius=10)
        list_frame.pack(fill="both", expand=True, padx=20, pady=12)

        ctk.CTkLabel(
            list_frame,
            text=f"📋 即將處理的群組（共 {len(group_names)} 個）：",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#9CA3AF",
        ).pack(anchor="w", padx=14, pady=(12, 6))

        # 可捲動文字框
        text_box = ctk.CTkTextbox(
            list_frame,
            height=180,
            fg_color="#0f3460",
            text_color="#E5E7EB",
            font=ctk.CTkFont(size=12),
            corner_radius=8,
        )
        text_box.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        for i, name in enumerate(group_names, 1):
            text_box.insert("end", f"  {i:2d}. {name}\n")
        text_box.configure(state="disabled")

        # 輸入確認關鍵字
        input_frame = ctk.CTkFrame(self, fg_color="transparent")
        input_frame.pack(fill="x", padx=20)

        ctk.CTkLabel(
            input_frame,
            text=f'請輸入「{self._CONFIRM_KEYWORD}」以確認執行：',
            font=ctk.CTkFont(size=12),
            text_color="#9CA3AF",
        ).pack(anchor="w", pady=(0, 6))

        self._input = ctk.CTkEntry(
            input_frame,
            placeholder_text=f"輸入 {self._CONFIRM_KEYWORD}",
            fg_color="#0f3460",
            border_color="#374151",
            text_color="#FFFFFF",
            font=ctk.CTkFont(size=14),
            height=40,
        )
        self._input.pack(fill="x")
        self._input.bind("<Return>", lambda e: self._on_submit())
        self._input.bind("<KeyRelease>", lambda e: self._validate_input())

        # 按鈕列
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.pack(fill="x", padx=20, pady=16)
        btn_frame.columnconfigure(0, weight=1)
        btn_frame.columnconfigure(1, weight=1)

        ctk.CTkButton(
            btn_frame,
            text="取消",
            fg_color="#374151",
            hover_color="#4B5563",
            command=self.destroy,
        ).grid(row=0, column=0, sticky="ew", padx=(0, 6))

        self._confirm_btn = ctk.CTkButton(
            btn_frame,
            text="✅ 確認執行",
            fg_color=action_color,
            hover_color=self._darken(action_color),
            state="disabled",
            command=self._on_submit,
        )
        self._confirm_btn.grid(row=0, column=1, sticky="ew", padx=(6, 0))

    def _validate_input(self) -> None:
        """當輸入正確關鍵字時，解鎖確認按鈕"""
        if self._input.get().strip() == self._CONFIRM_KEYWORD:
            self._confirm_btn.configure(state="normal")
        else:
            self._confirm_btn.configure(state="disabled")

    def _on_submit(self) -> None:
        if self._input.get().strip() != self._CONFIRM_KEYWORD:
            return
        self._confirmed = True
        self.destroy()
        self._on_confirm()

    def _center_on_parent(self, parent: ctk.CTk) -> None:
        """將視窗置中於父視窗"""
        parent.update_idletasks()
        pw = parent.winfo_width()
        ph = parent.winfo_height()
        px = parent.winfo_x()
        py = parent.winfo_y()
        x = px + (pw - 480) // 2
        y = py + (ph - 560) // 2
        self.geometry(f"480x560+{x}+{y}")

    @staticmethod
    def _darken(hex_color: str, factor: float = 0.8) -> str:
        """將十六進位顏色加深"""
        hex_color = hex_color.lstrip("#")
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        r, g, b = int(r * factor), int(g * factor), int(b * factor)
        return f"#{r:02x}{g:02x}{b:02x}"
