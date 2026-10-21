param([Parameter(Mandatory=$true)][string]$RequestPath)
# 상주 실행기의 `claude -p` 하나를 kill-on-close job 안에서 띄운다(제안서 B-3, 결정 B3).
# 이 런처가 어떤 이유로 끝나도 job handle이 닫히며 kernel이 job 안의 프로세스를 모두 끝낸다 — claude.exe와
# 그것이 띄운 도구 셸까지. job은 breakaway를 허용하지 않는다. 상주 프로세스가 먼저 끝나도 job을 끝낸다.
$ErrorActionPreference = 'Stop'
$phase = 'modules'
try {
  # role-process.ps1과 같은 이유로 쓰는 모듈만 $PSHOME에서 직접 읽는다(첫 cmdlet의 모듈 자동 로드가 느리다).
  Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1"
  Import-Module "$PSHOME\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1"
  $phase = 'request'
  $request = Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  # 상주 프로세스의 handle을 먼저 잡는다 — pid가 재사용돼도 다른 프로세스와 헷갈리지 않게.
  $owner = [Diagnostics.Process]::GetProcessById([int]$request.resident)
  $phase = 'job'
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class StagekeeperRunnerJob {
  const int JobObjectExtendedLimitInformation = 9;
  const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit { public long UserTime, JobTime; public uint Flags; public UIntPtr MinWorking, MaxWorking; public uint ActiveLimit; public UIntPtr Affinity; public uint Priority, Scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit { public BasicLimit Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr security, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, IntPtr information, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  // kill-on-close만 켠 job을 만들고 이 프로세스를 넣는다. 이후 자식은 모두 이 job에 들어간다.
  public static IntPtr Enter() {
    IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "job");
    var limits = new ExtendedLimit(); limits.Basic.Flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    int size = Marshal.SizeOf(limits);
    IntPtr buffer = Marshal.AllocHGlobal(size);
    try {
      Marshal.StructureToPtr(limits, buffer, false);
      if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, buffer, (uint)size)) throw new Win32Exception(Marshal.GetLastWin32Error(), "job limits");
    } finally { Marshal.FreeHGlobal(buffer); }
    if (!AssignProcessToJobObject(job, GetCurrentProcess())) throw new Win32Exception(Marshal.GetLastWin32Error(), "job assignment");
    return job;
  }
  // job 안의 모든 프로세스를 끝낸다. 이 런처도 job 안에 있으므로 code로 함께 끝난다.
  public static void Terminate(IntPtr job, uint code) { TerminateJobObject(job, code); }
}
'@
  $job = [StagekeeperRunnerJob]::Enter()
  $phase = 'launch'
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = [string]$request.executable
  $info.Arguments = [string]$request.arguments
  $info.WorkingDirectory = [string]$request.cwd
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $proc = [Diagnostics.Process]::Start($info)
  # stdin을 닫는다 — 열어 두면 `claude -p`가 3초를 기다린다(spike).
  $proc.StandardInput.Close()
  $stdout = [Console]::OpenStandardOutput()
  $stderr = [Console]::OpenStandardError()
  $copyOut = $proc.StandardOutput.BaseStream.CopyToAsync($stdout)
  $copyErr = $proc.StandardError.BaseStream.CopyToAsync($stderr)
  $phase = 'wait'
  $code = 1
  while ($true) {
    if ($proc.WaitForExit(1000)) { $proc.WaitForExit(); $code = $proc.ExitCode; break }
    if ($owner.HasExited) { break }
  }
  # 도구 셸이 stdout을 물려받았으면 파이프가 닫히지 않는다 — 조금만 기다리고 job을 끝낸다.
  [void]$copyOut.Wait(5000)
  [void]$copyErr.Wait(5000)
  $stdout.Flush()
  $stderr.Flush()
  [StagekeeperRunnerJob]::Terminate($job, [uint32]([int64]$code -band 0xFFFFFFFFL))
  exit $code
} catch {
  $failure = $_.Exception
  while ($failure.InnerException) { $failure = $failure.InnerException }
  # 고정된 단계와 숫자만 남긴다. 명령·경로 본문은 싣지 않는다.
  $diagnostic = [ordered]@{ error = 'job-launch-failed'; stage = $phase; hresult = $failure.HResult }
  if ($failure -is [ComponentModel.Win32Exception]) { $diagnostic.nativeErrorCode = $failure.NativeErrorCode }
  [Console]::Error.WriteLine(($diagnostic | ConvertTo-Json -Compress))
  exit 1
}
