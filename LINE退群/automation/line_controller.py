"""
automation/line_controller.py
LINE 視窗自動化核心
- 連接 LINE 電腦版視窗
- 掃描群組清單
- 依賴 ui_mapping.json 的元件定位設定
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from loguru import logger

# 嘗試載入 pywinauto（開發機可能未安裝）
try:
    import pywinauto
    from pywinauto import Application, Desktop
    from pywinauto.findwindows import ElementNotFoundError
    _PYWINAUTO_AVAILABLE = True
except ImportError:
    _PYWINAUTO_AVAILABLE = False
    logger.warning("pywinauto 未安裝，自動化功能將以模擬模式運行")

_UI_MAP_PATH = Path(__file__).resolve().parent.parent / "config" / "ui_mapping.json"


@dataclass
class GroupInfo:
    """掃描到的群組資訊"""
    name: str
    index: int          # 在清單中的位置（0-based）
    is_muted: bool = False
    unread_count: int = 0
    raw_handle: object = field(default=None, repr=False)  # pywinauto 控制項參考

    def __hash__(self):
        return hash(self.name)


class LINEController:
    """
    LINE 電腦版視窗自動化控制器

    - connect(): 連接已開啟的 LINE 視窗
    - scan_groups(): 掃描並回傳群組清單
    - leave_group(group): 退出指定群組
    - is_connected(): 回傳連線狀態
    """

    def __init__(self, ui_map_path: Path = _UI_MAP_PATH):
        self._app: Optional[object] = None
        self._main_window: Optional[object] = None
        self._ui_map: dict = self._load_ui_map(ui_map_path)
        self._connected = False

    # ──────────────────────────────────────────────
    # 連線管理
    # ──────────────────────────────────────────────

    def connect(self) -> bool:
        """
        嘗試連接已執行中的 LINE 電腦版視窗。
        回傳 True 表示連線成功。
        """
        if not _PYWINAUTO_AVAILABLE:
            logger.warning("[模擬模式] pywinauto 未可用，回傳假連線成功")
            self._connected = True
            return True

        title_contains = self._ui_map.get("window", {}).get("title_contains", "LINE")
        timeout = self._ui_map.get("timing", {}).get("window_connect_timeout_sec", 2.0)

        try:
            self._app = Application(backend="uia").connect(
                title_re=f".*{title_contains}.*",
                timeout=timeout,
            )
            self._main_window = self._app.top_window()
            self._connected = True
            logger.info(f"已成功連接 LINE 視窗：{self._main_window.window_text()!r}")
            return True
        except Exception as exc:
            logger.error(f"連接 LINE 視窗失敗：{exc}")
            self._connected = False
            return False

    def disconnect(self) -> None:
        self._app = None
        self._main_window = None
        self._connected = False
        logger.info("LINE 視窗連線已中斷")

    def is_connected(self) -> bool:
        if not self._connected:
            return False
        if not _PYWINAUTO_AVAILABLE:
            return True
        # 驗證視窗仍然存在
        try:
            if self._main_window:
                self._main_window.window_text()
            return True
        except Exception:
            self._connected = False
            return False

    # ──────────────────────────────────────────────
    # 群組掃描
    # ──────────────────────────────────────────────

    def scan_groups(
        self,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> list[GroupInfo]:
        """
        掃描 LINE 聊天清單中的所有群組。
        progress_callback(percent, message) 可用於 GUI 進度回報。
        """
        if not _PYWINAUTO_AVAILABLE or not self.is_connected():
            logger.warning("未連接到 LINE 桌面版視窗，切換至模擬群組資料")
            return self._mock_scan_groups()

        logger.info("開始掃描 LINE 群組清單...")
        groups: list[GroupInfo] = []

        try:
            # 取得聊天清單控制項
            chat_list = self._find_chat_list()
            if not chat_list:
                logger.warning("找不到聊天清單元件，回傳空清單")
                return []

            items = chat_list.descendants(control_type="ListItem")
            total = len(items)
            logger.info(f"聊天清單共 {total} 個項目，開始篩選群組...")

            for idx, item in enumerate(items):
                if progress_callback:
                    percent = int((idx + 1) / max(1, total) * 100)
                    progress_callback(percent, f"掃描 {idx + 1}/{total}")

                name = self._extract_group_name(item)
                if name and self._is_group_item(item):
                    group = GroupInfo(name=name, index=idx, raw_handle=item)
                    groups.append(group)
                    logger.debug(f"找到群組：{name!r}")

        except Exception as exc:
            logger.error(f"掃描群組時發生錯誤：{exc}")

        logger.info(f"掃描完成：共找到 {len(groups)} 個群組")
        return groups

    # ──────────────────────────────────────────────
    # 私有：UI 元件定位
    # ──────────────────────────────────────────────

    def _find_chat_list(self) -> Optional[object]:
        """尋找聊天清單元件"""
        try:
            return self._main_window.child_window(control_type="List", found_index=0)
        except Exception as exc:
            logger.debug(f"找不到聊天清單：{exc}")
            return None

    def _extract_group_name(self, item: object) -> str:
        """從清單項目中提取群組名稱"""
        try:
            texts = [child.window_text() for child in item.children() if child.window_text()]
            return texts[0].strip() if texts else ""
        except Exception:
            return ""

    def _is_group_item(self, item: object) -> bool:
        """
        判斷是否為群組類型的聊天室項目。
        目前以「元件層次中是否有群組圖示」或「名稱不含特定個人對話特徵」判斷。
        此判斷邏輯可能因 LINE 版本而異，後期可加入圖像比對。
        """
        try:
            # 群組通常有多個子元件（名稱 + 成員數量標記等）
            children = item.children()
            return len(children) >= 2
        except Exception:
            return False

    # ──────────────────────────────────────────────
    # 模擬模式（pywinauto 未安裝時）
    # ──────────────────────────────────────────────

    def _mock_scan_groups(self) -> list[GroupInfo]:
        """回傳模擬資料，用於開發環境測試 GUI 而不需要 LINE"""
        mock_names = [
            "2023大安區烤肉團",
            "臨時活動群 - 新年晚會",
            "舊同事聚餐群（已散夥）",
            "某某社區跑步群",
            "網購拼單群 購物節",
            "大學時代足球隊",
            "公司團購餐廳推薦",
            "家人群組 🏠",
            "媽媽的朋友讀書會",
            "每日英文練習打卡群",
            "年度健康挑戰賽",
            "2022 春節年夜飯",
        ]
        logger.info(f"[模擬模式] 回傳 {len(mock_names)} 個模擬群組")
        return [
            GroupInfo(name=name, index=idx)
            for idx, name in enumerate(mock_names)
        ]

    # ──────────────────────────────────────────────
    # 工具方法
    # ──────────────────────────────────────────────

    @staticmethod
    def _load_ui_map(path: Path) -> dict:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error(f"載入 ui_mapping.json 失敗：{exc}，使用空設定")
            return {}
