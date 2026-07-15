$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$version = '2.11.4'
$expectedSha512 = 'cd5ccfd86a4b40732cf715890d0dca5bf3f63adefec5a7914de85adf240c60ce7e5d2791631b88ef9758e46b23bb1730e020b9c5d696889740b284ffd4788e35'
$cacheRoot = Join-Path $repoRoot '.cache'
$archive = Join-Path $cacheRoot "caddy_${version}_windows_amd64.zip"
$installRoot = Join-Path $cacheRoot "caddy-$version"
$binary = Join-Path $installRoot 'caddy.exe'
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

if (-not (Test-Path -LiteralPath $archive)) {
  $uri = "https://github.com/caddyserver/caddy/releases/download/v$version/caddy_${version}_windows_amd64.zip"
  Invoke-WebRequest -Uri $uri -OutFile $archive
}
$actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash.ToLowerInvariant()
if ($actual -ne $expectedSha512) {
  throw "Caddy 压缩包 SHA-512 不匹配：$actual"
}
if (-not (Test-Path -LiteralPath $binary)) {
  Expand-Archive -LiteralPath $archive -DestinationPath $installRoot -Force
}
$reported = (& $binary version).Split(' ', 2)[0]
if ($reported -ne "v$version") { throw "Caddy 版本不匹配：$reported" }
Write-Output $binary
