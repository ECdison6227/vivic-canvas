param([string]$Abis='arm64-v8a,armeabi-v7a',[string]$OutputDirectory='',[string]$PreviousApk='',[string]$Version='0.3.0',[int]$VersionCode=20)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repo=[IO.Path]::GetFullPath((Join-Path $project '..\..'))
if (-not $OutputDirectory) { $OutputDirectory=Join-Path $repo '.cache\android-release\phone' }
$output=[IO.Path]::GetFullPath($OutputDirectory)
if (-not $env:VIVIC_ANDROID_KEYSTORE -or -not (Test-Path -LiteralPath $env:VIVIC_ANDROID_KEYSTORE)) { throw 'Set the approved VIVIC_ANDROID_KEYSTORE.' }
$sdkLine=Get-Content -LiteralPath (Join-Path $project 'local.properties') | Where-Object { $_.StartsWith('sdk.dir=') } | Select-Object -First 1
$sdk=$sdkLine.Substring(8).Replace('\:',':').Replace('\\','\')
$signer=Join-Path $sdk 'build-tools\36.0.0\apksigner.bat'
$aapt=Join-Path $sdk 'build-tools\36.0.0\aapt.exe'
Push-Location $project
try {
 & .\gradlew.bat ':app:assembleRelease' "-PvivicAbis=$Abis" "-PvivicVersionName=$Version" "-PvivicVersionCode=$VersionCode"
 if ($LASTEXITCODE -ne 0) { throw 'Release build failed.' }
 $source=Join-Path $project 'app\build\outputs\apk\release\app-release.apk'
 $certificate=(& $signer verify --verbose --print-certs $source 2>&1) -join "`n"
 if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed.' }
 $fingerprint=[regex]::Match($certificate,'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)').Groups[1].Value
 if ($fingerprint.Length -ne 64) { throw 'Missing signing certificate.' }
 if ($PreviousApk) {
  $old=(& $signer verify --print-certs $PreviousApk 2>&1) -join "`n"
  if ($LASTEXITCODE -ne 0 -or -not $old.Contains("Signer #1 certificate SHA-256 digest: $fingerprint")) { throw 'Legacy certificate mismatch.' }
 }
 $badging=(& $aapt dump badging $source 2>&1) -join "`n"
 if ($LASTEXITCODE -ne 0 -or $badging -notmatch "package: name='app.vivic.remote' versionCode='$VersionCode' versionName='$Version'" -or $badging.Contains('application-debuggable')) { throw 'Unexpected package, version, or debug build.' }
 $bytes=(Get-Item -LiteralPath $source).Length
 if ($Abis -eq 'arm64-v8a,armeabi-v7a' -and $bytes -gt 15MB) { throw 'Phone APK exceeds 15 MiB.' }
 New-Item -ItemType Directory -Path $output -Force | Out-Null
 $filename="Vivic-Remote-$Version.apk"; $apk=Join-Path $output $filename
 Copy-Item -LiteralPath $source -Destination $apk -Force
 $hash=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
 $manifest=@{schemaVersion=1;stable=@{android=@{version=$Version;versionCode=$VersionCode;url="https://vivic.edsionc.top/downloads/android/$filename";sha256=$hash;size=$bytes;minSupportedVersionCode=1;notes='Native chat, Space, voice, display control, StepFun with DeepSeek fallback.'}}}
 $utf8=[Text.UTF8Encoding]::new($false)
 [IO.File]::WriteAllText((Join-Path $output 'latest.json'),($manifest | ConvertTo-Json -Depth 8),$utf8)
 $receipt=@{version=$Version;versionCode=$VersionCode;apk=$filename;size=$bytes;sha256=$hash;certificateSha256=$fingerprint;abis=$Abis;debugging=$false;testCa=$false}
 [IO.File]::WriteAllText("$apk.json",($receipt | ConvertTo-Json -Depth 4),$utf8)
 $receipt | ConvertTo-Json -Compress
} finally { Pop-Location }
