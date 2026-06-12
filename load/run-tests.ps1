# PowerShell test runner for k6 load tests
# Starts test server, runs k6 scripts, stops server, returns exit code
param(
  [string]$BaseUrl = "http://localhost:3000",
  [switch]$SkipBuild,
  [string[]]$Scripts = @("concurrent-dispatches", "degradation-scenarios")
)

$ErrorActionPreference = "Stop"
$env:MEMTRACE_TEST_MODE = "1"
$env:BASE_URL = $BaseUrl

if (-not $SkipBuild) {
  Write-Host "Building middleware..." -ForegroundColor Cyan
  pnpm build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
  }
}

Write-Host "Starting test server..." -ForegroundColor Cyan
$server = Start-Process -NoNewWindow -PassThru -FilePath "node" -ArgumentList "dist/test-server.js"
Start-Sleep -Seconds 3

try {
  foreach ($script in $Scripts) {
    Write-Host "Running k6: $script..." -ForegroundColor Cyan
    $k6Args = @("run", "load/$script.js")
    & "k6" $k6Args
    if ($LASTEXITCODE -ne 0) {
      Write-Host "k6 script '$script' failed with exit code $LASTEXITCODE" -ForegroundColor Red
      exit $LASTEXITCODE
    }
    Write-Host "k6 script '$script' passed!" -ForegroundColor Green
  }
  Write-Host "All load tests passed!" -ForegroundColor Green
  exit 0
} finally {
  Write-Host "Stopping test server..." -ForegroundColor Cyan
  if ($server -and !$server.HasExited) {
    $server.Kill()
  }
  Write-Host "Done." -ForegroundColor Cyan
}
