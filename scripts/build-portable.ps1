[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $repoRoot "out"
$packageName = "DigiPiano Portable"
$packageRoot = Join-Path $outputRoot $packageName
$appRoot = Join-Path $packageRoot "app"
$templateRoot = Join-Path $PSScriptRoot "portable"
$package = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$zipPath = Join-Path $outputRoot "DigiPiano-$($package.version)-win-portable.zip"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE."
  }
}

Push-Location $repoRoot
try {
  Invoke-CheckedCommand npm.cmd run typecheck
  Invoke-CheckedCommand npx.cmd vite build --configLoader native

  $resolvedOutputRoot = [System.IO.Path]::GetFullPath($outputRoot)
  $resolvedPackageRoot = [System.IO.Path]::GetFullPath($packageRoot)
  if (-not $resolvedPackageRoot.StartsWith($resolvedOutputRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Portable package output resolved outside the repository's out directory."
  }

  if (Test-Path -LiteralPath $packageRoot) {
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }

  New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $repoRoot "dist\*") -Destination $appRoot -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $templateRoot "Start Piano.bat") -Destination $packageRoot
  Copy-Item -LiteralPath (Join-Path $templateRoot "Serve-Piano.ps1") -Destination $packageRoot
  Copy-Item -LiteralPath (Join-Path $templateRoot "README.txt") -Destination $packageRoot

  $commit = (& git rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0) {
    $commit = "unknown"
  }
  $workingTreeState = if ((& git status --porcelain).Count -gt 0) { "uncommitted changes present" } else { "clean" }
  $versionText = @(
    "DigiPiano Portable"
    "Application version: $($package.version)"
    "Git commit: $commit"
    "Build workspace: $workingTreeState"
    "Built UTC: $([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))"
  ) -join [Environment]::NewLine
  Set-Content -LiteralPath (Join-Path $packageRoot "VERSION.txt") -Value $versionText -Encoding UTF8

  Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal

  Write-Host ""
  Write-Host "Portable package created:"
  Write-Host $zipPath
} finally {
  Pop-Location
}
