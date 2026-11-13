# asar.ps1 — minimal reader for the DSH electron app.asar
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File asar.ps1 -Build
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File asar.ps1 -Find 'dsh/*.js'
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File asar.ps1 -Extract 'dsh/x.js' -Out C:\tmp\x.js
param(
  [string]$Asar = "D:\DeepSeek Harness\resources\app.asar",
  [switch]$Build,
  [string]$Find,
  [string]$Extract,
  [string]$Out
)

$ErrorActionPreference = 'Stop'
$manifest = Join-Path $env:TEMP 'dsh-asar-manifest.csv'
$dataOffsetFile = Join-Path $env:TEMP 'dsh-asar-dataoffset.txt'

function Build-Manifest {
  $fs = [System.IO.File]::OpenRead($Asar)
  try {
    $b = New-Object byte[] 16
    $null = $fs.Read($b, 0, 16)
    $jsonLen = [BitConverter]::ToUInt32($b, 12)
    $dataOffset = 8 + [BitConverter]::ToUInt32($b, 4)
    $buf = New-Object byte[] $jsonLen
    $read = 0
    while ($read -lt $jsonLen) {
      $n = $fs.Read($buf, $read, $jsonLen - $read)
      if ($n -le 0) { break }
      $read += $n
    }
  } finally { $fs.Close() }
  $tree = ([System.Text.Encoding]::UTF8.GetString($buf)) | ConvertFrom-Json
  $rows = New-Object System.Collections.Generic.List[string]
  $walk = $null
  $walk = {
    param($node, $prefix)
    foreach ($p in $node.PSObject.Properties) {
      $child = $p.Value
      $cur = if ($prefix) { $prefix + '/' + $p.Name } else { $p.Name }
      $TAB = [string][char]9
      if ($child.PSObject.Properties.Name -contains 'files') { & $walk $child.files $cur }
      elseif ($child.PSObject.Properties.Name -contains 'link') { $rows.Add($cur + $TAB + '-1' + $TAB + '-1') }
      else { $rows.Add($cur + $TAB + $child.size + $TAB + $child.offset) }
    }
  }
  & $walk $tree.files ''
  [System.IO.File]::WriteAllText($manifest, ($rows -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
  [System.IO.File]::WriteAllText($dataOffsetFile, [string]$dataOffset)
  Write-Output ("manifest: {0} entries, dataOffset {1}" -f $rows.Count, $dataOffset)
}

function Read-Manifest {
  if (-not (Test-Path $manifest)) { throw "manifest missing; run with -Build first" }
  $dataOffset = [int]([System.IO.File]::ReadAllText($dataOffsetFile))
  $entries = @{}
  foreach ($line in [System.IO.File]::ReadAllLines($manifest, [System.Text.Encoding]::UTF8)) {
    if (-not $line) { continue }
    $parts = $line.Split("`t")
    if ($parts.Count -lt 3) { continue }
    $entries[$parts[0]] = @{ size = [int64]$parts[1]; offset = [int64]$parts[2] }
  }
  return @{ dataOffset = $dataOffset; entries = $entries }
}

if ($Build) { Build-Manifest; return }

if ($Find) {
  if (-not (Test-Path $manifest)) { Build-Manifest | Out-Null }
  $pattern = $Find
  foreach ($line in [System.IO.File]::ReadAllLines($manifest, [System.Text.Encoding]::UTF8)) {
    if (-not $line) { continue }
    $parts = $line.Split("`t")
    if ($parts[0] -like $pattern) { Write-Output ("{0}  {1}" -f $parts[0], $parts[1]) }
  }
  return
}

if ($Extract) {
  if (-not (Test-Path $manifest)) { Build-Manifest | Out-Null }
  $m = Read-Manifest
  if (-not $m.entries.ContainsKey($Extract)) { throw "not found: $Extract" }
  if (-not $Out) { throw "-Out is required" }
  $e = $m.entries[$Extract]
  $fs = [System.IO.File]::OpenRead($Asar)
  try {
    $fs.Position = $m.dataOffset + $e.offset
    $bytes = New-Object byte[] $e.size
    $read = 0
    while ($read -lt $e.size) {
      $n = $fs.Read($bytes, $read, $e.size - $read)
      if ($n -le 0) { break }
      $read += $n
    }
  } finally { $fs.Close() }
  [System.IO.File]::WriteAllBytes($Out, $bytes)
  Write-Output ("extracted {0} ({1} bytes) -> {2}" -f $Extract, $e.size, $Out)
}
