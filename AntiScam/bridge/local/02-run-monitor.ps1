# AntiScam: five-hour monitor-only pilot on this Windows computer.
# Usage: powershell -ExecutionPolicy Bypass -File .\AntiScam\bridge\local\02-run-monitor.ps1 -ChatId m...
param([Parameter(Mandatory=$true)][string]$ChatId)
$ErrorActionPreference='Stop'
if ($ChatId -notmatch '^m[A-Za-z0-9]{10,64}$') { throw 'Provide the internal OpenChat m... channel ID (NOT an invite URL).' }
$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$Session = Join-Path $Root 'bridge\.runtime\anti-scam-helper\session.json'
if (-not (Test-Path $Session)) { throw 'LINE.js has no local session. Run 01-install-and-login.ps1 first and complete QR login.' }
& node.exe (Join-Path $PSScriptRoot 'configure.mjs') chat $ChatId
if ($LASTEXITCODE -ne 0) { throw 'Local setup failed.' }
& node.exe (Join-Path $PSScriptRoot 'run-local.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Local pilot returned an error. Do not enable destructive actions.' }
