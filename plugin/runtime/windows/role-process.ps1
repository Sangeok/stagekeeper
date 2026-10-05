param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference = 'Stop'
# TEMPORARY ci-timing-probe (never merge): elapsed milliseconds per helper phase.
$probeClock = [Diagnostics.Stopwatch]::StartNew()
$probe = [ordered]@{ psStartupMs = [int]([DateTime]::Now - [Diagnostics.Process]::GetCurrentProcess().StartTime).TotalMilliseconds }
function Probe-Mark([string]$name) { $probe[$name] = $probeClock.ElapsedMilliseconds; $probeClock.Restart() }
# Candidate fix under test: load the two core modules this helper uses from
# $PSHOME by absolute path, so the first cmdlet does not trigger auto-load
# discovery across every module directory on the host.
Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1"
Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
Probe-Mark 'importMs'
$phase = 'request'
try {
  $request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Probe-Mark 'requestMs'
  # The owner registers this helper before granting permission to start a child.
  if ([Console]::In.ReadLine() -ne 'start') { throw 'Owner did not activate the helper' }
  Probe-Mark 'activationWaitMs'
  $phase = 'compile'
  $compilerPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'compiler'))
  if (-not $compilerPath.StartsWith([IO.Path]::GetFullPath($PSScriptRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Compiler scope differs' }
  [IO.Directory]::CreateDirectory($compilerPath) | Out-Null
  $env:TEMP = $compilerPath
  $env:TMP = $compilerPath
  Add-Type -Path (Join-Path $PSScriptRoot 'RoleProcess.cs')
  Probe-Mark 'addTypeMs'
  # CodeDOM creates protected temporary directories on Windows Server. The
  # compiling process removes only its verified compiler directory before any
  # untrusted process/ACL exists. Never rewrite/delete a role-populated tree here.
  $phase = 'compiler-cleanup'
  [IO.Directory]::Delete($compilerPath, $true)
  Probe-Mark 'compilerCleanupMs'
  $phase = 'launch'
  $result = [StagekeeperRoleProcess]::Run($request.root, $request.command, $request.cwd, $request.timeoutMs)
  Probe-Mark 'runMs'
  $probe.runStages = [StagekeeperRoleProcess]::FinishTimings()
  $result | Add-Member -NotePropertyName probe -NotePropertyValue ([pscustomobject]$probe)
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
