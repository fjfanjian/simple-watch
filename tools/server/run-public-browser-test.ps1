$ErrorActionPreference = 'Stop'
$credentialLines = ssh admin@8.134.239.34 'sudo cat /root/simplewatch-initial-credentials'
if ($LASTEXITCODE -ne 0) { throw '无法读取服务器测试凭据' }
$credentials = @{}
foreach ($line in $credentialLines) {
  $parts = $line -split '=', 2
  if ($parts.Count -eq 2) { $credentials[$parts[0]] = $parts[1] }
}
if (-not $credentials.USERNAME -or -not $credentials.PASSWORD) { throw '服务器测试凭据不完整' }
$env:SIMPLEWATCH_ADMIN_USERNAME = $credentials.USERNAME
$env:SIMPLEWATCH_ADMIN_PASSWORD = $credentials.PASSWORD
try {
  pwsh -NoProfile -File tools/environment/run-dev.ps1 pnpm exec playwright test --config playwright.server.config.ts
  if ($LASTEXITCODE -ne 0) { throw '公网浏览器测试失败' }
} finally {
  Remove-Item Env:SIMPLEWATCH_ADMIN_USERNAME -ErrorAction SilentlyContinue
  Remove-Item Env:SIMPLEWATCH_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
