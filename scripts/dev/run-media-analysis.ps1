param(
  [string]$InputPath,
  [ValidateSet("summary", "black-segments", "freeze-segments", "tail-black", "full-black")]
  [string]$Mode = "summary",
  [ValidateSet("full", "tail")]
  [string]$Scope = "full",
  [double]$TailSeconds = 2.0,
  [double]$BlackThreshold = 8.0,
  [double]$FreezeThreshold = 0.8,
  [int]$MinSegmentFrames = 3,
  [string]$OutputPath = "",
  [string]$VenvDir = ".venv-media-analysis",
  [Alias("?")]
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Host "Usage:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/dev/run-media-analysis.ps1 -InputPath <video> [-Mode summary|black-segments|freeze-segments|tail-black|full-black] [-Scope full|tail] [-TailSeconds <n>] [-BlackThreshold <n>] [-FreezeThreshold <n>] [-MinSegmentFrames <n>] [-OutputPath <path>] [-VenvDir <path>]"
  Write-Host ""
  Write-Host "Example:"
  Write-Host "  npm run dev:media:analyze -- -InputPath `"C:\path\capture.mp4`" -Mode freeze-segments -Scope tail"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($InputPath)) {
  throw "InputPath is required. Use -InputPath <video> or -Help."
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$VenvPath = Join-Path $RepoRoot $VenvDir
$VenvPythonCandidates = @(
  (Join-Path $VenvPath "Scripts\python.exe"),
  (Join-Path $VenvPath "bin\python.exe")
)
$VenvPython = $VenvPythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$ScriptPath = Join-Path $PSScriptRoot "analyze-video.py"

if (-not $VenvPython) {
  throw "venv python was not found. Checked: $($VenvPythonCandidates -join ', ')`nRun setup first: npm run dev:media:setup"
}

if (-not (Test-Path $ScriptPath)) {
  throw "analyzer script was not found: $ScriptPath"
}

$ResolvedInput = Resolve-Path $InputPath -ErrorAction Stop

$CliArgs = @(
  $ScriptPath,
  "--input", $ResolvedInput.Path,
  "--mode", "$Mode",
  "--scope", "$Scope",
  "--tail-seconds", "$TailSeconds",
  "--black-threshold", "$BlackThreshold",
  "--freeze-threshold", "$FreezeThreshold",
  "--min-segment-frames", "$MinSegmentFrames"
)

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
  $CliArgs += @("--output", $OutputPath)
}

& $VenvPython @CliArgs
exit $LASTEXITCODE
