$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$stage = 'runtime'
try {
  if ($PSVersionTable.PSEdition -ne 'Core' -or $PSVersionTable.PSVersion.Major -lt 7) {
    throw 'unsupported-runtime'
  }
  $stage = 'compile'
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-process-usage.cs')
  $stage = 'observe'
  [Console]::WriteLine(([StagekeeperWorktreeUsage]::Inspect() | ConvertTo-Json -Depth 5 -Compress))
} catch {
  [Console]::WriteLine((@{version=1;profile=('windows-' + $stage + '-failed');principal='';supported=$false;unreadableCount=1;changedCount=0;expectedCount=0;afterCount=0;records=@()} | ConvertTo-Json -Compress))
}
