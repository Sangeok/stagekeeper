param(
  [Parameter(Mandatory=$true)][string]$Target,
  [ValidateSet('probe', 'hold-delete', 'hold-directory')][string]$Mode = 'probe'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -lt 7 -or
      -not [Environment]::Is64BitProcess -or [Environment]::OSVersion.Version.Build -ne 20348) {
    throw 'unsupported-profile'
  }
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-directory-probe.cs')
  if ($Mode -eq 'probe') {
    [Console]::WriteLine(([StagekeeperDirectoryProbe]::Inspect($Target) | ConvertTo-Json -Depth 4 -Compress))
  } else {
    [StagekeeperDirectoryProbe]::Hold($Target, ($Mode -eq 'hold-delete'))
  }
} catch {
  [Console]::WriteLine('{"failed":true}')
  exit 1
}
