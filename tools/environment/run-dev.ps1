$ErrorActionPreference = 'Stop'
$CommandArgs = [string[]] $args
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$condaPrefix = Join-Path $repoRoot '.conda\envs\dev'
$condaExe = 'C:\ProgramData\miniconda3\Scripts\conda.exe'

if (-not (Test-Path -LiteralPath $condaPrefix)) {
  throw "项目 Conda 环境不存在：$condaPrefix。请先按 IMPLEMENTATION_PLAN.md 第 4.2 节创建。"
}

if (-not (Test-Path -LiteralPath $condaExe)) {
  throw "未找到本机 Conda：$condaExe"
}

$env:CONDA_PKGS_DIRS = Join-Path $repoRoot '.cache\conda-pkgs'
$env:TEMP = Join-Path $repoRoot 'tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:XDG_CACHE_HOME = Join-Path $repoRoot '.cache\xdg'
$env:PNPM_HOME = Join-Path $repoRoot '.cache\pnpm-home'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $repoRoot '.cache\playwright'
$env:PNPM_STORE_DIR = Join-Path $repoRoot '.cache\pnpm-store'

New-Item -ItemType Directory -Force -Path @(
  $env:CONDA_PKGS_DIRS,
  $env:TEMP,
  $env:XDG_CACHE_HOME,
  $env:PNPM_HOME,
  $env:PLAYWRIGHT_BROWSERS_PATH,
  $env:PNPM_STORE_DIR
) | Out-Null

if ($CommandArgs.Count -eq 0) {
  throw '请提供要执行的命令，例如：pwsh -File tools/environment/run-dev.ps1 pnpm verify'
}

& $condaExe run --prefix $condaPrefix --no-capture-output @CommandArgs
exit $LASTEXITCODE
