"""
gui/components/group_card.py
群組卡片元件
- 顯示群組名稱、勾選狀態、白名單鎖定狀態
- 支援勾選/取消勾選回調
"""
from __future__ import annotations

import customtkinter as ctk
from typing import Callable, Optional


class GroupCard(ctk.CTkFrame):
    """
    群組卡片

    參數：
        master: 父容器
        group_name: 群組名稱
        index: 序號（顯示用）
        is_protected: 是否為白名單保護群組
        on_select_change: 勾選狀態變更回調 (group_name, is_selected)
    """

    # 顏色常數
    _COLOR_NORMAL = "#16213e"
    _COLOR_NORMAL_HOVER = "#1a2850"
    _COLOR_SELECTED = "#1e3a5f"
    _COLOR_SELECTED_HOVER = "#24487a"
    _COLOR_PROTECTED = "#1a2d1a"
    _COLOR_BORDER_NORMAL = "#2d3748"
    _COLOR_BORDER_SELECTED = "#3B82F6"
    _COLOR_BORDER_PROTECTED = "#22C55E"

    def __init__(
        self,
        master,
        group_name: str,
        index: int,
        is_protected: bool = False,
        on_select_change: Optional[Callable[[str, bool], None]] = None,
        **kwargs,
    ):
        self._is_protected = is_protected
        self._is_selected = False
        self._group_name = group_name
        self._on_select_change = on_select_change

        bg = self._COLOR_PROTECTED if is_protected else self._COLOR_NORMAL
        border = self._COLOR_BORDER_PROTECTED if is_protected else self._COLOR_BORDER_NORMAL

        super().__init__(
            master,
            fg_color=bg,
            corner_radius=10,
            border_width=1,
            border_color=border,
            **kwargs,
        )

        self._build_ui(group_name, index, is_protected)
        self._bind_hover()

    # ──────────────────────────────────────────────
    # UI 建構
    # ──────────────────────────────────────────────

    def _build_ui(self, name: str, index: int, is_protected: bool) -> None:
        self.columnconfigure(1, weight=1)

        # 勾選框（被保護時禁用）
        self._var = ctk.BooleanVar(value=False)
        self._checkbox = ctk.CTkCheckBox(
            self,
            text="",
            variable=self._var,
            width=24,
            height=24,
            checkbox_width=20,
            checkbox_height=20,
            state="disabled" if is_protected else "normal",
            fg_color="#3B82F6",
            border_color="#6B7280",
            command=self._on_checkbox_change,
        )
        self._checkbox.grid(row=0, column=0, padx=(12, 8), pady=14, sticky="w")

        # 序號
        ctk.CTkLabel(
            self,
            text=f"{index:3d}",
            font=ctk.CTkFont(size=11),
            text_color="#6B7280",
            width=32,
        ).grid(row=0, column=1, sticky="w", padx=(0, 4))

        # 群組名稱
        name_label = ctk.CTkLabel(
            self,
            text=name,
            font=ctk.CTkFont(size=13, weight="bold" if is_protected else "normal"),
            text_color="#D1FAE5" if is_protected else "#E5E7EB",
            anchor="w",
        )
        name_label.grid(row=0, column=2, sticky="ew", padx=4)

        # 狀態徽章
        if is_protected:
            badge = ctk.CTkLabel(
                self,
                text="🔒 白名單",
                font=ctk.CTkFont(size=10),
                text_color="#22C55E",
                fg_color="#14532d",
                corner_radius=6,
                padx=8,
                pady=2,
            )
            badge.grid(row=0, column=3, padx=(4, 12), sticky="e")
        else:
            self._badge = ctk.CTkLabel(
                self,
                text="",
                font=ctk.CTkFont(size=10),
                text_color="#9CA3AF",
                fg_color="transparent",
                corner_radius=6,
                padx=8,
                pady=2,
            )
            self._badge.grid(row=0, column=3, padx=(4, 12), sticky="e")

        self.columnconfigure(2, weight=1)

        # 整張卡片可點擊
        if not is_protected:
            self.bind("<Button-1>", self._on_card_click)
            name_label.bind("<Button-1>", self._on_card_click)

    def _bind_hover(self) -> None:
        """滑鼠懸停效果"""
        if self._is_protected:
            return
        self.bind("<Enter>", lambda e: self._update_bg(hover=True))
        self.bind("<Leave>", lambda e: self._update_bg(hover=False))

    # ──────────────────────────────────────────────
    # 事件處理
    # ──────────────────────────────────────────────

    def _on_card_click(self, event=None) -> None:
        """點擊整張卡片切換勾選"""
        if self._is_protected:
            return
        self._var.set(not self._var.get())
        self._on_checkbox_change()

    def _on_checkbox_change(self) -> None:
        self._is_selected = self._var.get()
        self._update_style()
        if self._on_select_change:
            self._on_select_change(self._group_name, self._is_selected)

    def _update_bg(self, hover: bool) -> None:
        if self._is_selected:
            bg = self._COLOR_SELECTED_HOVER if hover else self._COLOR_SELECTED
        else:
            bg = self._COLOR_NORMAL_HOVER if hover else self._COLOR_NORMAL
        self.configure(fg_color=bg)

    def _update_style(self) -> None:
        if self._is_selected:
            self.configure(
                fg_color=self._COLOR_SELECTED,
                border_color=self._COLOR_BORDER_SELECTED,
            )
            if hasattr(self, "_badge"):
                self._badge.configure(
                    text="✓ 已選",
                    text_color="#93C5FD",
                    fg_color="#1e3a5f",
                )
        else:
            self.configure(
                fg_color=self._COLOR_NORMAL,
                border_color=self._COLOR_BORDER_NORMAL,
            )
            if hasattr(self, "_badge"):
                self._badge.configure(text="", fg_color="transparent")

    # ──────────────────────────────────────────────
    # 公開 API
    # ──────────────────────────────────────────────

    def set_selected(self, selected: bool) -> None:
        if self._is_protected:
            return
        self._var.set(selected)
        self._is_selected = selected
        self._update_style()

    @property
    def is_selected(self) -> bool:
        return self._is_selected

    @property
    def group_name(self) -> str:
        return self._group_name

    @property
    def is_protected(self) -> bool:
        return self._is_protected
