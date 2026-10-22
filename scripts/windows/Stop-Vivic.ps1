$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskState = Join-Path $taskRoot '.launcher.json'
if (!(Test-Path -LiteralPath $taskState)) { exit }
$taskOld = Get-Content -LiteralPath $taskState -Raw | ConvertFrom-Json
$taskNode = Join-Path $taskRoot 'runtime\node.exe'
$taskEntry = Join-Path $taskRoot 'apps\local-api\src\index.ts'
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($taskOld.pid)" -ErrorAction SilentlyContinue
if ($taskProcess -and $taskProcess.ExecutablePath -eq $taskNode -and $taskProcess.CommandLine.Contains($taskEntry)) {
  $taskActual = Get-Process -Id $taskOld.pid
  if ($taskActual.StartTime.ToUniversalTime().ToString('o') -eq $taskOld.startedAt) { Stop-Process -Id $taskOld.pid }
}
Remove-Item -LiteralPath $taskState -Force
