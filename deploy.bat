@echo off
title LINE 專案 - 資料夾與 GIT 倉庫同步工具 (鎖定 main 分支)
chcp 65001 >nul
cd /d "%~dp0"

:: 固定鎖定目標分支為 main
set "TARGET_BRANCH=main"

echo ========================================================
echo   LINE 專案 - 資料夾與 GIT 倉庫同步工具 [鎖定: %TARGET_BRANCH%]
echo ========================================================
echo.

:: 1. 檢查 Git 命令是否可用
where git >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 Git 命令！
    echo 請先確認電腦已安裝 Git，並已將其加入系統 PATH 環境變數。
    echo.
    goto :EXIT_ERROR
)

:: 2. 檢查當前目錄是否為 Git 倉庫
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 當前目錄不是有效的 Git 倉庫！
    echo 請將本腳本放置於專案根目錄中執行。
    echo.
    goto :EXIT_ERROR
)

:: 3. 確保並強制鎖定在 main 分支
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%i"
if /i not "%CURRENT_BRANCH%"=="%TARGET_BRANCH%" (
    echo [提示] 偵測到當前分支為 [%CURRENT_BRANCH%]
    echo 本專案已鎖定使用 [%TARGET_BRANCH%]，正在為您自動切換...
    git checkout %TARGET_BRANCH%
    if errorlevel 1 (
        echo.
        echo [錯誤] 無法切換至 %TARGET_BRANCH% 分支！
        echo 可能原因：本地存在衝突變更或未提交之檔案阻礙切換。
        echo 請先排除衝突或手動提交後再重新執行。
        goto :EXIT_ERROR
    )
    echo [成功] 已切換回 %TARGET_BRANCH% 分支。
) else (
    echo [鎖定分支] %TARGET_BRANCH% (當前分支正確)
)
echo.

:: 4. 檢查遠端倉庫連線並獲取最新狀態
echo [1/4] 正在檢查遠端 Git 倉庫狀態 (origin/%TARGET_BRANCH%)...
git fetch origin %TARGET_BRANCH% >nul 2>&1
if errorlevel 1 (
    echo [警告] 無法連線至遠端倉庫（請檢查網路連線或 GitHub 存取權限）。
    echo 將僅比對本地資料狀態...
    echo.
)

:: 5. 檢查本地是否有未提交的修改
set HAS_LOCAL_CHANGES=0
for /f "tokens=*" %%i in ('git status --porcelain 2^>nul') do (
    set HAS_LOCAL_CHANGES=1
)

:: 6. 比對本地與遠端 Commit 差異
set LOCAL_AHEAD=0
set REMOTE_AHEAD=0

for /f %%i in ('git rev-list --count origin/%TARGET_BRANCH%..%TARGET_BRANCH% 2^>nul') do set LOCAL_AHEAD=%%i
for /f %%i in ('git rev-list --count %TARGET_BRANCH%..origin/%TARGET_BRANCH% 2^>nul') do set REMOTE_AHEAD=%%i

echo [2/4] 比對檔案與版本狀態：
if "%HAS_LOCAL_CHANGES%"=="1" (
    echo  - 本地資料夾：有新增、修改或刪除的檔案
) else (
    echo  - 本地資料夾：檔案無未提交之變更
)
echo  - 本地領先遠端 Commit 數：%LOCAL_AHEAD%
echo  - 遠端領先本地 Commit 數：%REMOTE_AHEAD%
echo.

:: 7. 判斷同步方向
echo [3/4] 判斷同步方向...

:: 狀態一：完全一致，無需同步
if "%HAS_LOCAL_CHANGES%"=="0" if "%LOCAL_AHEAD%"=="0" if "%REMOTE_AHEAD%"=="0" goto :ALREADY_SYNCED

:: 狀態二：遠端倉庫較新（本地無變更，遠端有新版本）
if "%HAS_LOCAL_CHANGES%"=="0" if "%LOCAL_AHEAD%"=="0" if %REMOTE_AHEAD% gtr 0 goto :SYNC_REMOTE_TO_LOCAL

:: 狀態三：本地資料夾較新（本地有變更或未推送的 Commit，遠端無新版本）
if %REMOTE_AHEAD% equ 0 goto :SYNC_LOCAL_TO_REMOTE

:: 狀態四：雙向皆有更新（本地有變更/Commit，遠端亦有新提交）
goto :SYNC_BOTH


:ALREADY_SYNCED
echo.
echo ========================================================
echo [已是最新] 本地資料夾與 GIT 倉庫內容完全一致，無需同步！
echo ========================================================
goto :SUCCESS_END


:SYNC_REMOTE_TO_LOCAL
echo.
echo [同步方向] 遠端倉庫較新（領先 %REMOTE_AHEAD% 個版本）
echo 正在從遠端倉庫同步最新資料至本地資料夾...
echo.
git pull origin %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo [失敗] 下載遠端更新失敗，請檢查網路或衝突狀態。
    goto :EXIT_ERROR
)
echo.
echo ========================================================
echo [同步完成] 已成功將遠端倉庫的最新內容更新至本地資料夾！
echo ========================================================
goto :SUCCESS_END


:SYNC_LOCAL_TO_REMOTE
echo.
echo [同步方向] 本地資料夾較新
echo 正在將本地最新資料同步上傳至遠端 GIT 倉庫...
echo.
if "%HAS_LOCAL_CHANGES%"=="0" goto :PUSH_COMMITS

echo --- 本地變更清單 ---
git status -s
echo ---------------------
set "COMMIT_MSG=Auto sync: %DATE% %TIME%"
set "USER_MSG="
set /p "USER_MSG=請輸入更新說明（直接按 Enter 使用自動時間戳記）："
if defined USER_MSG set "COMMIT_MSG=%USER_MSG%"
git add -A
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [失敗] 本地提交失敗！
    goto :EXIT_ERROR
)

:PUSH_COMMITS
echo.
echo 正在推送到遠端倉庫 origin/%TARGET_BRANCH%...
git push -u origin %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo [失敗] 上傳至遠端倉庫失敗！請確認連線或 GitHub 權限。
    goto :EXIT_ERROR
)
echo.
echo ========================================================
echo [同步完成] 已成功將本地資料夾的最新內容同步至遠端倉庫！
echo ========================================================
goto :SUCCESS_END


:SYNC_BOTH
echo.
echo [同步方向] 雙向皆有更新（本地有新檔案，遠端亦有新提交）
echo 正在進行安全合併同步...
echo.
if "%HAS_LOCAL_CHANGES%"=="0" goto :MERGE_PULL

echo --- 本地變更清單 ---
git status -s
echo ---------------------
set "COMMIT_MSG=Auto sync (雙向合併): %DATE% %TIME%"
set "USER_MSG="
set /p "USER_MSG=請輸入本地更新說明（直接按 Enter 使用自動時間戳記）："
if defined USER_MSG set "COMMIT_MSG=%USER_MSG%"
git add -A
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [失敗] 本地提交失敗！
    goto :EXIT_ERROR
)

:MERGE_PULL
echo.
echo 正在拉取遠端更新並合併...
git pull --no-rebase origin %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo ========================================================
    echo [警告] 合併過程中發生檔案衝突（Conflict）！
    echo 請手動打開衝突檔案解決衝突後，再執行提交與推送。
    echo ========================================================
    goto :EXIT_ERROR
)

echo.
echo 正在將合併結果推送至遠端倉庫...
git push -u origin %TARGET_BRANCH%
if errorlevel 1 (
    echo.
    echo [失敗] 推送合併版本至遠端倉庫失敗！
    goto :EXIT_ERROR
)
echo.
echo ========================================================
echo [同步完成] 雙向同步成功！本地資料夾與遠端倉庫皆已更新至最新狀態！
echo ========================================================
goto :SUCCESS_END


:SUCCESS_END
echo.
echo [4/4] 同步作業已順利結束。
echo.
pause
exit /b 0

:EXIT_ERROR
echo.
echo 作業未完成或發生錯誤。請查看上方提示訊息。
echo.
pause
exit /b 1