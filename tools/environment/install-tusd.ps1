$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$version = '2.9.2'
$expectedSha256 = 'bf9230ecfee24a098b73e5ad4a0179feefbf62ce121d4ed4074e29f9cf86aab3'
$cacheRoot = Join-Path $repoRoot '.cache'
$archive = Join-Path $cacheRoot 'tusd_windows_amd64.zip'
$installRoot = Join-Path $cacheRoot "tusd-$version"
$binary = Join-Path $installRoot 'tusd_windows_amd64\tusd.exe'
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

if (-not (Test-Path -LiteralPath $archive)) {
  $uri = "https://github.com/tus/tusd/releases/download/v$version/tusd_windows_amd64.zip"
  Invoke-WebRequest -Uri $uri -OutFile $archive
}
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expectedSha256) { throw "tusd 压缩包 SHA-256 不匹配：$actual" }
if (-not (Test-Path -LiteralPath $binary)) {
  Expand-Archive -LiteralPath $archive -DestinationPath $installRoot -Force
}
$reported = & $binary -version
if ($reported -notcontains "Version: v$version") { throw "tusd 版本不匹配" }
Write-Output $binary
