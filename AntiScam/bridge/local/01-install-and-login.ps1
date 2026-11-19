# AntiScam: install locally and open LINE.js QR login on this PC only.
# Usage: powershell -ExecutionPolicy Bypass -File .\AntiScam\bridge\local\01-install-and-login.ps1
$ErrorActionPreference = 'Stop'
$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$Upstream = Join-Path $Root 'bridge\.runtime\anti-scam-helper'
$Revision = '9b59bfaea4579e45c4ba862ae7db8d9327a8b3a7'
function Check-Code { if ($LASTEXITCODE -ne 0) { throw "External command failed: $LASTEXITCODE" } }
$NodeVersion = (& node.exe --version)
Check-Code
if ($NodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw 'Node.js 22+ is required. Install it first.' }
& git.exe --version | Out-Null
Check-Code
if (-not (Test-Path (Join-Path $Upstream 'package.json'))) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Upstream) | Out-Null
  & git.exe clone --no-checkout 'https://github.com/mars-tw/anti-scam-helper.git' $Upstream
  Check-Code
  & git.exe -C $Upstream checkout --detach $Revision
  Check-Code
}
$ActualRevision = (& git.exe -C $Upstream rev-parse HEAD).Trim()
Check-Code
if ($ActualRevision -ne $Revision) { throw 'LINE.js source differs from pinned revision. Refusing to replace existing source.' }
Push-Location $Upstream
try {
  & npm.cmd ci --include=dev --no-audit --no-fund
  Check-Code
  & npm.cmd run build
  Check-Code
} finally { Pop-Location }
$Bridge = Join-Path $Root 'bridge'
Push-Location $Bridge
try { & npm.cmd install --no-audit --no-fund; Check-Code }
finally { Pop-Location }
& node.exe (Join-Path $PSScriptRoot 'configure.mjs') init
Check-Code
Write-Host ''
Write-Host 'LINE.js is installed. It will now run on THIS COMPUTER only.'
Write-Host 'Open http://127.0.0.1:3789 in your browser and use QR Login with the DEDICATED TEST LINE ACCOUNT.'
Write-Host 'After login, open your OpenChat and copy its internal m... channel ID from the chat context menu.'
Write-Host 'Press Ctrl+C after login and copying the room ID. Do not publish session.json or .env.'
Push-Location $Upstream
try { & node.exe 'dist/main.js' }
finally { Pop-Location }
