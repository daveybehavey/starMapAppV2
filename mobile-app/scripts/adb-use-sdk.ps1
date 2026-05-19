# Force-stop host adb, then use ONLY the Android SDK platform-tools adb.
# Run from PowerShell:  mobile-app>  powershell -ExecutionPolicy Bypass -File scripts/adb-use-sdk.ps1
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  Write-Error "Missing $adb — install Android SDK Platform-Tools."
  exit 1
}
Get-Process -Name adb -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Write-Host "Using: $adb"
& $adb version
& $adb start-server
Start-Sleep -Seconds 1
& $adb devices -l
