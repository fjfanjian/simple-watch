$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$database = Join-Path $repoRoot ".local\predeploy\state\simplewatch.sqlite3"
if (-not (Test-Path -LiteralPath $database)) { throw "请先运行 test:range 生成测试数据库" }
$backupRoot = & pwsh -File tools/backup/backup-local.ps1 -DatabasePath $database
if ($LASTEXITCODE -ne 0 -or -not $backupRoot) { throw "一致性备份失败" }
& pwsh -File tools/backup/restore-smoke.ps1 -BackupDirectory $backupRoot
if ($LASTEXITCODE -ne 0) { throw "备份恢复演练失败" }
