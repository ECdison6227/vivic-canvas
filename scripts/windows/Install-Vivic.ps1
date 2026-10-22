$ErrorActionPreference = 'Stop'
$taskSource = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskInstall = Join-Path $env:LOCALAPPDATA ('Vivic\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $taskInstall -Force | Out-Null
& robocopy.exe $taskSource $taskInstall /E /XF '.env' '.env.*' '.launcher.json' '*.log' /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -gt 7) { throw 'Vivic installation copy failed.' }
$taskShell = New-Object -ComObject WScript.Shell
foreach ($taskAction in @('Start', 'Stop')) {
  $taskShortcut = $taskShell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ("Vivic $taskAction.lnk")))
  $taskShortcut.TargetPath = Join-Path $taskInstall ("$taskAction-Vivic.cmd")
  $taskShortcut.WorkingDirectory = $taskInstall
  $taskShortcut.Save()
}
Write-Host "Installed: $taskInstall"
Write-Host 'Use the Vivic Start desktop shortcut to open Vivic.'
