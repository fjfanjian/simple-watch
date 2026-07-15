param(
  [string]$OutputPath = "artifacts/releases/local-release-manifest.json",
  [switch]$Production
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Push-Location $repoRoot
try {
  $gitSha = @(& git rev-parse --verify HEAD 2>$null) -join ""
  $gitSha = $gitSha.Trim()
  $dirty = [bool](& git status --porcelain)
  if ($Production -and (-not $gitSha -or $dirty)) {
    throw "生产 manifest 要求已提交且工作树干净"
  }
  $sourceFiles = & rg --files -g "!.git/**" -g "!.cache/**" -g "!.conda/**" -g "!.local/**" -g "!artifacts/**" -g "!node_modules/**" -g "!dist/**" -g "!tmp/**" | Sort-Object
  $sourceDigests = foreach ($file in $sourceFiles) {
    "$((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant())  $file"
  }
  $sourceHashBytes = [Text.Encoding]::UTF8.GetBytes(($sourceDigests -join "`n"))
  $sourceHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($sourceHashBytes)).ToLowerInvariant()
  $migrations = Get-ChildItem migrations -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    [ordered]@{ file = $_.Name; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  $manifest = [ordered]@{
    createdAt = (Get-Date).ToString("o")
    releaseKind = $(if ($Production) { "production" } else { "local-predeploy" })
    gitSha = $(if ($gitSha) { $gitSha } else { $null })
    dirty = $dirty
    sourceTreeSha256 = $sourceHash
    pnpmLockSha256 = (Get-FileHash pnpm-lock.yaml -Algorithm SHA256).Hash.ToLowerInvariant()
    condaLockSha256 = (Get-FileHash conda-win-64.lock -Algorithm SHA256).Hash.ToLowerInvariant()
    migrations = $migrations
    mediaMtx = @{ version = "1.18.2"; windowsSha256 = "945ab46c5fc6d2802ad18e2f1d7e49245ca5609657d85e310aa6eda4cdd72eec" }
    liveKit = @{ version = "1.13.1"; windowsSha256 = "57afee4cdb044e5fda04c2cc00ca30f4c783bea1f1ea2f483321ce4b9cff4acf" }
  }
  $absoluteOutput = [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputPath))
  New-Item -ItemType Directory -Force -Path (Split-Path $absoluteOutput) | Out-Null
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $absoluteOutput -Encoding utf8NoBOM
  Write-Output $absoluteOutput
} finally {
  Pop-Location
}
