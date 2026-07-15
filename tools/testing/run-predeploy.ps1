$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$artifactRoot = Join-Path $repoRoot "artifacts\predeploy\latest"
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null

$startedAt = Get-Date
$logPath = Join-Path $artifactRoot "verify.log"

Push-Location $repoRoot
try {
  "SimpleWatch local predeploy started: $($startedAt.ToString('o'))" |
    Tee-Object -FilePath $logPath
  & pwsh -File tools/environment/run-dev.ps1 pnpm verify 2>&1 |
    Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm verify failed with exit code $LASTEXITCODE"
  }
  "SimpleWatch local predeploy passed: $((Get-Date).ToString('o'))" |
    Tee-Object -FilePath $logPath -Append
} finally {
  Pop-Location
}
