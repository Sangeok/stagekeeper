param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
$phase = 'modules'
try {
  # Load the only modules this helper uses from $PSHOME by absolute path. Resolving
  # the first cmdlet through module auto-loading took about 21 s per helper on
  # hosted Windows Server runners; this also keeps host module paths out of it.
  Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1"
  Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
  $phase = 'request'
  $request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  # The owner registers this helper before granting permission to start a child.
  if ([Console]::In.ReadLine() -ne 'start') { throw 'Owner did not activate the helper' }
  $phase = 'compile'
  $compilerPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'compiler'))
  if (-not $compilerPath.StartsWith([IO.Path]::GetFullPath($PSScriptRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Compiler scope differs' }
  [IO.Directory]::CreateDirectory($compilerPath) | Out-Null
  $env:TEMP = $compilerPath
  $env:TMP = $compilerPath
  Add-Type -Path (Join-Path $PSScriptRoot 'RoleProcess.cs')
  # CodeDOM creates protected temporary directories on Windows Server. The
  # compiling process removes only its verified compiler directory before any
  # untrusted process/ACL exists. Never rewrite/delete a role-populated tree here.
  $phase = 'compiler-cleanup'
  [IO.Directory]::Delete($compilerPath, $true)
  $phase = 'launch'
  # Prepare grants the role SID on the still-empty snapshot roots before the owner copies files.
  if ($request.mode -eq 'prepare') { $result = [StagekeeperRoleProcess]::Prepare($request.root, $request.profile) }
  else { $result = [StagekeeperRoleProcess]::Run($request.root, $request.profile, $request.sid, $request.command, $request.cwd, $request.timeoutMs) }
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
