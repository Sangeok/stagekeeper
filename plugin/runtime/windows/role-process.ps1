param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
try {
  $request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  # The owner registers this helper before granting permission to start a child.
  if ([Console]::In.ReadLine() -ne 'start') { throw 'Owner did not activate the helper' }
  Add-Type -Path (Join-Path $PSScriptRoot 'RoleProcess.cs')
  $result = [StagekeeperRoleProcess]::Run($request.root, $request.command, $request.cwd, $request.timeoutMs)
  $result | Add-Member -NotePropertyName nonce -NotePropertyValue $request.nonce
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  [Console]::WriteLine(($result | ConvertTo-Json -Compress))
} catch {
  [Console]::Error.WriteLine('Native role execution failed; ownership retained')
  exit 1
}
