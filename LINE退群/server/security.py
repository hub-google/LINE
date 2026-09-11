"""
server/security.py
HMAC-SHA256 安全簽章與 Token 驗證模組
- 簽署異議終止專屬 Token，防止異議連結遭外部惡意掃描竄改或偽造
- 驗證 Token 合法性
"""
from __future__ import annotations

import hashlib
import hmac
from typing import Tuple

from config.settings import settings
from loguru import logger


def generate_cancel_token(task_id: str, secret_key: str = "") -> str:
    """
    依據 task_id 與伺服器密鑰產生 HMAC-SHA256 簽署 Token
    """
    key = (secret_key or settings.security_secret_key).encode("utf-8")
    message = f"cancel:{task_id}".encode("utf-8")
    token = hmac.new(key, message, hashlib.sha256).hexdigest()
    return token


def verify_cancel_token(task_id: str, token: str, secret_key: str = "") -> bool:
    """
    驗證異議終止 Token 是否合法（常數時間比對防止時序攻擊）
    """
    expected = generate_cancel_token(task_id, secret_key)
    is_valid = hmac.compare_digest(expected, token)
    if not is_valid:
        logger.warning(f"異議 Token 驗證失敗：task_id={task_id}, token={token}")
    return is_valid
