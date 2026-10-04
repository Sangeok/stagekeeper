param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
$phase = 'request'
try {
  $request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  # The owner registers this helper before granting permission to start a child.
  if ([Console]::In.ReadLine() -ne 'start') { throw 'Owner did not activate the helper' }
  $phase = 'compile'
  Add-Type -Path (Join-Path $PSScriptRoot 'RoleProcess.cs')
  $phase = 'launch'
  $result = [StagekeeperRoleProcess]::Run($request.root, $request.command, $request.cwd, $request.timeoutMs)
  $result | Add-Member -NotePropertyName nonce -NotePropertyValue $request.nonce
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  [Console]::WriteLine(($result | ConvertTo-Json -Compress))
} catch {
  $failure = $_.Exception
  while ($failure.InnerException) { $failure = $failure.InnerException }
  if ($phase -eq 'launch') { $phase = [StagekeeperRoleProcess]::FailedStage; if (-not $phase) { $phase = [StagekeeperRoleProcess]::Stage } }
  # Numeric diagnostics and fixed stages only. Never reflect command/path bodies.
  $diagnostic = [ordered]@{ error='native-helper-failed'; stage=$phase; hresult=$failure.HResult }
  if ($failure -is [ComponentModel.Win32Exception]) { $diagnostic.nativeErrorCode = $failure.NativeErrorCode }
  [Console]::Error.WriteLine(($diagnostic | ConvertTo-Json -Compress))
  exit 1
}
