param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sqlite = "C:\platform-tools\sqlite3.exe"
$backupRoot = (Resolve-Path -LiteralPath $BackupDirectory).Path
$manifestPath = Join-Path $backupRoot "manifest.json"
$backupPath = Join-Path $backupRoot "simplewatch.sqlite3"
if (-not (Test-Path -LiteralPath $manifestPath) -or -not (Test-Path -LiteralPath $backupPath)) {
  throw "备份目录缺少数据库或 manifest"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$actualHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $manifest.sha256) { throw "备份 SHA-256 不匹配" }

$restoreRoot = Join-Path $repoRoot ".local\restore-smoke"
if (Test-Path -LiteralPath $restoreRoot) {
  $resolved = [IO.Path]::GetFullPath($restoreRoot)
  $allowed = [IO.Path]::GetFullPath((Join-Path $repoRoot ".local"))
  if (-not $resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) {
    throw "恢复测试目录越界"
  }
  Remove-Item -LiteralPath $restoreRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $restoreRoot | Out-Null
$restoredPath = Join-Path $restoreRoot "simplewatch.sqlite3"
Copy-Item -LiteralPath $backupPath -Destination $restoredPath
$integrity = @(& $sqlite $restoredPath "PRAGMA integrity_check;") -join "`n"
$integrity = $integrity.Trim()
if ($integrity -ne "ok") { throw "恢复数据库完整性检查失败：$integrity" }
$foreignKeys = @(& $sqlite $restoredPath "PRAGMA foreign_key_check;") -join "`n"
$foreignKeys = $foreignKeys.Trim()
if ($foreignKeys) { throw "恢复数据库外键检查失败：$foreignKeys" }
$schemaVersion = @(& $sqlite $restoredPath "SELECT COALESCE(MAX(version), 0) FROM schema_migrations;") -join "`n"
$schemaVersion = $schemaVersion.Trim()
if ($schemaVersion -ne [string]$manifest.schemaVersion) { throw "恢复 schema 版本不匹配" }

[ordered]@{
  restoredPath = $restoredPath
  integrityCheck = $integrity
  foreignKeyViolations = 0
  schemaVersion = $schemaVersion
  sha256 = $actualHash
} | ConvertTo-Json
