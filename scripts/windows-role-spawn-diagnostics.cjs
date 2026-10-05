// Opt-in build diagnostics for the bundled Node runtime. Observe failures;
// never change the executable, options, error or permission decision.
if (process.platform === "win32" && process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1"
  && process.env.STAGEKEEPER_BUILD_DIAGNOSTICS === "1") {
  const { ChildProcess } = process.getBuiltinModule("child_process");
  const { errorMonitor } = process.getBuiltinModule("events");
  const path = process.getBuiltinModule("path");
  const originalSpawn = ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn = function (options) {
    let reported = false;
    const report = error => {
      if (reported) return;
      reported = true;
      const args = options.args ?? [];
      const file = options.file ?? "";
      const name = path.basename(file).toLowerCase();
      // Fixed classifications only: no command bodies, paths or environment.
      console.error(JSON.stringify({
        event: "windows-role-spawn-failed",
        code: ["EPERM", "EACCES", "ENOENT"].includes(error?.code) ? error.code : "other",
        executable: ["node.exe", "cmd.exe", "git.exe", "git"].includes(name) ? name : "other",
        currentNode: file.toLowerCase() === process.execPath.toLowerCase(),
        sameDrive: path.parse(file).root.toLowerCase() === path.parse(process.cwd()).root.toLowerCase(),
        nextWorker: args.some(arg => typeof arg === "string" && /[\\/]next[\\/]dist[\\/]compiled[\\/]jest-worker[\\/]processChild\.js$/.test(arg)),
        argumentCount: args.length,
        stdio: options.stdio?.map(stream => stream.type),
        detached: options.detached === true,
        windowsHide: options.windowsHide === true,
        windowsVerbatimArguments: options.windowsVerbatimArguments === true,
      }));
    };
    this.once(errorMonitor, report);
    try { return originalSpawn.call(this, options); }
    catch (error) {
      this.removeListener(errorMonitor, report);
      report(error);
      throw error;
    }
  };
}
