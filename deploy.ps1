# ========================================================
# LINE 專案 - 資料夾與 GIT 倉庫同步工具 (鎖定 main 分支)
# ========================================================

# 強制設定主控台為 UTF-8 編碼，確保中文字元輸入與顯示無誤
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8

# 設定視窗標題
try {
    $Host.UI.RawUI.WindowTitle = "LINE 專案 - 資料夾與 GIT 倉庫同步工具 (鎖定 main 分支)"
} catch {}

# 移動到腳本所在目錄
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($ScriptDir) {
    Set-Location -LiteralPath $ScriptDir
}

# 固定鎖定目標分支為 main
$TARGET_BRANCH = "main"

# 配置 Git 編碼與路徑顯示，避免中文檔名顯示為八進位轉義字元（如 \344\270...）
git config core.quotepath false
git config i18n.commitEncoding utf-8
git config i18n.logOutputEncoding utf-8

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  LINE 專案 - 資料夾與 GIT 倉庫同步工具 [鎖定: $TARGET_BRANCH]" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 檢查 Git 命令是否可用
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[錯誤] 找不到 Git 命令！" -ForegroundColor Red
    Write-Host "請先確認電腦已安裝 Git，並已將其加入系統 PATH 環境變數。" -ForegroundColor Red
    Write-Host ""
    Read-Host "按 Enter 鍵結束"
    exit 1
}

# 2. 檢查當前目錄是否為 Git 倉庫
$insideWorkTree = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne "true") {
    Write-Host "[錯誤] 當前目錄不是有效的 Git 倉庫！" -ForegroundColor Red
    Write-Host "請將本腳本放置於專案根目錄中執行。" -ForegroundColor Red
    Write-Host ""
    Read-Host "按 Enter 鍵結束"
    exit 1
}

# 3. 確保並強制鎖定在 main 分支
$currentBranch = (git branch --show-current 2>$null)
if ($currentBranch) {
    $currentBranch = $currentBranch.Trim()
}

if ($currentBranch -ne $TARGET_BRANCH) {
    Write-Host "[提示] 偵測到當前分支為 [$currentBranch]" -ForegroundColor Yellow
    Write-Host "本專案已強制鎖定使用 [$TARGET_BRANCH]，正在為您自動切換..." -ForegroundColor Yellow
    git checkout $TARGET_BRANCH
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[錯誤] 無法切換至 $TARGET_BRANCH 分支！" -ForegroundColor Red
        Write-Host "可能原因：本地存在衝突變更或未提交之檔案阻礙切換。" -ForegroundColor Red
        Write-Host "請先排除衝突或手動提交後再重新執行。" -ForegroundColor Red
        Read-Host "按 Enter 鍵結束"
        exit 1
    }
    Write-Host "[成功] 已切換回 $TARGET_BRANCH 分支。" -ForegroundColor Green
} else {
    Write-Host "[鎖定分支] $TARGET_BRANCH（當前分支正確）" -ForegroundColor Green
}

Write-Host ""

# 4. 檢查遠端倉庫連線並獲取最新狀態
Write-Host "[1/4] 正在檢查遠端 Git 倉庫狀態 (origin/$TARGET_BRANCH)..." -ForegroundColor Cyan
git fetch origin $TARGET_BRANCH 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[警告] 無法連線至遠端倉庫（請檢查網路連線或 GitHub 存取權限）。" -ForegroundColor Yellow
    Write-Host "將僅比對本地資料狀態..." -ForegroundColor Yellow
    Write-Host ""
}

# 5. 檢查本地是否有未提交的修改
$porcelainOutput = git status --porcelain 2>$null
$hasLocalChanges = $false
if ($porcelainOutput) {
    $lines = $porcelainOutput -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 }
    if ($lines.Count -gt 0) {
        $hasLocalChanges = $true
    }
}

# 6. 比對本地與遠端 Commit 差異
$localAhead = 0
$remoteAhead = 0

$localAheadOut = git rev-list --count "origin/$TARGET_BRANCH..$TARGET_BRANCH" 2>$null
if ($LASTEXITCODE -eq 0 -and $localAheadOut) {
    $localAhead = [int]$localAheadOut.Trim()
}

$remoteAheadOut = git rev-list --count "$TARGET_BRANCH..origin/$TARGET_BRANCH" 2>$null
if ($LASTEXITCODE -eq 0 -and $remoteAheadOut) {
    $remoteAhead = [int]$remoteAheadOut.Trim()
}

Write-Host "[2/4] 比對檔案與版本狀態：" -ForegroundColor Cyan
if ($hasLocalChanges) {
    Write-Host "  - 本地資料夾：有新增、修改或刪除的檔案" -ForegroundColor Yellow
} else {
    Write-Host "  - 本地資料夾：檔案無未提交之變更" -ForegroundColor Green
}
Write-Host "  - 本地領先遠端 Commit 數：$localAhead"
Write-Host "  - 遠端領先本地 Commit 數：$remoteAhead"
Write-Host ""

# 7. 判斷同步方向
Write-Host "[3/4] 判斷同步方向..." -ForegroundColor Cyan

# 狀態一：完全一致，無需同步
if (-not $hasLocalChanges -and $localAhead -eq 0 -and $remoteAhead -eq 0) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "[已是最新] 本地資料夾與 GIT 倉庫內容完全一致，無需同步！" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "[4/4] 同步作業已順利結束。" -ForegroundColor Green
    Write-Host ""
    Read-Host "按 Enter 鍵結束作業..."
    exit 0
}

# 狀態二：遠端倉庫較新（本地無變更，遠端有新版本）
if (-not $hasLocalChanges -and $localAhead -eq 0 -and $remoteAhead -gt 0) {
    Write-Host ""
    Write-Host "[同步方向] 遠端倉庫較新（領先 $remoteAhead 個版本）" -ForegroundColor Cyan
    Write-Host "正在從遠端倉庫同步最新資料至本地資料夾..." -ForegroundColor Cyan
    Write-Host ""
    git pull origin $TARGET_BRANCH
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[失敗] 下載遠端更新失敗，請檢查網路或衝突狀態。" -ForegroundColor Red
        Read-Host "按 Enter 鍵結束"
        exit 1
    }
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "[同步完成] 已成功將遠端倉庫的最新內容更新至本地資料夾！" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "[4/4] 同步作業已順利結束。" -ForegroundColor Green
    Write-Host ""
    Read-Host "按 Enter 鍵結束作業..."
    exit 0
}

# 狀態三：本地資料夾較新（遠端無新版本）
if ($remoteAhead -eq 0) {
    Write-Host ""
    Write-Host "[同步方向] 本地資料夾較新" -ForegroundColor Cyan
    Write-Host "正在將本地最新資料同步上傳至遠端 GIT 倉庫..." -ForegroundColor Cyan
    Write-Host ""

    if ($hasLocalChanges) {
        Write-Host "--- 本地變更清單 ---" -ForegroundColor Yellow
        git status -s
        Write-Host "---------------------" -ForegroundColor Yellow

        $timeStamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        $defaultMsg = "Auto sync: $timeStamp"
        $userMsg = Read-Host "請輸入更新說明（直接按 Enter 使用自動時間戳記）"
        $commitMsg = if ([string]::IsNullOrWhiteSpace($userMsg)) { $defaultMsg } else { $userMsg.Trim() }

        git add -A
        git commit -m $commitMsg
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[失敗] 本地提交失敗！" -ForegroundColor Red
            Read-Host "按 Enter 鍵結束"
            exit 1
        }
    }

    Write-Host ""
    Write-Host "正在推送到遠端倉庫 origin/$TARGET_BRANCH..." -ForegroundColor Cyan
    git push -u origin $TARGET_BRANCH
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[失敗] 上傳至遠端倉庫失敗！請確認連線或 GitHub 權限。" -ForegroundColor Red
        Read-Host "按 Enter 鍵結束"
        exit 1
    }

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "[同步完成] 已成功將本地資料夾的最新內容同步至遠端倉庫！" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "[4/4] 同步作業已順利結束。" -ForegroundColor Green
    Write-Host ""
    Read-Host "按 Enter 鍵結束作業..."
    exit 0
}

# 狀態四：雙向皆有更新（本地有變更/Commit，遠端亦有新提交）
Write-Host ""
Write-Host "[同步方向] 雙向皆有更新（本地有新檔案/Commit，遠端亦有新提交）" -ForegroundColor Magenta
Write-Host "正在進行安全合併同步..." -ForegroundColor Magenta
Write-Host ""

if ($hasLocalChanges) {
    Write-Host "--- 本地變更清單 ---" -ForegroundColor Yellow
    git status -s
    Write-Host "---------------------" -ForegroundColor Yellow

    $timeStamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $defaultMsg = "Auto sync (雙向合併): $timeStamp"
    $userMsg = Read-Host "請輸入本地更新說明（直接按 Enter 使用自動時間戳記）"
    $commitMsg = if ([string]::IsNullOrWhiteSpace($userMsg)) { $defaultMsg } else { $userMsg.Trim() }

    git add -A
    git commit -m $commitMsg
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[失敗] 本地提交失敗！" -ForegroundColor Red
        Read-Host "按 Enter 鍵結束"
        exit 1
    }
}

Write-Host ""
Write-Host "正在拉取遠端更新並合併..." -ForegroundColor Cyan
git pull --no-rebase origin $TARGET_BRANCH
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "[警告] 合併過程中發生檔案衝突（Conflict）！" -ForegroundColor Red
    Write-Host "請手動打開衝突檔案解決衝突後，再執行提交與推送。" -ForegroundColor Red
    Write-Host "========================================================" -ForegroundColor Red
    Read-Host "按 Enter 鍵結束"
    exit 1
}

Write-Host ""
Write-Host "正在將合併結果推送至遠端倉庫..." -ForegroundColor Cyan
git push -u origin $TARGET_BRANCH
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[失敗] 推送合併版本至遠端倉庫失敗！" -ForegroundColor Red
    Read-Host "按 Enter 鍵結束"
    exit 1
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "[同步完成] 雙向同步成功！本地資料夾與遠端倉庫皆已更新至最新狀態！" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[4/4] 同步作業已順利結束。" -ForegroundColor Green
Write-Host ""
Read-Host "按 Enter 鍵結束作業..."
exit 0
