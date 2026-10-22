param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskNode = Join-Path $taskRoot 'runtime\node.exe'
$taskEntry = Join-Path $taskRoot 'apps\local-api\src\index.ts'
$taskState = Join-Path $taskRoot '.launcher.json'
$taskReceipt = Get-Content -LiteralPath (Join-Path $taskRoot 'release.json') -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $taskNode -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskReceipt.nodeSha256) { throw 'Node runtime verification failed.' }
$taskPort = 18787
$taskUrl = "http://127.0.0.1:$taskPort"
if (Test-Path -LiteralPath $taskState) {
  $taskOld = Get-Content -LiteralPath $taskState -Raw | ConvertFrom-Json
  $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskOld.pid)" -ErrorAction SilentlyContinue
  if ($taskProcess -and $taskProcess.ExecutablePath -eq $taskNode -and $taskProcess.CommandLine.Contains($taskEntry)) {
    if (!$NoOpen) { Start-Process $taskUrl }
    exit
  }
}
if (Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction SilentlyContinue) { throw "Port $taskPort is occupied. Close the app using that port first." }
$env:PORT = [string]$taskPort
$env:VIVIC_ALLOWED_ORIGINS = "$taskUrl,http://localhost:$taskPort"
$taskArgs = @('--import', 'tsx', ('"' + $taskEntry + '"'))
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList $taskArgs -WorkingDirectory (Join-Path $taskRoot 'apps\local-api') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRoot 'runtime.out.log') -RedirectStandardError (Join-Path $taskRoot 'runtime.err.log')
@{ pid = $taskProcess.Id; startedAt = $taskProcess.StartTime.ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $taskState -Encoding UTF8
for ($taskAttempt = 0; $taskAttempt -lt 60; $taskAttempt++) {
  try {
    $taskHealth = Invoke-RestMethod -Uri "$taskUrl/healthz" -TimeoutSec 1
    if ($taskHealth.service -eq 'vivic-local-api') { if (!$NoOpen) { Start-Process $taskUrl }; exit }
  } catch { }
  if ($taskProcess.HasExited) { throw 'Vivic exited. Check runtime.err.log.' }
  Start-Sleep -Milliseconds 500
}
throw 'Vivic startup timed out. Check runtime.err.log.'
