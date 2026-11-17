using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

public static class StagekeeperWorktreeUsage {
  [StructLayout(LayoutKind.Sequential)]
  struct BasicInformation {
    public IntPtr Reserved1, Peb, Reserved2, Reserved3, Pid, Reserved4;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PebPrefix {
    public byte Reserved1, Reserved2, Debugged, Reserved3;
    public IntPtr Reserved4, Reserved5, Ldr, Parameters;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct UnicodeString {
    public ushort Length, MaximumLength;
    public IntPtr Buffer;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct ParametersPrefix {
    public uint MaximumLength, Length, Flags, DebugFlags;
    public IntPtr ConsoleHandle;
    public uint ConsoleFlags;
    public IntPtr StandardInput, StandardOutput, StandardError;
    public UnicodeString CurrentDirectory;
    public IntPtr CurrentDirectoryHandle;
  }
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool IsWow64Process2(IntPtr handle, out ushort processMachine, out ushort nativeMachine);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] bytes, UIntPtr length, out UIntPtr read);
  [DllImport("advapi32.dll", SetLastError=true)]
  static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)]
  static extern bool GetTokenInformation(IntPtr token, int type, IntPtr buffer, int length, out int needed);
  [DllImport("ntdll.dll")]
  static extern int NtQueryInformationProcess(IntPtr process, int type, out BasicInformation value, int size, out int returned);

  public sealed class Entry {
    public int pid { get; set; }
    public string startIdentity { get; set; }
    public string cwd { get; set; }
  }
  public sealed class Observation {
    public int version { get; set; } = 1;
    public string profile { get; set; } = "windows-20348-core7-current-sid-x64-v1";
    public string principal { get; set; } = "";
    public bool supported { get; set; }
    public int unreadableCount { get; set; }
    public int changedCount { get; set; }
    public int expectedCount { get; set; }
    public int afterCount { get; set; }
    public List<Entry> records { get; set; } = new List<Entry>();
  }

  static byte[] Read(IntPtr process, IntPtr address, int length) {
    if (address == IntPtr.Zero || length < 1 || length > 65536) throw new InvalidOperationException();
    byte[] bytes = new byte[length];
    UIntPtr read;
    if (!ReadProcessMemory(process, address, bytes, new UIntPtr((uint)length), out read)
      || read.ToUInt64() != (ulong)length) throw new InvalidOperationException();
    return bytes;
  }

  static T Structure<T>(IntPtr process, IntPtr address) where T : struct {
    byte[] bytes = Read(process, address, Marshal.SizeOf<T>());
    GCHandle pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
    try { return Marshal.PtrToStructure<T>(pinned.AddrOfPinnedObject()); }
    finally { pinned.Free(); }
  }

  static string Owner(IntPtr handle) {
    IntPtr token;
    if (!OpenProcessToken(handle, 8, out token)) throw new InvalidOperationException();
    try {
      int needed;
      GetTokenInformation(token, 1, IntPtr.Zero, 0, out needed);
      if (needed < IntPtr.Size || needed > 65536) throw new InvalidOperationException();
      IntPtr buffer = Marshal.AllocHGlobal(needed);
      try {
        if (!GetTokenInformation(token, 1, buffer, needed, out needed)) throw new InvalidOperationException();
        return new SecurityIdentifier(Marshal.ReadIntPtr(buffer)).Value;
      } finally { Marshal.FreeHGlobal(buffer); }
    } finally { CloseHandle(token); }
  }

  static long Created(IntPtr handle) {
    long created, exited, kernel, user;
    if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) throw new InvalidOperationException();
    return created;
  }

  static Dictionary<int, long> Inventory(Observation result) {
    var values = new Dictionary<int, long>();
    foreach (Process process in Process.GetProcesses()) {
      using (process) {
        int pid = process.Id;
        if (pid == 0 || pid == 4) continue;
        IntPtr handle = OpenProcess(0x1000, false, pid);
        if (handle == IntPtr.Zero) { result.unreadableCount++; continue; }
        try {
          if (Owner(handle) == result.principal) values.Add(pid, Created(handle));
        } catch { result.unreadableCount++; }
        finally { CloseHandle(handle); }
      }
    }
    return values;
  }

  static string CurrentDirectory(int pid, long expectedCreation) {
    IntPtr handle = OpenProcess(0x410, false, pid);
    if (handle == IntPtr.Zero) throw new InvalidOperationException();
    try {
      if (Created(handle) != expectedCreation) throw new InvalidOperationException();
      ushort machine, native;
      if (!IsWow64Process2(handle, out machine, out native) || machine != 0 || native != 0x8664) throw new InvalidOperationException();
      BasicInformation info;
      int returned;
      if (NtQueryInformationProcess(handle, 0, out info, Marshal.SizeOf<BasicInformation>(), out returned) != 0
        || returned != Marshal.SizeOf<BasicInformation>()) throw new InvalidOperationException();
      PebPrefix peb = Structure<PebPrefix>(handle, info.Peb);
      ParametersPrefix data = Structure<ParametersPrefix>(handle, peb.Parameters);
      if (data.Length < Marshal.SizeOf<ParametersPrefix>() || data.MaximumLength < data.Length
        || (data.Flags & 1) == 0 || data.CurrentDirectory.Length == 0
        || data.CurrentDirectory.Length > data.CurrentDirectory.MaximumLength
        || data.CurrentDirectory.Length % 2 != 0) throw new InvalidOperationException();
      byte[] bytes = Read(handle, data.CurrentDirectory.Buffer, data.CurrentDirectory.Length);
      ParametersPrefix again = Structure<ParametersPrefix>(handle, peb.Parameters);
      if (again.CurrentDirectory.Buffer != data.CurrentDirectory.Buffer
        || again.CurrentDirectory.Length != data.CurrentDirectory.Length) throw new InvalidOperationException();
      byte[] second = Read(handle, again.CurrentDirectory.Buffer, again.CurrentDirectory.Length);
      if (!Convert.ToBase64String(bytes).Equals(Convert.ToBase64String(second))) throw new InvalidOperationException();
      string cwd = new UnicodeEncoding(false, false, true).GetString(bytes);
      if (!Path.IsPathFullyQualified(cwd) || cwd.IndexOf('\0') >= 0) throw new InvalidOperationException();
      return cwd;
    } finally { CloseHandle(handle); }
  }

  public static Observation Inspect() {
    var result = new Observation();
    if (!Environment.Is64BitProcess || Environment.OSVersion.Version.Build != 20348) return result;
    result.principal = WindowsIdentity.GetCurrent().User.Value;
    using (var self = Process.GetCurrentProcess()) {
      string cwd = CurrentDirectory(self.Id, self.StartTime.ToUniversalTime().ToFileTimeUtc());
      if (!String.Equals(Path.GetFullPath(cwd).TrimEnd('\\'), Path.GetFullPath(Environment.CurrentDirectory).TrimEnd('\\'),
        StringComparison.OrdinalIgnoreCase)) return result;
    }
    result.supported = true;
    var before = Inventory(result);
    result.expectedCount = before.Count;
    foreach (var item in before) {
      try { result.records.Add(new Entry { pid = item.Key, startIdentity = item.Value.ToString(), cwd = CurrentDirectory(item.Key, item.Value) }); }
      catch { result.unreadableCount++; }
    }
    var after = Inventory(result);
    result.afterCount = after.Count;
    foreach (var item in before) {
      long observed;
      if (!after.TryGetValue(item.Key, out observed) || observed != item.Value) result.changedCount++;
    }
    foreach (var item in after) if (!before.ContainsKey(item.Key)) result.changedCount++;
    return result;
  }
}
