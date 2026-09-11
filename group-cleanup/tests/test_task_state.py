"""
tests/test_task_state.py
測試 72 小時解散任務狀態機 (Task State Machine)
"""
from core.task_state import DissolveTask, TaskStatus


def test_valid_transitions():
    task = DissolveTask(group_name="好友同樂會")
    assert task.status == TaskStatus.DRAFT

    # DRAFT -> INVITING_BOT
    assert task.transition_to(TaskStatus.INVITING_BOT) is True
    assert task.status == TaskStatus.INVITING_BOT

    # INVITING_BOT -> NOTICE_ACTIVE
    assert task.transition_to(TaskStatus.NOTICE_ACTIVE) is True
    assert task.status == TaskStatus.NOTICE_ACTIVE

    # NOTICE_ACTIVE -> READY_FOR_DISSOLUTION
    assert task.transition_to(TaskStatus.READY_FOR_DISSOLUTION) is True
    assert task.status == TaskStatus.READY_FOR_DISSOLUTION

    # READY_FOR_DISSOLUTION -> EXECUTING
    assert task.transition_to(TaskStatus.EXECUTING) is True
    assert task.status == TaskStatus.EXECUTING

    # EXECUTING -> COMPLETED
    assert task.transition_to(TaskStatus.COMPLETED) is True
    assert task.status == TaskStatus.COMPLETED
    assert task.is_terminal is True


def test_invalid_transition():
    task = DissolveTask(group_name="無效轉移測試")
    assert task.status == TaskStatus.DRAFT

    # DRAFT 不能直接轉為 COMPLETED
    assert task.transition_to(TaskStatus.COMPLETED) is False
    assert task.status == TaskStatus.DRAFT


def test_revocation_transition():
    task = DissolveTask(group_name="異議保留測試")
    task.transition_to(TaskStatus.INVITING_BOT)
    task.transition_to(TaskStatus.NOTICE_ACTIVE)

    # NOTICE_ACTIVE -> CANCELLED_BY_MEMBER
    assert task.transition_to(TaskStatus.CANCELLED_BY_MEMBER) is True
    assert task.status == TaskStatus.CANCELLED_BY_MEMBER
    assert task.is_terminal is True
