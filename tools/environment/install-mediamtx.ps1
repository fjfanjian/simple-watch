$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$version = "1.18.2"
$expectedSha256 = "945ab46c5fc6d2802ad18e2f1d7e49245ca5609657d85e310aa6eda4cdd72eec"
$cacheRoot = Join-Path $repoRoot ".cache"
$archive = Join-Path $cacheRoot "mediamtx_v${version}_windows_amd64.zip"
$installRoot = Join-Path $cacheRoot "mediamtx-$version"
$binary = Join-Path $installRoot "mediamtx.exe"
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

if (-not (Test-Path -LiteralPath $archive)) {
  $uri = "https://github.com/bluenviron/mediamtx/releases/download/v$version/mediamtx_v${version}_windows_amd64.zip"
  Invoke-WebRequest -Uri $uri -OutFile $archive
}
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expectedSha256) { throw "MediaMTX 压缩包 SHA-256 不匹配：$actual" }
if (-not (Test-Path -LiteralPath $binary)) {
  Expand-Archive -LiteralPath $archive -DestinationPath $installRoot -Force
}
$reported = & $binary --version
if ($reported -notmatch "v$([regex]::Escape($version))") { throw "MediaMTX 版本不匹配：$reported" }
Write-Output $binary
