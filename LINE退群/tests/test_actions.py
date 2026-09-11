"""
tests/test_actions.py
測試 ActionExecutor 批次操作、白名單安全保護與緊急停止 (FR-2.1, FR-3.1, NFR-4)
"""
from automation.actions import ActionExecutor, ActionResult
from automation.line_controller import GroupInfo, LINEController
from core.rate_limiter import RateLimiter
from core.whitelist import WhitelistManager


def test_action_executor_whitelist_protection():
    ctrl = LINEController()
    limiter = RateLimiter(min_sec=0.01, max_sec=0.02)
    whitelist = WhitelistManager()
    whitelist.add("重要家庭群")

    executor = ActionExecutor(ctrl, limiter, whitelist)

    # 包含受保護群組與普通群組
    groups = [
        GroupInfo(name="重要家庭群", index=0),
        GroupInfo(name="臨時活動群", index=1),
    ]

    # 執行批次退群
    logs = executor.bulk_leave(groups)
    assert len(logs) == 2
    assert logs[0].result == ActionResult.SKIPPED_WHITELIST
    assert logs[1].result == ActionResult.SUCCESS


def test_action_executor_emergency_stop():
    ctrl = LINEController()
    limiter = RateLimiter(min_sec=0.01, max_sec=0.02)
    executor = ActionExecutor(ctrl, limiter)

    groups = [
        GroupInfo(name=f"測試群組_{i}", index=i) for i in range(5)
    ]

    # 模擬在第 2 個群組處理時觸發停止
    def check_stop():
        return len(executor._logs) >= 2

    logs = executor.bulk_leave(groups, stop_check=check_stop)
    assert len(logs) == 3
    assert logs[-1].result == ActionResult.ABORTED
