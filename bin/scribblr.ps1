# Scribblr launcher for Windows.
#   scribblr            start Scribblr and open the dashboard
#   scribblr <hash>     join a shared whiteboard
#   scribblr --update   download the latest version
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$AppDir = Split-Path -Parent $PSScriptRoot
Set-Location $AppDir
$Port = if ($env:SCRIBBLR_PORT) { $env:SCRIBBLR_PORT } else { '5173' }
$NodeVersion = '22.11.0'
$Local = Join-Path $AppDir '.scribblr'
New-Item -ItemType Directory -Force -Path $Local | Out-Null

function Log($m) { Write-Host "[scribblr] $m" -ForegroundColor Cyan }
function Die($m) { Write-Host "[scribblr] $m" -ForegroundColor Red; exit 1 }

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    $major = [int](& node -p "process.versions.node.split('.')[0]")
    if ($major -ge 20) { return }
  }
  $nd = Join-Path $Local 'node'
  if (-not (Test-Path (Join-Path $nd 'node.exe'))) {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    Log "Downloading Node.js $NodeVersion (one-time)..."
    $zip = Join-Path $Local 'node.zip'
    Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-$arch.zip" -OutFile $zip
    $tmp = Join-Path $Local 'node-tmp'
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive $zip -DestinationPath $tmp
    if (Test-Path $nd) { Remove-Item -Recurse -Force $nd }
    Move-Item (Get-ChildItem $tmp | Select-Object -First 1).FullName $nd
    Remove-Item -Recurse -Force $tmp, $zip
  }
  $env:PATH = "$nd;$env:PATH"
}

function Ensure-Deps {
  $want = (Get-FileHash package-lock.json -Algorithm SHA1).Hash
  $stamp = Join-Path $Local 'deps.stamp'
  $have = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { '' }
  if (-not (Test-Path node_modules) -or $have -ne $want) {
    Log 'Installing dependencies...'
    & npm ci --no-audit --no-fund --loglevel=error *> (Join-Path $Local 'npm.log')
    if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $Local 'npm.log'); Die 'npm install failed' }
    Set-Content $stamp $want
  }
}

# The Supabase URL + publishable key ship in scribblr.public.json (public by design).
# `scribblr --config` writes scribblr.config.json, an optional git-ignored override.
function Configure-Override {
  $f = Join-Path $AppDir 'scribblr.config.json'
  Log 'Point Scribblr at a different Supabase project (saved to scribblr.config.json, git-ignored).'
  do { $url = (Read-Host '  Supabase URL (https://xxxx.supabase.co)').Trim() } until ($url -match '^https://[A-Za-z0-9.-]+$')
  do { $key = (Read-Host '  Supabase publishable key (sb_publishable_...)').Trim() } until ($key -match '^[A-Za-z0-9._-]{20,}$')
  if ($key -like 'sb_secret_*') { Die "That's a SECRET key. Use the publishable key." }
  $json = "{`n  `"supabaseUrl`": `"$url`",`n  `"supabaseAnonKey`": `"$key`"`n}`n"
  [IO.File]::WriteAllText($f, $json)
  Log 'Saved. To go back to the default project: delete scribblr.config.json'
}

function Ensure-Build {
  $index = 'dist/index.html'
  $stale = -not (Test-Path $index)
  if (-not $stale) {
    $t = (Get-Item $index).LastWriteTime
    $stale = [bool](Get-ChildItem src, public, index.html, package-lock.json, scribblr.public.json, scribblr.config.json, vite.config.ts -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -gt $t } | Select-Object -First 1)
  }
  if ($stale) {
    Log 'Building Scribblr...'
    & npx vite build --logLevel error *> (Join-Path $Local 'build.log')
    if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $Local 'build.log'); Die 'Build failed' }
  }
}

function Test-Running {
  try { (Invoke-WebRequest "http://127.0.0.1:$Port/__scribblr" -UseBasicParsing -TimeoutSec 1).Content -eq 'scribblr' } catch { $false }
}

function Check-Update {
  if (-not (Get-Command git -ErrorAction SilentlyContinue) -or -not (Test-Path .git)) { return }
  Start-Job -ScriptBlock {
    param($dir) Set-Location $dir
    git fetch -q 2>$null
    $n = [int](git rev-list --count 'HEAD..@{u}' 2>$null)
    if ($n -gt 0) { '[scribblr] Update available. Run: scribblr --update' }
  } -ArgumentList $AppDir | Out-Null
}

$arg = if ($args.Count -gt 0) { [string]$args[0] } else { '' }
switch ($arg) {
  { $_ -in '-h', '--help' } { 'Usage: scribblr [board-hash] | --update | --config'; exit 0 }
  '--config' { Configure-Override; exit 0 }
  '--update' {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die 'git is required to update' }
    Log 'Updating...'; git pull --ff-only -q; if ($LASTEXITCODE -ne 0) { Die 'Update failed (local changes?)' }
    Ensure-Node; Ensure-Deps; Ensure-Build; Log 'Updated.'; exit 0
  }
  '--prepare' { Ensure-Node; Ensure-Deps; Ensure-Build; exit 0 }
}

$Url = "http://localhost:$Port/#/"
if ($arg) {
  if ($arg -notmatch '^[A-Za-z0-9_-]{4,64}$') { Die "Invalid board hash: $arg" }
  $Url = "http://localhost:$Port/#/join/$arg"
}

Ensure-Node; Ensure-Deps; Ensure-Build; Check-Update

if (Test-Running) { Log 'Scribblr is already running.'; Start-Process $Url; exit 0 }

$env:SCRIBBLR_PORT = $Port
$server = Start-Process node -ArgumentList 'server/serve.mjs' -NoNewWindow -PassThru
for ($i = 0; $i -lt 50 -and -not (Test-Running); $i++) { Start-Sleep -Milliseconds 100 }
Start-Process $Url
try {
  while (-not $server.HasExited) {
    Get-Job -State Completed | Receive-Job | ForEach-Object { Write-Host $_ -ForegroundColor Cyan }
    Get-Job -State Completed | Remove-Job
    Start-Sleep -Milliseconds 500
  }
} finally { if (-not $server.HasExited) { Stop-Process -Id $server.Id } }
