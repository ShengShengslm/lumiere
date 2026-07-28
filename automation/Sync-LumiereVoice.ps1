param(
  [string]$Server = "43.156.145.27",
  [string]$User = "root",
  [string]$KeyPath = "C:\Users\Administrator\.ssh\lumiere-voice-backup",
  [string]$Destination = ""
)

$ErrorActionPreference = "Stop"
$voiceFolder = -join ([char[]](0x8BED, 0x97F3, 0x5907, 0x4EFD))
$logName = (-join ([char[]](0x540C, 0x6B65, 0x65E5, 0x5FD7))) + ".txt"
if (-not $Destination) { $Destination = Join-Path (Split-Path $PSScriptRoot -Parent) $voiceFolder }

try {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $log = Join-Path $Destination $logName
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  if (-not (Test-Path -LiteralPath $KeyPath)) { throw "Voice backup SSH key not found: $KeyPath" }

  & scp -q -r -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $KeyPath `
    "${User}@${Server}:/opt/lumiere/data/voice-cache/." $Destination
  if ($LASTEXITCODE -ne 0) { throw "Voice download failed. scp exit code: $LASTEXITCODE" }

  $markCommand = "find /opt/lumiere/data/voice-cache -type f -name '*.mp3' -exec touch '{}.backed-up' ';'"
  & ssh -q -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $KeyPath `
    "${User}@${Server}" $markCommand
  if ($LASTEXITCODE -ne 0) { throw "Downloaded, but server acknowledgement failed. ssh exit code: $LASTEXITCODE" }

  Add-Content -LiteralPath $log -Encoding UTF8 -Value "[$stamp] Automatic sync completed"
} catch {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Add-Content -LiteralPath (Join-Path $Destination $logName) -Encoding UTF8 -Value "[$stamp] Sync failed: $($_.Exception.Message)"
  exit 1
}
