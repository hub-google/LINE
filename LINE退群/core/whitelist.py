"""
core/whitelist.py
群組白名單管理器
- 本機存為 whitelist.json（後期可遷移至 Google Sheets）
- 支援關鍵字比對（partial match）與精確比對
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from loguru import logger

_DEFAULT_PATH = Path(__file__).resolve().parent.parent / "data" / "whitelist.json"


class WhitelistEntry:
    """白名單條目"""

    def __init__(
        self,
        group_name: str,
        category: str = "其他",
        notes: str = "",
        added_at: Optional[str] = None,
    ):
        self.group_name = group_name.strip()
        self.category = category
        self.notes = notes
        self.added_at = added_at or datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        return {
            "group_name": self.group_name,
            "category": self.category,
            "notes": self.notes,
            "added_at": self.added_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "WhitelistEntry":
        return cls(
            group_name=d["group_name"],
            category=d.get("category", "其他"),
            notes=d.get("notes", ""),
            added_at=d.get("added_at"),
        )


class WhitelistManager:
    """
    白名單管理器
    - add(group_name): 加入白名單
    - remove(group_name): 從白名單移除
    - is_protected(group_name): 是否受保護（關鍵字比對）
    - list_all(): 取得所有條目
    """

    def __init__(self, path: Path = _DEFAULT_PATH):
        self._path = path
        self._entries: list[WhitelistEntry] = []
        self._load()

    # ──────────────────────────────────────────────
    # 公開 API
    # ──────────────────────────────────────────────

    def add(self, group_name: str, category: str = "其他", notes: str = "") -> bool:
        """加入白名單，若已存在回傳 False"""
        if self.is_protected(group_name):
            logger.warning(f"白名單已有匹配條目：{group_name!r}")
            return False
        entry = WhitelistEntry(group_name=group_name, category=category, notes=notes)
        self._entries.append(entry)
        self._save()
        logger.info(f"已加入白名單：{group_name!r} [{category}]")
        return True

    def remove(self, group_name: str) -> bool:
        """精確移除白名單條目，回傳是否成功"""
        original = len(self._entries)
        self._entries = [e for e in self._entries if e.group_name != group_name.strip()]
        if len(self._entries) < original:
            self._save()
            logger.info(f"已從白名單移除：{group_name!r}")
            return True
        logger.warning(f"找不到白名單條目：{group_name!r}")
        return False

    def is_protected(self, group_name: str) -> bool:
        """
        判斷群組名稱是否受白名單保護（支援關鍵字包含比對）
        """
        name = group_name.strip()
        for entry in self._entries:
            if entry.group_name in name or name in entry.group_name:
                return True
        return False

    def list_all(self) -> list[WhitelistEntry]:
        return list(self._entries)

    def count(self) -> int:
        return len(self._entries)

    # ──────────────────────────────────────────────
    # 私有：讀寫 JSON
    # ──────────────────────────────────────────────

    def _load(self) -> None:
        if not self._path.exists():
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._entries = []
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            self._entries = [WhitelistEntry.from_dict(d) for d in data]
            logger.debug(f"已載入白名單：{len(self._entries)} 筆")
        except Exception as exc:
            logger.error(f"白名單讀取失敗：{exc}，使用空白名單")
            self._entries = []

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps([e.to_dict() for e in self._entries], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.debug(f"白名單已儲存至：{self._path}")
