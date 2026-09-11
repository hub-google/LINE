"""
main.py
LINE 批次退群與群組清理工具 - 程式入口點
- 預設啟動 GUI 圖形視窗 (CustomTkinter)
- 如需啟動雲端中繼 Webhook 伺服器，請傳入 --server 參數
"""
import sys
from pathlib import Path

# 確保專案根目錄在 Python 路徑內
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# Windows UTF-8 輸出支援
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")

from loguru import logger

logger.remove()
logger.add(
    _ROOT / "data" / "logs" / "app_{time:YYYY-MM-DD}.log",
    level="DEBUG",
    rotation="1 day",
    retention="14 days",
    encoding="utf-8",
)


def main() -> None:
    if "--server" in sys.argv or (len(sys.argv) > 1 and sys.argv[1] == "server"):
        import uvicorn
        from config.settings import settings

        logger.info(f"啟動雲端中繼 Webhook 伺服器 (Port: {settings.port})...")
        uvicorn.run("server.app:app", host="0.0.0.0", port=settings.port, reload=False)
    else:
        # 預設啟動 GUI 視窗
        logger.info("啟動 GUI 視窗模式...")
        from gui.app_window import AppWindow

        app = AppWindow()
        app.mainloop()
        logger.info("GUI 程式已正常關閉")


if __name__ == "__main__":
    main()
