"""
automation/actions.py
原子操作模組
- leave_group: 退出單一群組
- invite_bot: 邀請 Bot 入群（3天緩衝公示模式）
- kick_member: 踢除成員（解散模式）
- bulk_leave / bulk_dissolve / bulk_invite_bot: 批次操作
每個操作都整合 RateLimiter 防限流與白名單保護
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Optional

from loguru import logger

from .line_controller import GroupInfo, LINEController
from config.settings import settings
from core.rate_limiter import RateLimiter
from core.whitelist import WhitelistManager

# 嘗試載入 pywinauto
try:
    from pywinauto.keyboard import send_keys
    _PYWINAUTO_AVAILABLE = True
except ImportError:
    _PYWINAUTO_AVAILABLE = False


class ActionResult(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    SKIPPED_WHITELIST = "SKIPPED_WHITELIST"
    SKIPPED_NOT_ADMIN = "SKIPPED_NOT_ADMIN"
    ABORTED = "ABORTED"


@dataclass
class ActionLog:
    """單次動作執行記錄"""
    group_name: str
    action: str
    result: ActionResult
    message: str = ""
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            from datetime import datetime, timezone
            self.timestamp = datetime.now(timezone.utc).isoformat()


class ActionExecutor:
    """
    原子操作執行器
    """

    def __init__(
        self,
        controller: LINEController,
        rate_limiter: RateLimiter,
        whitelist: Optional[WhitelistManager] = None,
    ):
        self._ctrl = controller
        self._limiter = rate_limiter
        self._whitelist = whitelist
        self._logs: list[ActionLog] = []

    # ──────────────────────────────────────────────
    # 批次操作
    # ──────────────────────────────────────────────

    def bulk_leave(
        self,
        groups: list[GroupInfo],
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
        stop_check: Optional[Callable[[], bool]] = None,
    ) -> list[ActionLog]:
        """批次退群"""
        total = len(groups)
        self._logs = []

        for idx, group in enumerate(groups):
            if stop_check and stop_check():
                log = ActionLog(group.name, "LEAVE", ActionResult.ABORTED, "緊急停止中斷")
                self._logs.append(log)
                logger.warning(f"緊急停止：{group.name}")
                break

            if progress_callback:
                progress_callback(idx, total, group.name)

            log = self._leave_single(group)
            self._logs.append(log)

            if idx < total - 1:
                if not self._limiter.wait():
                    break

        if progress_callback:
            progress_callback(total, total, "完成")

        return self._logs

    def bulk_dissolve(
        self,
        groups: list[GroupInfo],
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
        stop_check: Optional[Callable[[], bool]] = None,
    ) -> list[ActionLog]:
        """批次解散（踢除所有成員後退出，若無權限則降級為僅退出）"""
        total = len(groups)
        self._logs = []

        for idx, group in enumerate(groups):
            if stop_check and stop_check():
                self._logs.append(ActionLog(group.name, "DISSOLVE", ActionResult.ABORTED, "緊急停止"))
                break

            if progress_callback:
                progress_callback(idx, total, group.name)

            log = self._dissolve_single(group)
            self._logs.append(log)

            if idx < total - 1:
                if not self._limiter.wait():
                    break

        if progress_callback:
            progress_callback(total, total, "完成")

        return self._logs

    def bulk_invite_bot(
        self,
        groups: list[GroupInfo],
        bot_id: str = "",
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
        stop_check: Optional[Callable[[], bool]] = None,
    ) -> list[ActionLog]:
        """批次邀請 LINE 機器人入群（3 天緩衝公示流程）"""
        target_bot_id = bot_id or settings.line_bot_basic_id
        total = len(groups)
        self._logs = []

        for idx, group in enumerate(groups):
            if stop_check and stop_check():
                self._logs.append(ActionLog(group.name, "INVITE_BOT", ActionResult.ABORTED, "緊急停止"))
                break

            if progress_callback:
                progress_callback(idx, total, group.name)

            log = self._invite_bot_single(group, target_bot_id)
            self._logs.append(log)

            if idx < total - 1:
                if not self._limiter.wait():
                    break

        if progress_callback:
            progress_callback(total, total, "完成")

        return self._logs

    # ──────────────────────────────────────────────
    # 單次原子操作
    # ──────────────────────────────────────────────

    def _leave_single(self, group: GroupInfo) -> ActionLog:
        """退出單一群組"""
        if self._whitelist and self._whitelist.is_protected(group.name):
            logger.warning(f"群組受白名單保護，略過退群：{group.name!r}")
            return ActionLog(group.name, "LEAVE", ActionResult.SKIPPED_WHITELIST, "受白名單保護，已略過")

        logger.info(f"執行退群：{group.name!r}")

        if not _PYWINAUTO_AVAILABLE or not self._ctrl.is_connected():
            logger.debug(f"[模擬] 退出群組：{group.name}")
            time.sleep(0.2)
            return ActionLog(group.name, "LEAVE", ActionResult.SUCCESS, "[模擬] 退出成功")

        try:
            main_win = self._ctrl._main_window
            ui_map = self._ctrl._ui_map
            timing = ui_map.get("timing", {})
            click_delay = timing.get("after_click_delay_sec", 0.8)

            # 1. 點擊群組開啟聊天室
            if group.raw_handle:
                group.raw_handle.click_input()
            time.sleep(click_delay)

            # 2. 點擊選單按鈕
            menu_config = ui_map.get("chat_header_menu_button", {})
            menu_btn = self._find_element(main_win, menu_config)
            if not menu_btn:
                # 嘗試常見名稱
                menu_btn = self._find_element_by_names(main_win, ["選單", "Menu", "More options", "群組選單"])
            if menu_btn:
                menu_btn.click_input()
                time.sleep(click_delay)

            # 3. 點擊「退出群組」
            leave_config = ui_map.get("leave_group_menu_item", {})
            leave_names = leave_config.get("name_options", ["退出群組", "Leave Group", "Leave group"])
            leave_item = self._find_element_by_names(main_win, leave_names)
            if not leave_item:
                return ActionLog(group.name, "LEAVE", ActionResult.FAILED, "找不到「退出群組」選項")
            leave_item.click_input()
            time.sleep(click_delay)

            # 4. 點擊確認按鈕
            confirm_config = ui_map.get("leave_group_confirm_button", {})
            confirm_names = confirm_config.get("name_options", ["確定", "OK", "Leave", "退出"])
            confirm_btn = self._find_element_by_names(main_win, confirm_names)
            if confirm_btn:
                confirm_btn.click_input()
                time.sleep(click_delay)

            logger.success(f"退出群組成功：{group.name!r}")
            return ActionLog(group.name, "LEAVE", ActionResult.SUCCESS, "退出成功")

        except Exception as exc:
            logger.error(f"退群時發生例外：{group.name!r} - {exc}")
            return ActionLog(group.name, "LEAVE", ActionResult.FAILED, str(exc))

    def _dissolve_single(self, group: GroupInfo) -> ActionLog:
        """
        解散單一群組（踢除所有成員後退出）。
        若踢人失敗（無權限），降級為僅退出。
        """
        if self._whitelist and self._whitelist.is_protected(group.name):
            logger.warning(f"群組受白名單保護，略過解散：{group.name!r}")
            return ActionLog(group.name, "DISSOLVE", ActionResult.SKIPPED_WHITELIST, "受白名單保護，已略過")

        logger.info(f"執行解散：{group.name!r}")

        if not _PYWINAUTO_AVAILABLE or not self._ctrl.is_connected():
            logger.debug(f"[模擬] 解散群組：{group.name}")
            time.sleep(0.3)
            return ActionLog(group.name, "DISSOLVE", ActionResult.SUCCESS, "[模擬] 解散成功")

        # 嘗試先踢除所有成員
        kick_success = self._kick_all_members(group)
        if not kick_success:
            logger.warning(f"無法踢人（非管理者或群組權限受限），降級為僅退出：{group.name!r}")
            leave_log = self._leave_single(group)
            leave_log.action = "DISSOLVE_LEAVE_ONLY"
            leave_log.message = "無踢人權限，僅自己退出"
            leave_log.result = ActionResult.SKIPPED_NOT_ADMIN
            return leave_log

        # 踢人成功後自己退出
        return self._leave_single(group)

    def _invite_bot_single(self, group: GroupInfo, bot_id: str) -> ActionLog:
        """自動邀請 LINE 機器人入群"""
        if self._whitelist and self._whitelist.is_protected(group.name):
            return ActionLog(group.name, "INVITE_BOT", ActionResult.SKIPPED_WHITELIST, "受白名單保護，已略過")

        logger.info(f"執行邀請 Bot ({bot_id}) 入群：{group.name!r}")

        if not _PYWINAUTO_AVAILABLE or not self._ctrl.is_connected() or not bot_id:
            logger.debug(f"[模擬] 邀請 Bot ({bot_id}) 入群：{group.name}")
            time.sleep(0.3)
            return ActionLog(group.name, "INVITE_BOT", ActionResult.SUCCESS, f"[模擬] 已成功發送邀請至 {bot_id}")

        try:
            main_win = self._ctrl._main_window
            ui_map = self._ctrl._ui_map
            timing = ui_map.get("timing", {})
            click_delay = timing.get("after_click_delay_sec", 0.8)

            # 1. 點擊進入群組
            if group.raw_handle:
                group.raw_handle.click_input()
            time.sleep(click_delay)

            # 2. 尋找「邀請」按鈕
            invite_config = ui_map.get("invite_button", {})
            invite_btn = self._find_element_by_names(main_win, invite_config.get("name_options", ["邀請", "Invite", "+"]))
            if not invite_btn:
                # 嘗試從選單尋找邀請
                menu_btn = self._find_element_by_names(main_win, ["選單", "Menu", "More options"])
                if menu_btn:
                    menu_btn.click_input()
                    time.sleep(click_delay)
                    invite_btn = self._find_element_by_names(main_win, ["邀請", "Invite"])

            if not invite_btn:
                return ActionLog(group.name, "INVITE_BOT", ActionResult.FAILED, "找不到邀請按鈕")

            invite_btn.click_input()
            time.sleep(click_delay)

            # 3. 搜尋 Bot Basic ID
            search_box = self._find_element(main_win, ui_map.get("search_box", {}))
            if search_box:
                search_box.click_input()
                send_keys(f"^a{bot_id}{{ENTER}}")
                time.sleep(1.0)

            # 4. 勾選並確認邀請
            confirm_btn = self._find_element_by_names(main_win, ["邀請", "確定", "OK", "Invite"])
            if confirm_btn:
                confirm_btn.click_input()
                time.sleep(click_delay)

            logger.success(f"已成功向群組 {group.name} 邀請 Bot ({bot_id})")
            return ActionLog(group.name, "INVITE_BOT", ActionResult.SUCCESS, f"已發送 Bot ({bot_id}) 邀請")

        except Exception as exc:
            logger.error(f"邀請 Bot 時發生例外：{exc}")
            return ActionLog(group.name, "INVITE_BOT", ActionResult.FAILED, str(exc))

    def _kick_all_members(self, group: GroupInfo) -> bool:
        """
        嘗試開啟成員名單並逐一踢除成員
        回傳是否全部踢除成功
        """
        if not _PYWINAUTO_AVAILABLE or not self._ctrl.is_connected():
            return True

        try:
            main_win = self._ctrl._main_window
            ui_map = self._ctrl._ui_map
            timing = ui_map.get("timing", {})
            click_delay = timing.get("after_click_delay_sec", 0.8)

            # 1. 進入群組
            if group.raw_handle:
                group.raw_handle.click_input()
            time.sleep(click_delay)

            # 2. 尋找成員按鈕或成員清單
            member_btn = self._find_element_by_names(main_win, ["成員", "Members", "成員清單"])
            if not member_btn:
                # 嘗試透過標頭選單
                menu_btn = self._find_element_by_names(main_win, ["選單", "Menu"])
                if menu_btn:
                    menu_btn.click_input()
                    time.sleep(click_delay)
                    member_btn = self._find_element_by_names(main_win, ["成員", "Members"])

            if not member_btn:
                logger.debug("找不到成員清單按鈕")
                return False

            member_btn.click_input()
            time.sleep(click_delay)

            # 3. 搜尋可踢除的成員按鈕 (例如「移除」、「移出群組」)
            kick_items = main_win.descendants(control_type="Button", title_re=".*(移除|Remove|踢除).*")
            if not kick_items:
                logger.debug("未找到任何成員移除按鈕，可能無管理員權限")
                return False

            for item in kick_items:
                try:
                    item.click_input()
                    time.sleep(0.5)
                    # 處理確認對話框
                    confirm_btn = self._find_element_by_names(main_win, ["確定", "OK", "移除", "Remove"])
                    if confirm_btn:
                        confirm_btn.click_input()
                        time.sleep(0.5)
                except Exception:
                    continue

            return True
        except Exception as exc:
            logger.debug(f"批次踢人流程異常：{exc}")
            return False

    # ──────────────────────────────────────────────
    # 工具：UI 元件搜尋
    # ──────────────────────────────────────────────

    def _find_element(self, parent: object, config: dict) -> Optional[object]:
        """根據設定尋找 UI 元件"""
        try:
            control_type = config.get("control_type", "Button")
            name_contains = config.get("name_contains", "")
            if name_contains:
                return parent.child_window(control_type=control_type, title_re=f".*{name_contains}.*")
        except Exception as exc:
            logger.debug(f"元件搜尋失敗：{exc}")
        return None

    def _find_element_by_names(self, parent: object, names: list[str]) -> Optional[object]:
        """嘗試多個名稱選項，回傳第一個找到的元件"""
        for name in names:
            try:
                elem = parent.child_window(title=name)
                if elem.exists():
                    return elem
            except Exception:
                continue
        return None

    # ──────────────────────────────────────────────
    # 日誌存取
    # ──────────────────────────────────────────────

    @property
    def logs(self) -> list[ActionLog]:
        return list(self._logs)

    def export_csv(self, path: str) -> None:
        """匯出操作日誌為 CSV"""
        export_report(self._logs, path)

    def export_report(self, path: str) -> None:
        """匯出操作日誌為 CSV 或 TXT 報告"""
        export_report(self._logs, path)


def export_report(logs: list[ActionLog], path: str) -> None:
    """儲存執行日誌至 CSV 或 TXT 報告 (FR-4.2)"""
    import csv
    from datetime import datetime
    from pathlib import Path

    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if str(path).lower().endswith(".txt"):
        total = len(logs)
        success_count = sum(1 for l in logs if l.result == ActionResult.SUCCESS)
        skipped_count = sum(1 for l in logs if l.result == ActionResult.SKIPPED_WHITELIST)
        not_admin_count = sum(1 for l in logs if l.result == ActionResult.SKIPPED_NOT_ADMIN)
        failed_count = total - success_count - skipped_count - not_admin_count

        lines = [
            "=" * 60,
            "           LINE 批次退群與清理工具 - 執行報告",
            "=" * 60,
            f"產生時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"總處理群組數: {total}",
            f"  • 成功退出/解散: {success_count}",
            f"  • 白名單安全保護略過: {skipped_count}",
            f"  • 無權限僅自己退出: {not_admin_count}",
            f"  • 失敗或異常: {failed_count}",
            "-" * 60,
            "【明細紀錄】",
        ]
        for idx, l in enumerate(logs, 1):
            ts = l.timestamp[:19] if l.timestamp else "-"
            lines.append(f"[{idx:02d}] {ts} | {l.group_name} | {l.action} | {l.result.value} | {l.message}")
        lines.append("=" * 60)
        p.write_text("\n".join(lines), encoding="utf-8")
    else:
        with open(p, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(["時間", "群組名稱", "動作", "結果", "訊息"])
            for l in logs:
                writer.writerow([l.timestamp, l.group_name, l.action, l.result.value, l.message])
    logger.info(f"執行報告已匯出至：{p}")

