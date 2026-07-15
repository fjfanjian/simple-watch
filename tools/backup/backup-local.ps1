param(
  [Parameter(Mandatory = $true)][string]$DatabasePath,
  [string]$OutputRoot = "artifacts/backups"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sqlite = "C:\platform-tools\sqlite3.exe"
if (-not (Test-Path -LiteralPath $sqlite)) { throw "缺少 sqlite3：$sqlite" }
$database = (Resolve-Path -LiteralPath $DatabasePath).Path
$root = [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputRoot))
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $root $timestamp
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$backupPath = Join-Path $backupRoot "simplewatch.sqlite3"

$backupCommand = ".backup '$($backupPath.Replace("'", "''").Replace('\', '/'))'"
& $sqlite $database $backupCommand
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath)) {
  throw "SQLite Backup API 执行失败"
}
$integrity = (& $sqlite $backupPath "PRAGMA integrity_check;").Trim()
if ($integrity -ne "ok") { throw "备份完整性检查失败：$integrity" }
$schemaVersion = (& $sqlite $backupPath "SELECT COALESCE(MAX(version), 0) FROM schema_migrations;").Trim()
$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  sourceDatabase = $database
  databaseFile = "simplewatch.sqlite3"
  sha256 = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
  bytes = (Get-Item -LiteralPath $backupPath).Length
  integrityCheck = $integrity
  schemaVersion = $schemaVersion
  mediaIncluded = $false
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot "manifest.json") -Encoding utf8NoBOM
Write-Output $backupRoot
