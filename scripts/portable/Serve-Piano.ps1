[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Root,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$port = 4173
$hostUrl = "http://127.0.0.1:$port/"
$healthUrl = "${hostUrl}_piano-portable/health"
$healthResponse = "piano-learning-portable"

function Open-PianoBrowser {
  param([Parameter(Mandatory = $true)][string]$Url)

  $programFiles = [Environment]::GetEnvironmentVariable("ProgramFiles")
  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  $localAppData = [Environment]::GetEnvironmentVariable("LOCALAPPDATA")
  $candidates = @(
    $(if ($programFilesX86) { Join-Path $programFilesX86 "Microsoft\Edge\Application\msedge.exe" }),
    $(if ($programFiles) { Join-Path $programFiles "Microsoft\Edge\Application\msedge.exe" }),
    $(if ($programFiles) { Join-Path $programFiles "Google\Chrome\Application\chrome.exe" }),
    $(if ($programFilesX86) { Join-Path $programFilesX86 "Google\Chrome\Application\chrome.exe" }),
    $(if ($localAppData) { Join-Path $localAppData "Google\Chrome\Application\chrome.exe" })
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  if ($candidates.Count -gt 0) {
    Start-Process -FilePath $candidates[0] -ArgumentList @("--new-tab", $Url)
    return
  }

  Write-Warning "Edge or Chrome was not found. The default browser will open, but Web MIDI may not be supported."
  Start-Process $Url
}

function Write-HttpResponse {
  param(
    [Parameter(Mandatory = $true)][System.IO.Stream]$Stream,
    [Parameter(Mandatory = $true)][int]$StatusCode,
    [Parameter(Mandatory = $true)][string]$StatusText,
    [Parameter(Mandatory = $true)][string]$ContentType,
    [Parameter(Mandatory = $true)][byte[]]$Body,
    [bool]$IncludeBody = $true
  )

  $headers = @(
    "HTTP/1.1 $StatusCode $StatusText"
    "Content-Type: $ContentType"
    "Content-Length: $($Body.Length)"
    "Cache-Control: no-cache"
    "X-Content-Type-Options: nosniff"
    "Connection: close"
    ""
    ""
  ) -join "`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($IncludeBody -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

function Get-ContentType {
  param([Parameter(Mandatory = $true)][string]$Path)

  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".svg" { return "image/svg+xml" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".gif" { return "image/gif" }
    ".ico" { return "image/x-icon" }
    ".woff" { return "font/woff" }
    ".woff2" { return "font/woff2" }
    default { return "application/octet-stream" }
  }
}

$rootPath = [IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath (Join-Path $rootPath "index.html") -PathType Leaf)) {
  Write-Error "The packaged app was not found beside the launcher. Extract the complete ZIP before starting it."
  exit 1
}
$rootPrefix = $rootPath.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

$listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
try {
  $listener.Start()
} catch {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200 -and $response.Content.Trim() -eq $healthResponse) {
      if (-not $NoBrowser) {
        Open-PianoBrowser -Url $hostUrl
      }
      exit 0
    }
  } catch {
    # The port is occupied by something other than this portable app.
  }

  Write-Error "Port $port is already in use. Close the other program or Piano Learning window, then try again."
  exit 1
}

Write-Host "Piano Learning is running at $hostUrl"
Write-Host "Keep this window open while testing. Close it or press Ctrl+C to stop."
Write-Host ""
if (-not $NoBrowser) {
  Open-PianoBrowser -Url $hostUrl
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()
      while (($headerLine = $reader.ReadLine()) -ne $null -and $headerLine -ne "") {
        # Consume request headers. The portable server does not accept a body.
      }

      if (-not $requestLine) {
        continue
      }
      $requestParts = $requestLine.Split(" ")
      if ($requestParts.Count -lt 3) {
        $body = [Text.Encoding]::UTF8.GetBytes("Bad request")
        Write-HttpResponse -Stream $stream -StatusCode 400 -StatusText "Bad Request" -ContentType "text/plain; charset=utf-8" -Body $body
        continue
      }

      $method = $requestParts[0].ToUpperInvariant()
      if ($method -ne "GET" -and $method -ne "HEAD") {
        $body = [Text.Encoding]::UTF8.GetBytes("Method not allowed")
        Write-HttpResponse -Stream $stream -StatusCode 405 -StatusText "Method Not Allowed" -ContentType "text/plain; charset=utf-8" -Body $body -IncludeBody ($method -ne "HEAD")
        continue
      }

      $requestPath = ($requestParts[1] -split "\?", 2)[0]
      $decodedPath = [Uri]::UnescapeDataString($requestPath)
      if ($decodedPath -eq "/_piano-portable/health") {
        $body = [Text.Encoding]::UTF8.GetBytes($healthResponse)
        Write-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -ContentType "text/plain; charset=utf-8" -Body $body -IncludeBody ($method -eq "GET")
        continue
      }

      $relativePath = $decodedPath.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }
      $filePath = [IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))
      if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $body = [Text.Encoding]::UTF8.GetBytes("Not found")
        Write-HttpResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -ContentType "text/plain; charset=utf-8" -Body $body -IncludeBody ($method -eq "GET")
        continue
      }

      $body = [IO.File]::ReadAllBytes($filePath)
      Write-HttpResponse -Stream $stream -StatusCode 200 -StatusText "OK" -ContentType (Get-ContentType -Path $filePath) -Body $body -IncludeBody ($method -eq "GET")
    } catch {
      Write-Warning "A local request could not be served: $($_.Exception.Message)"
    } finally {
      if ($client) {
        $client.Close()
      }
    }
  }
} finally {
  $listener.Stop()
}
