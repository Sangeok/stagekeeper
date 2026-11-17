using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class StagekeeperDirectoryProbe {
  [StructLayout(LayoutKind.Sequential)]
  struct IoStatus {
    public IntPtr Status;
    public UIntPtr Information;
  }

  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security,
    uint disposition, uint flags, IntPtr template);
  [DllImport("ntdll.dll")]
  static extern int NtQueryInformationFile(SafeFileHandle file, out IoStatus status,
    IntPtr buffer, uint length, int informationClass);

  public sealed class Result {
    public bool deleteAccessOpened { get; set; }
    public int deleteAccessError { get; set; }
    public int queryOpenError { get; set; }
    public string queryStatus { get; set; } = "not-run";
    public List<int> pids { get; set; } = new List<int>();
  }

  static SafeFileHandle Open(string path, uint access, uint share) {
    return CreateFileW(path, access, share, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
  }

  public static Result Inspect(string path) {
    var result = new Result();
    using (var file = Open(path, 0x10000, 7)) {
      result.deleteAccessError = file.IsInvalid ? Marshal.GetLastWin32Error() : 0;
      result.deleteAccessOpened = !file.IsInvalid;
    }
    using (var file = Open(path, 0x80, 7)) {
      if (file.IsInvalid) { result.queryOpenError = Marshal.GetLastWin32Error(); return result; }
      IntPtr buffer = Marshal.AllocHGlobal(65536);
      try {
        IoStatus io;
        int status = NtQueryInformationFile(file, out io, buffer, 65536, 47);
        result.queryStatus = unchecked((uint)status).ToString("X8");
        if (status != 0) return result;
        ulong length = io.Information.ToUInt64();
        if (length < 4 || length > 65536) throw new InvalidOperationException("invalid-length");
        int count = Marshal.ReadInt32(buffer);
        if (count < 0 || count > (65536 - IntPtr.Size) / IntPtr.Size
          || count > 0 && (ulong)(IntPtr.Size + count * IntPtr.Size) > length)
          throw new InvalidOperationException("invalid-count");
        for (int index = 0; index < count; index++) {
          long pid = Marshal.ReadIntPtr(buffer, IntPtr.Size + index * IntPtr.Size).ToInt64();
          if (pid < 0 || pid > Int32.MaxValue) throw new InvalidOperationException("invalid-pid");
          if (pid != Environment.ProcessId) result.pids.Add((int)pid);
        }
      } finally { Marshal.FreeHGlobal(buffer); }
    }
    return result;
  }

  public static void Hold(string path, bool deleteAccess) {
    using (var file = Open(path, deleteAccess ? 0x10000u : 1u, deleteAccess ? 7u : 3u)) {
      if (file.IsInvalid) throw new InvalidOperationException("hold-open-" + Marshal.GetLastWin32Error());
      Console.WriteLine("{\"ready\":true}");
      Console.Out.Flush();
      if (!Console.In.ReadLineAsync().Wait(TimeSpan.FromSeconds(15))) throw new TimeoutException("hold-timeout");
    }
  }
}
