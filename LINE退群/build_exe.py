"""
build_exe.py
LINE 批次退群與群組清理工具 - PyInstaller 執行檔打包腳本
- 支援打包成單一可執行檔 (.exe) 或目錄形式
- 自動收集 CustomTkinter, Jinja2 模板, 靜態資源與依賴套件
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent


def build(onefile: bool = True, windowed: bool = False) -> int:
    """執行 PyInstaller 打包流程"""
    print("=" * 60)
    print("🚀 LINE 批次退群與群組清理工具 - 開始執行 PyInstaller 打包")
    print("=" * 60)

    try:
        import PyInstaller
        print(f"✔ 偵測到 PyInstaller 版本：{PyInstaller.__version__}")
    except ImportError:
        print("❌ 未安裝 PyInstaller，正在嘗試安裝...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # 組合 PyInstaller 參數
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name=LINEGroupManager",
        "--noconfirm",
        "--clean",
    ]

    if onefile:
        cmd.append("--onefile")
    else:
        cmd.append("--onedir")

    # 如果指定純視窗模式（不顯示控制台）
    if windowed:
        cmd.append("--windowed")
    else:
        cmd.append("--console")

    # 收集 CustomTkinter 與相關靜態資源
    cmd.extend([
        "--collect-all=customtkinter",
        "--collect-all=rich",
        "--collect-all=jinja2",
        "--collect-all=uvicorn",
        "--collect-all=fastapi",
        "--collect-all=loguru",
        "--hidden-import=pydantic",
        "--hidden-import=pydantic.deprecated.decorator",
        "--hidden-import=PIL",
        "--hidden-import=PIL._tkinter_finder",
        "--hidden-import=pywinauto",
        "--hidden-import=pyautogui",
        "--hidden-import=win32gui",
        "--hidden-import=win32con",
        "--hidden-import=win32process",
        "--hidden-import=gspread",
        "--hidden-import=google.oauth2.service_account",
        "--hidden-import=linebot.v3",
        "--hidden-import=apscheduler",
        "--hidden-import=httpx",
    ])

    # 加入 templates 資料夾 (若存在)
    templates_dir = _ROOT / "server" / "templates"
    if templates_dir.exists():
        sep = ";" if sys.platform == "win32" else ":"
        cmd.append(f"--add-data={templates_dir}{sep}server/templates")

    # 加入入口點 main.py
    cmd.append(str(_ROOT / "main.py"))

    print(f"執行指令：{' '.join(cmd)}\n")
    ret = subprocess.call(cmd)
    if ret == 0:
        dist_dir = _ROOT / "dist"
        print("\n" + "=" * 60)
        print("🎉 打包完成！")
        print(f"📦 產出目錄：{dist_dir}")
        if onefile:
            print(f"🚀 可執行檔：{dist_dir / 'LINEGroupManager.exe'}")
        print("=" * 60)
    else:
        print(f"\n❌ 打包失敗，結束代碼：{ret}")
    return ret


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LINEGroupManager 打包建置工具")
    parser.add_argument("--onedir", action="store_true", help="打包為資料夾模式（非單一檔案）")
    parser.add_argument("--windowed", "-w", action="store_true", help="無控制台黑視窗模式 (純 GUI)")
    args = parser.parse_args()

    sys.exit(build(onefile=not args.onedir, windowed=args.windowed))
