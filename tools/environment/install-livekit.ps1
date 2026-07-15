$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$version = "1.13.1"
$expectedSha256 = "57afee4cdb044e5fda04c2cc00ca30f4c783bea1f1ea2f483321ce4b9cff4acf"
$cacheRoot = Join-Path $repoRoot ".cache"
$archive = Join-Path $cacheRoot "livekit_${version}_windows_amd64.zip"
$installRoot = Join-Path $cacheRoot "livekit-$version"
$binary = Join-Path $installRoot "livekit-server.exe"
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

if (-not (Test-Path -LiteralPath $archive)) {
  $uri = "https://github.com/livekit/livekit/releases/download/v$version/livekit_${version}_windows_amd64.zip"
  Invoke-WebRequest -Uri $uri -OutFile $archive
}
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expectedSha256) { throw "LiveKit 压缩包 SHA-256 不匹配：$actual" }
if (-not (Test-Path -LiteralPath $binary)) {
  Expand-Archive -LiteralPath $archive -DestinationPath $installRoot -Force
}
$reported = & $binary --version
if ($reported -notmatch $version) { throw "LiveKit 版本不匹配：$reported" }
Write-Output $binary
