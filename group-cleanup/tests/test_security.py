"""
tests/test_security.py
測試 HMAC-SHA256 安全簽署與 Token 驗證
"""
from server.security import generate_cancel_token, verify_cancel_token


def test_generate_and_verify_token():
    task_id = "tsk_test_12345"
    token = generate_cancel_token(task_id, secret_key="test_secret_key")
    assert token is not None
    assert len(token) == 64  # SHA256 hex string

    # 驗證成功
    assert verify_cancel_token(task_id, token, secret_key="test_secret_key") is True

    # 竄改 task_id 應驗證失敗
    assert verify_cancel_token("tsk_tampered", token, secret_key="test_secret_key") is False

    # 竄改 token 應驗證失敗
    tampered_token = token[:-4] + "0000"
    assert verify_cancel_token(task_id, tampered_token, secret_key="test_secret_key") is False

    # 錯誤的密鑰應驗證失敗
    assert verify_cancel_token(task_id, token, secret_key="wrong_secret_key") is False
