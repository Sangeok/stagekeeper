param(
  [Parameter(Mandatory=$true, Position=0)][ValidateSet('init','codex','session','watch')][string]$Task,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments
)
$ErrorActionPreference = 'Stop'
$pluginPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimePath = Join-Path $pluginPath 'runtime/windows/node'
$nodePath = Join-Path $runtimePath 'node.exe'
try {
  $provenance = Get-Content -LiteralPath (Join-Path $runtimePath 'provenance.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($provenance.format -ne 'stagekeeper-windows-node-v1' -or $provenance.version -ne '22.23.3' -or $provenance.architecture -ne 'x64' -or
      $provenance.sourceSha256 -ne '9436c81b284889303d39f5b8bd629bf19e790c665ccb94b4994aa87220d9799a' -or
      (Get-Item -LiteralPath $nodePath).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or
      (Get-FileHash -LiteralPath $nodePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $provenance.executableSha256) { throw 'Runtime validation failed' }
} catch {
  [Console]::Error.WriteLine('Stagekeeper Windows package is missing or invalid. Report a packaging failure; do not install Node or WSL as a workaround.')
  exit 1
}
$entry = Join-Path $PSScriptRoot (@{init='harness-init.mjs';codex='harness-codex.mjs';session='harness-session.mjs';watch='harness-watch.mjs'}[$Task])
& $nodePath $entry @Arguments
exit $LASTEXITCODE
