"""
config/settings.py
讀取 .env 環境變數並提供全域設定物件
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# 自動搜尋專案根目錄的 .env 檔案
_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env", override=False)


class Settings(BaseModel):
    """全域設定（從環境變數讀取，型別安全）"""

    # --- 基礎設定 ---
    environment: str = Field(default="development", alias="ENVIRONMENT")
    port: int = Field(default=8000, alias="PORT")
    app_base_url: str = Field(default="http://localhost:8000", alias="APP_BASE_URL")
    security_secret_key: str = Field(default="change-me-in-production", alias="SECURITY_SECRET_KEY")
    disband_notice_hours: int = Field(default=72, alias="DISBAND_NOTICE_HOURS")

    # --- LINE Bot ---
    line_channel_secret: str = Field(default="", alias="LINE_CHANNEL_SECRET")
    line_channel_access_token: str = Field(default="", alias="LINE_CHANNEL_ACCESS_TOKEN")
    line_bot_basic_id: str = Field(default="", alias="LINE_BOT_BASIC_ID")
    line_liff_id: str = Field(default="", alias="LINE_LIFF_ID")

    # --- Google Sheets ---
    google_spreadsheet_id: str = Field(default="", alias="GOOGLE_SPREADSHEET_ID")
    google_application_credentials: str = Field(default="./credentials.json", alias="GOOGLE_APPLICATION_CREDENTIALS")

    # --- LINE 桌面自動化 ---
    line_desktop_path: str = Field(
        default=r"C:\Users\Username\AppData\Local\LINE\bin\LINE.exe",
        alias="LINE_DESKTOP_PATH",
    )
    min_action_delay: float = Field(default=1.5, alias="MIN_ACTION_DELAY_SECONDS")
    max_action_delay: float = Field(default=3.5, alias="MAX_ACTION_DELAY_SECONDS")

    model_config = {"populate_by_name": True}

    @classmethod
    def load(cls) -> "Settings":
        """從環境變數讀取並建立設定實例"""
        data = {
            "ENVIRONMENT": os.getenv("ENVIRONMENT", "development"),
            "PORT": int(os.getenv("PORT", "8000")),
            "APP_BASE_URL": os.getenv("APP_BASE_URL", "http://localhost:8000"),
            "SECURITY_SECRET_KEY": os.getenv("SECURITY_SECRET_KEY", "change-me-in-production"),
            "DISBAND_NOTICE_HOURS": int(os.getenv("DISBAND_NOTICE_HOURS", "72")),
            "LINE_CHANNEL_SECRET": os.getenv("LINE_CHANNEL_SECRET", ""),
            "LINE_CHANNEL_ACCESS_TOKEN": os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""),
            "LINE_BOT_BASIC_ID": os.getenv("LINE_BOT_BASIC_ID", ""),
            "LINE_LIFF_ID": os.getenv("LINE_LIFF_ID", ""),
            "GOOGLE_SPREADSHEET_ID": os.getenv("GOOGLE_SPREADSHEET_ID", ""),
            "GOOGLE_APPLICATION_CREDENTIALS": os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "./credentials.json"),
            "LINE_DESKTOP_PATH": os.getenv(
                "LINE_DESKTOP_PATH",
                r"C:\Users\Username\AppData\Local\LINE\bin\LINE.exe",
            ),
            "MIN_ACTION_DELAY_SECONDS": float(os.getenv("MIN_ACTION_DELAY_SECONDS", "1.5")),
            "MAX_ACTION_DELAY_SECONDS": float(os.getenv("MAX_ACTION_DELAY_SECONDS", "3.5")),
        }
        return cls(**data)


# 全域單例，直接 import 使用
settings = Settings.load()
