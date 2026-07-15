$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$livekit = Join-Path $repoRoot ".cache\livekit-1.13.1\livekit-server.exe"
$logRoot = Join-Path $repoRoot ".local\livekit-five-client"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$process = $null

Push-Location $repoRoot
try {
  $process = Start-Process -FilePath $livekit -ArgumentList @("--config", "infra/livekit/livekit.native.yaml") -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot "livekit.out.log") -RedirectStandardError (Join-Path $logRoot "livekit.err.log")
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $code = & curl.exe -sS --max-time 1 -o NUL -w "%{http_code}" "http://127.0.0.1:17880/" 2>$null
    if ($code -match "^(200|404)$") { $ready = $true; break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw "LiveKit 未在 15 秒内就绪" }
  & pwsh -File tools/environment/run-dev.ps1 pnpm exec playwright test --config playwright.rtc.config.ts --workers=1
  if ($LASTEXITCODE -ne 0) { throw "LiveKit 五客户端测试失败" }
} finally {
  if ($null -ne $process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    $process.WaitForExit(5000) | Out-Null
  }
  Pop-Location
}
