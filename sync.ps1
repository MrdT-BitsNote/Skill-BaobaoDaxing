# sync.ps1 - mirror the workspace sources into this repository.
#
# The workspace stays the working copy; this repository is a backup mirror.
# Run this after changing the plugin, the skill or the diagnostic tools.
#
#   .\sync.ps1            # copy only
#   .\sync.ps1 -Commit    # copy + commit

[CmdletBinding()]
param(
    [switch]$Commit,
    [string]$Message = 'Sync from workspace'
)

$ErrorActionPreference = 'Stop'

$repo = $PSScriptRoot
# <workspace>/github/<repo> -> <workspace>
$workspace = Split-Path (Split-Path $repo -Parent) -Parent

$pluginSrc = Join-Path $workspace 'plugins\dsh-sponge-buddy'
$toolsSrc = Join-Path $workspace 'scripts'
# The skill lives in the live profile, not in the workspace.
$skillSrc = Join-Path $env:USERPROFILE '.dsh\skills\baobao-daxing'

foreach ($path in @($pluginSrc, $toolsSrc, $skillSrc)) {
    if (-not (Test-Path $path)) { throw "missing source: $path" }
}

foreach ($target in @('plugin', 'skill', 'tools')) {
    $dest = Join-Path $repo $target
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
}

Copy-Item -Recurse $pluginSrc (Join-Path $repo 'plugin')
Copy-Item -Recurse $skillSrc (Join-Path $repo 'skill')
Copy-Item -Recurse $toolsSrc (Join-Path $repo 'tools')

# Packaging / runtime leftovers that must never be mirrored.
Get-ChildItem $repo -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Get-ChildItem $repo -Recurse -File -Include '*.log', '*.zip', '*.pyc' -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "synced into $repo"

if ($Commit) {
    git -C $repo add -A
    git -C $repo commit -m $Message
    Write-Host 'committed'
}
