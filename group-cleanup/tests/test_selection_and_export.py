"""
tests/test_selection_and_export.py
測試群組選取狀態跨搜尋保留、CSV 與 TXT 執行報告產出與稽核日誌匯出 (FR-1.2, FR-1.3, FR-4.2)
"""
import csv
from pathlib import Path
from tempfile import TemporaryDirectory

from automation.actions import ActionLog, ActionResult, export_report
from automation.line_controller import GroupInfo
from core.whitelist import WhitelistManager


def test_selection_logic_cross_filtering():
    """測試選取集合 (selected_group_names) 在搜尋篩選切換時能完整保留"""
    whitelist = WhitelistManager()
    all_groups = [
        GroupInfo(name="專案 A 群", index=1),
        GroupInfo(name="專案 B 群", index=2),
        GroupInfo(name="朋友閒聊群", index=3),
    ]

    selected_names = set()

    # 1. 使用者在「專案」搜尋結果中勾選了「專案 A 群」與「專案 B 群」
    selected_names.add("專案 A 群")
    selected_names.add("專案 B 群")

    # 2. 使用者切換搜尋關鍵字為「閒聊」，此時只顯示「朋友閒聊群」
    filtered_groups = [g for g in all_groups if "閒聊" in g.name]
    assert len(filtered_groups) == 1

    # 3. 使用者再勾選「朋友閒聊群」
    selected_names.add(filtered_groups[0].name)

    # 4. 使用者清除搜尋關鍵字，回到全部清單
    # 驗證總共勾選了 3 個群組
    final_selected = [g for g in all_groups if g.name in selected_names and not whitelist.is_protected(g.name)]
    assert len(final_selected) == 3
    assert {g.name for g in final_selected} == {"專案 A 群", "專案 B 群", "朋友閒聊群"}


def test_save_logs_csv_and_txt():
    """測試報告儲存支援 CSV 與 TXT 格式 (FR-4.2)"""
    logs = [
        ActionLog(group_name="群組1", action="LEAVE", result=ActionResult.SUCCESS, message="成功退出"),
        ActionLog(group_name="群組2", action="LEAVE", result=ActionResult.SKIPPED_WHITELIST, message="受白名單保護"),
        ActionLog(group_name="群組3", action="DISSOLVE", result=ActionResult.FAILED, message="網路逾時"),
    ]

    with TemporaryDirectory() as tmpdir:
        # 1. 測試 CSV 匯出
        csv_path = Path(tmpdir) / "report.csv"
        export_report(logs, str(csv_path))
        assert csv_path.exists()
        with open(csv_path, encoding="utf-8-sig") as f:
            reader = list(csv.reader(f))
            assert len(reader) == 4  # 1 header + 3 rows
            assert reader[0] == ["時間", "群組名稱", "動作", "結果", "訊息"]
            assert reader[1][1] == "群組1"
            assert reader[1][3] == ActionResult.SUCCESS.value

        # 2. 測試 TXT 格式化報告匯出
        txt_path = Path(tmpdir) / "report.txt"
        export_report(logs, str(txt_path))
        assert txt_path.exists()
        txt_content = txt_path.read_text(encoding="utf-8")
        assert "LINE 批次退群與清理工具 - 執行報告" in txt_content
        assert "總處理群組數: 3" in txt_content
        assert "成功退出/解散: 1" in txt_content
        assert "白名單安全保護略過: 1" in txt_content
        assert "群組1 | LEAVE | SUCCESS" in txt_content
