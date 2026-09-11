"""
core/db/__init__.py
資料庫工廠模組：提供統一資料庫存取實例
- 若設定了 GOOGLE_SPREADSHEET_ID 與有效憑證，使用 Google Sheets
- 否則自動降級為 Local JSON 檔案儲存
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from config.settings import settings
from core.db.base import DatabaseAdapter
from core.db.json_db import LocalJsonAdapter
from core.db.sheets_db import GoogleSheetsAdapter
from loguru import logger

_ADAPTER_INSTANCE: Optional[DatabaseAdapter] = None


def get_db_adapter(force_local: bool = False) -> DatabaseAdapter:
    """取得全域資料庫適配器單例"""
    global _ADAPTER_INSTANCE
    if _ADAPTER_INSTANCE is not None and not force_local:
        return _ADAPTER_INSTANCE

    if not force_local and settings.google_spreadsheet_id:
        cred_path = Path(settings.google_application_credentials)
        if cred_path.exists():
            adapter = GoogleSheetsAdapter(
                spreadsheet_id=settings.google_spreadsheet_id,
                credentials_path=str(cred_path),
            )
            if adapter.is_connected():
                logger.info("已啟用 Google Sheets 資料庫適配器")
                _ADAPTER_INSTANCE = adapter
                return adapter

    logger.debug("啟用本機 Local JSON 資料庫適配器")
    _ADAPTER_INSTANCE = LocalJsonAdapter()
    return _ADAPTER_INSTANCE
