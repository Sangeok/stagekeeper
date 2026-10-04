using System;
using System.IO;
using System.Text;
using System.ComponentModel;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

// Trusted launcher. Model code runs only after token and Job Object validation.
// All ACL changes concern a newly owned snapshot, never the user's repository.
public static class StagekeeperRoleProcess {
  public static string Stage = "validation", FailedStage = null;
  public sealed class Result {
    public uint exitCode;
    public uint maxActiveProcesses;
    public string status, stdout, stderr;
    public bool quiescent, outputTruncated;
  }
  [StructLayout(LayoutKind.Sequential)] struct JobBasicLimit { public long UserTime, JobTime; public uint Flags; public UIntPtr MinWorking, MaxWorking; public uint ActiveLimit; public UIntPtr Affinity; public uint Priority, Scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct JobExtendedLimit { public JobBasicLimit Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
  [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes { public int Length; public IntPtr Descriptor; public bool Inherit; }
  [StructLayout(LayoutKind.Sequential)] struct SecurityCapabilities { public IntPtr Sid, Capabilities; public uint Count, Reserved; }
  [StructLayout(LayoutKind.Sequential)] struct SidAndAttributes { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct StartupInfo {
    public int cb; public string reserved, desktop, title;
    public uint x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
    public short showWindow, reserved2; public IntPtr reservedPtr, stdin, stdout, stderr;
  }
  [StructLayout(LayoutKind.Sequential)] struct StartupInfoEx { public StartupInfo Info; public IntPtr Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInformation { public IntPtr Process, Thread; public uint Pid, Tid; }
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr capabilities, uint count, out IntPtr sid);
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
  [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
  [DllImport("kernelbase.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool DeriveCapabilitySidsFromName(string name, out IntPtr groups, out uint groupCount, out IntPtr capabilities, out uint capabilityCount);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr key, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string exe, StringBuilder args, IntPtr processSecurity, IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string cwd, ref StartupInfoEx startup, out ProcessInformation process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SecurityAttributes security, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr security, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int type, IntPtr information, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int type, IntPtr information, uint size, IntPtr returned);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int type, IntPtr information, uint size, out uint returned);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint QueryDosDevice(string device, StringBuilder target, int size);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool DefineDosDevice(uint flags, string name, string target);

  static void Check(bool success, string operation) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error(), operation); }
  static uint ActiveProcesses(IntPtr job) {
    IntPtr data = Marshal.AllocHGlobal(48);
    try { Check(QueryInformationJobObject(job, 1, data, 48, IntPtr.Zero), "job accounting"); return (uint)Marshal.ReadInt32(data, 40); }
    finally { Marshal.FreeHGlobal(data); }
  }
  static IntPtr TokenData(IntPtr token, int type) {
    uint size; GetTokenInformation(token, type, IntPtr.Zero, 0, out size);
    if (size == 0 || size > 65536) throw new Exception("Invalid token information size");
    IntPtr data = Marshal.AllocHGlobal((int)size);
    try { Check(GetTokenInformation(token, type, data, size, out size), "token information"); return data; }
    catch { Marshal.FreeHGlobal(data); throw; }
  }
  static void AuditToken(IntPtr process, SecurityIdentifier expected, SecurityIdentifier registryCapability) {
    IntPtr token; Check(OpenProcessToken(process, 8, out token), "process token");
    try {
      IntPtr flag = TokenData(token, 29), sid = TokenData(token, 31), caps = TokenData(token, 30);
      try {
        if (Marshal.ReadInt32(flag) != 1 || !new SecurityIdentifier(Marshal.ReadIntPtr(sid)).Equals(expected)) throw new Exception("AppContainer identity differs");
        int offset = IntPtr.Size == 8 ? 8 : 4;
        if (Marshal.ReadInt32(caps) != 1 || !new SecurityIdentifier(Marshal.ReadIntPtr(caps, offset)).Equals(registryCapability)) throw new Exception("Unexpected process capabilities");
      } finally { Marshal.FreeHGlobal(flag); Marshal.FreeHGlobal(sid); Marshal.FreeHGlobal(caps); }
    } finally { CloseHandle(token); }
  }
  static void Grant(string directory, SecurityIdentifier sid, FileSystemRights rights, bool inherit) {
    var acl = Directory.GetAccessControl(directory);
    acl.AddAccessRule(new FileSystemAccessRule(sid, rights, inherit ? InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit : InheritanceFlags.None, PropagationFlags.None, AccessControlType.Allow));
    Directory.SetAccessControl(directory, acl);
  }
  static string MapDrive(string root) {
    for (char letter = 'Z'; letter >= 'D'; letter--) {
      string name = letter + ":";
      if (QueryDosDevice(name, new StringBuilder(4096), 4096) != 0) continue;
      if (Marshal.GetLastWin32Error() != 2) throw new Win32Exception(Marshal.GetLastWin32Error(), "drive inventory");
      Check(DefineDosDevice(8, name, root), "private drive mapping");
      var target = new StringBuilder(4096);
      if (QueryDosDevice(name, target, 4096) == 0 || !String.Equals(target.ToString(), "\\??\\" + root, StringComparison.OrdinalIgnoreCase)) {
        DefineDosDevice(14, name, root); throw new Exception("Drive mapping changed");
      }
      return name;
    }
    throw new Exception("No unused drive letter");
  }
  sealed class Output {
    public int bytes, exceeded;
    public string Read(IntPtr handle) {
      var retained = new MemoryStream(); byte[] buffer = new byte[4096];
      using (var stream = new FileStream(new SafeFileHandle(handle, false), FileAccess.Read)) {
        int count;
        while ((count = stream.Read(buffer, 0, buffer.Length)) != 0) {
          int total = Interlocked.Add(ref bytes, count), available = Math.Max(0, Math.Min(count, 49152 - (total - count)));
          if (available != 0) retained.Write(buffer, 0, available);
          if (total > 49152) Interlocked.Exchange(ref exceeded, 1);
        }
      }
      var encoded = retained.ToArray();
      try { return new UTF8Encoding(false, true).GetString(encoded); }
      catch (DecoderFallbackException) { return Encoding.GetEncoding(System.Globalization.CultureInfo.CurrentCulture.TextInfo.OEMCodePage).GetString(encoded); }
    }
  }

  public static Result Run(string root, string command, string cwd, int timeoutMs) {
    if (!Path.IsPathRooted(root) || Path.GetFullPath(root) != root || root.StartsWith("\\\\") || timeoutMs < 100 || timeoutMs > 120000 || command == null || command.Length > 4096 || command.IndexOf('\0') >= 0) throw new Exception("Invalid role request");
    if (cwd == null || cwd.StartsWith("\\") || cwd.IndexOf(':') >= 0 || Array.Exists(cwd.Split('\\', '/'), part => part == ".." || part == ".")) throw new Exception("Invalid snapshot cwd");
    string repo = Path.Combine(root, "repo"), scratch = Path.Combine(root, "scratch"), runtime = Path.Combine(root, "runtime");
    foreach (string dir in new string[] { root, repo, scratch, runtime }) if ((File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0) throw new Exception("Snapshot alias refused");
    string name = "stagekeeper.role." + Guid.NewGuid().ToString("N"), drive = null;
    IntPtr sid = IntPtr.Zero, list = IntPtr.Zero, caps = IntPtr.Zero, optout = IntPtr.Zero, environment = IntPtr.Zero, groups = IntPtr.Zero, capabilitySids = IntPtr.Zero, capability = IntPtr.Zero;
    uint groupCount = 0, capabilityCount = 0;
    IntPtr inRead = IntPtr.Zero, inWrite = IntPtr.Zero, outRead = IntPtr.Zero, outWrite = IntPtr.Zero, errRead = IntPtr.Zero, errWrite = IntPtr.Zero, handles = IntPtr.Zero, job = IntPtr.Zero, limits = IntPtr.Zero;
    bool profile = false, listReady = false;
    var process = new ProcessInformation(); SecurityIdentifier identifier = null;
    var output = new Output(); int stopped = 0;
    try {
      Stage = "profile-create";
      int status = CreateAppContainerProfile(name, name, "Disposable Stagekeeper role", IntPtr.Zero, 0, out sid);
      if (status != 0) Marshal.ThrowExceptionForHR(status); profile = true; identifier = new SecurityIdentifier(sid);
      Stage = "snapshot-acl";
      Grant(root, identifier, FileSystemRights.ReadAttributes | FileSystemRights.ReadExtendedAttributes | FileSystemRights.Traverse | FileSystemRights.Synchronize, false);
      Grant(repo, identifier, FileSystemRights.Modify, true);
      Grant(scratch, identifier, FileSystemRights.Modify, true);
      Grant(runtime, identifier, FileSystemRights.ReadAndExecute, true);
      string boundary = Path.Combine(root, "boundary"); Directory.CreateDirectory(boundary);
      Grant(boundary, identifier, FileSystemRights.ReadAndExecute, false);
      string aapCanary = Path.Combine(boundary, "aap-only.txt");
      File.WriteAllText(aapCanary, "STAGEKEEPER_AAP_CANARY");
      var canaryAcl = File.GetAccessControl(aapCanary);
      canaryAcl.SetAccessRuleProtection(true, false);
      canaryAcl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User, FileSystemRights.FullControl, AccessControlType.Allow));
      canaryAcl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-15-2-1"), FileSystemRights.Read, AccessControlType.Allow));
      File.SetAccessControl(aapCanary, canaryAcl);
      Stage = "drive-map";
      drive = MapDrive(root);
      Stage = "stdio-pipes";
      var pipeSecurity = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)), Inherit = true };
      Check(CreatePipe(out inRead, out inWrite, ref pipeSecurity, 0), "stdin pipe");
      Check(CreatePipe(out outRead, out outWrite, ref pipeSecurity, 0), "stdout pipe");
      Check(CreatePipe(out errRead, out errWrite, ref pipeSecurity, 0), "stderr pipe");
      Check(SetHandleInformation(inWrite, 1, 0), "stdin inheritance"); Check(SetHandleInformation(outRead, 1, 0), "stdout inheritance"); Check(SetHandleInformation(errRead, 1, 0), "stderr inheritance");
      CloseHandle(inWrite); inWrite = IntPtr.Zero;
      Stage = "process-attributes";
      IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 3, 0, ref size);
      list = Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(list, 3, 0, ref size), "attributes"); listReady = true;
      handles = Marshal.AllocHGlobal(3 * IntPtr.Size); Marshal.WriteIntPtr(handles, inRead); Marshal.WriteIntPtr(handles, IntPtr.Size, outWrite); Marshal.WriteIntPtr(handles, 2 * IntPtr.Size, errWrite);
      Check(UpdateProcThreadAttribute(list, 0, new IntPtr(0x20002), handles, new IntPtr(3 * IntPtr.Size), IntPtr.Zero, IntPtr.Zero), "stdio handle list");
      Check(DeriveCapabilitySidsFromName("registryRead", out groups, out groupCount, out capabilitySids, out capabilityCount), "registry capability");
      if (capabilityCount != 1) throw new Exception("Registry capability identity differs");
      capability = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(SidAndAttributes)));
      Marshal.StructureToPtr(new SidAndAttributes { Sid = Marshal.ReadIntPtr(capabilitySids), Attributes = 4 }, capability, false);
      var security = new SecurityCapabilities { Sid = sid, Capabilities = capability, Count = 1 };
      caps = Marshal.AllocHGlobal(Marshal.SizeOf(security)); Marshal.StructureToPtr(security, caps, false);
      Check(UpdateProcThreadAttribute(list, 0, new IntPtr(0x20009), caps, new IntPtr(Marshal.SizeOf(security)), IntPtr.Zero, IntPtr.Zero), "capabilities");
      optout = Marshal.AllocHGlobal(4); Marshal.WriteInt32(optout, 1);
      Check(UpdateProcThreadAttribute(list, 0, new IntPtr(0x2000f), optout, new IntPtr(4), IntPtr.Zero, IntPtr.Zero), "AAP opt out");
      string windows = Environment.GetEnvironmentVariable("SystemRoot"), exe = Path.Combine(windows, "System32", "cmd.exe"), temporary = drive + "\\scratch";
      var variables = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
        { "APPDATA", temporary }, { "ComSpec", exe }, { "HOME", temporary }, { "LOCALAPPDATA", temporary },
        { "PATH", drive + "\\runtime;" + Path.Combine(windows, "System32") }, { "PATHEXT", ".COM;.EXE;.BAT;.CMD" },
        { "STAGEKEEPER_ROLE_SCRATCH", temporary }, { "STAGEKEEPER_ROLE_SNAPSHOT", "1" }, { "SystemRoot", windows },
        { "TEMP", temporary }, { "TMP", temporary }, { "USERPROFILE", temporary }, { "WINDIR", windows },
        { "npm_config_audit", "false" }, { "npm_config_cache", temporary + "\\npm-cache" }, { "npm_config_fund", "false" }
      };
      var env = new StringBuilder(); foreach (var pair in variables) env.Append(pair.Key).Append('=').Append(pair.Value).Append('\0'); env.Append('\0');
      environment = Marshal.StringToHGlobalUni(env.ToString());
      var startup = new StartupInfoEx(); startup.Info.cb = Marshal.SizeOf(startup); startup.Attributes = list;
      startup.Info.flags = 0x100; startup.Info.stdin = inRead; startup.Info.stdout = outWrite; startup.Info.stderr = errWrite;
      string working = drive + "\\repo" + (cwd.Length == 0 ? "" : "\\" + cwd);
      Stage = "process-create";
      Check(CreateProcessW(exe, new StringBuilder("\"" + exe + "\" /d /s /c \"" + command + "\""), IntPtr.Zero, IntPtr.Zero, true, 0x08000000 | 0x00080000 | 0x00000400 | 4, environment, working, ref startup, out process), "CreateProcess");
      Stage = "token-audit";
      AuditToken(process.Process, identifier, new SecurityIdentifier(Marshal.ReadIntPtr(capabilitySids)));
      Stage = "job-assign";
      job = CreateJobObjectW(IntPtr.Zero, null); if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "job");
      var jobLimits = new JobExtendedLimit(); jobLimits.Basic.Flags = 0x2000;
      limits = Marshal.AllocHGlobal(Marshal.SizeOf(jobLimits)); Marshal.StructureToPtr(jobLimits, limits, false);
      Check(SetInformationJobObject(job, 9, limits, (uint)Marshal.SizeOf(jobLimits)), "job limits"); Check(AssignProcessToJobObject(job, process.Process), "job assignment");
      var control = new Thread(() => { try { Console.In.ReadLine(); } finally { Interlocked.Exchange(ref stopped, 1); } }); control.IsBackground = true; control.Start();
      Stage = "process-resume";
      if (ResumeThread(process.Thread) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error(), "resume");
      CloseHandle(inRead); inRead = IntPtr.Zero; CloseHandle(outWrite); outWrite = IntPtr.Zero; CloseHandle(errWrite); errWrite = IntPtr.Zero;
      var outputTask = Task.Run(() => output.Read(outRead)); var errorTask = Task.Run(() => output.Read(errRead));
      var clock = System.Diagnostics.Stopwatch.StartNew(); string reason = "exited"; uint peak = 1;
      Stage = "job-execution";
      while (true) {
        peak = Math.Max(peak, ActiveProcesses(job));
        uint waiting = WaitForSingleObject(process.Process, 20);
        if (waiting == 0) break;
        if (waiting != 258) throw new Win32Exception(Marshal.GetLastWin32Error(), "process wait");
        if (Volatile.Read(ref stopped) != 0) reason = "stopped";
        else if (Volatile.Read(ref output.exceeded) != 0) reason = "output-limit";
        else if (clock.ElapsedMilliseconds >= timeoutMs) reason = "timeout";
        else continue;
        Check(TerminateJobObject(job, 124), "job cancellation"); break;
      }
      Check(TerminateJobObject(job, 124), "job finish");
      Stage = "job-quiescence";
      var end = System.Diagnostics.Stopwatch.StartNew();
      while (ActiveProcesses(job) != 0 && end.ElapsedMilliseconds < 5000) Thread.Sleep(20);
      if (ActiveProcesses(job) != 0 || WaitForSingleObject(process.Process, 5000) != 0) throw new Exception("Job is not quiescent");
      uint exitCode; Check(GetExitCodeProcess(process.Process, out exitCode), "exit code");
      if (!Task.WaitAll(new Task[] { outputTask, errorTask }, 5000)) throw new Exception("Output readers did not end");
      if (Volatile.Read(ref output.exceeded) != 0) reason = "output-limit";
      return new Result { exitCode = exitCode, maxActiveProcesses = peak, status = reason, stdout = outputTask.Result, stderr = errorTask.Result, quiescent = true, outputTruncated = output.exceeded != 0 };
    } catch { FailedStage = Stage; throw; } finally {
      if (job != IntPtr.Zero) { TerminateJobObject(job, 125); CloseHandle(job); }
      else if (process.Process != IntPtr.Zero) TerminateProcess(process.Process, 125);
      if (limits != IntPtr.Zero) Marshal.FreeHGlobal(limits);
      if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
      if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
      if (list != IntPtr.Zero) { if (listReady) DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list); }
      foreach (IntPtr value in new IntPtr[] { caps, optout, environment, handles, capability }) if (value != IntPtr.Zero) Marshal.FreeHGlobal(value);
      foreach (IntPtr handle in new IntPtr[] { inRead, inWrite, outRead, outWrite, errRead, errWrite }) if (handle != IntPtr.Zero) CloseHandle(handle);
      for (int i = 0; i < groupCount; i++) LocalFree(Marshal.ReadIntPtr(groups, i * IntPtr.Size)); if (groups != IntPtr.Zero) LocalFree(groups);
      for (int i = 0; i < capabilityCount; i++) LocalFree(Marshal.ReadIntPtr(capabilitySids, i * IntPtr.Size)); if (capabilitySids != IntPtr.Zero) LocalFree(capabilitySids);
      // Cleanup failure suppresses the acknowledgement, retaining owner fencing.
      Stage = "drive-cleanup";
      if (drive != null) Check(DefineDosDevice(14, drive, root), "drive cleanup");
      // Never propagate ACL updates through a tree that untrusted code could have
      // populated with reparse points. Its disposable grants disappear when the
      // owner deletes the verified root after this acknowledgement.
      if (sid != IntPtr.Zero) FreeSid(sid);
      Stage = "profile-cleanup";
      if (profile) { int status = DeleteAppContainerProfile(name); if (status != 0) Marshal.ThrowExceptionForHR(status); }
    }
  }
}
