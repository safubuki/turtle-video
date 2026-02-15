param(
  [string]$VenvDir = ".venv-media-analysis",
  [string]$RequirementsPath = "scripts/dev/requirements-media-analysis.txt",
  [switch]$UpgradePip,
  [Alias("?")]
  [switch]$Help
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

if ($Help) {
  Write-Host "Usage:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/dev/setup-media-analysis-env.ps1 [-VenvDir <path>] [-RequirementsPath <path>] [-UpgradePip]"
  Write-Host ""
  Write-Host "Examples:"
  Write-Host "  npm run dev:media:setup"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/dev/setup-media-analysis-env.ps1 -UpgradePip"
  exit 0
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$VenvPath = Join-Path $RepoRoot $VenvDir
$ResolvedRequirements = Join-Path $RepoRoot $RequirementsPath

$HasPyLauncher = $null -ne (Get-Command py -ErrorAction SilentlyContinue)
$HasPython = $null -ne (Get-Command python -ErrorAction SilentlyContinue)

if (-not $HasPyLauncher -and -not $HasPython) {
  throw "Python was not found. Please install Python 3.11+."
}

if (-not (Test-Path $ResolvedRequirements)) {
  throw "requirements file was not found: $ResolvedRequirements"
}

if (-not (Test-Path $VenvPath)) {
  Write-Host "Creating virtual environment: $VenvPath"
  if ($HasPyLauncher) {
    & py -3 -m venv $VenvPath
  } else {
    & python -m venv $VenvPath
  }
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} else {
  Write-Host "Using existing virtual environment: $VenvPath"
}

$VenvPythonCandidates = @(
  (Join-Path $VenvPath "Scripts\python.exe"),
  (Join-Path $VenvPath "bin\python.exe")
)
$VenvPython = $VenvPythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $VenvPython) {
  throw "venv python was not found. Checked: $($VenvPythonCandidates -join ', ')"
}

$pipAvailable = $true
try {
  & $VenvPython -m pip --version 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    $pipAvailable = $false
  }
} catch {
  $pipAvailable = $false
}

if (-not $pipAvailable) {
  Write-Host "pip is missing in venv. Bootstrapping with ensurepip..."
  try {
    & $VenvPython -m ensurepip --upgrade
  } catch {
    throw "pip bootstrap failed in venv: $VenvPath"
  }
  if ($LASTEXITCODE -ne 0) {
    throw "pip bootstrap failed in venv: $VenvPath"
  }
}

if ($UpgradePip) {
  & $VenvPython -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

& $VenvPython -m pip install -r $ResolvedRequirements
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Media analysis setup completed."
Write-Host "Next command:"
Write-Host '  npm run dev:media:analyze -- -InputPath "C:\path\capture.mp4"'
