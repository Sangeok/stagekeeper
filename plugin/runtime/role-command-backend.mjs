import { createRoleCommands, installedWindowsRuntime, verifyNativeRuntime } from "./role-commands.mjs";
import { createMacosCommands, verifyMacosRuntime } from "./macos-commands.mjs";
import { installedMacosRuntime } from "./macos-runtime.mjs";

export function installedRoleRuntime() {
  if (process.platform === "win32") return installedWindowsRuntime();
  if (process.platform === "darwin") return installedMacosRuntime();
  throw new Error("No native role runtime for this operating system");
}

export function verifyRoleRuntime(runtime, lifecycle) {
  return runtime.format === "stagekeeper-macos-node-v1" ? verifyMacosRuntime(runtime, lifecycle) : verifyNativeRuntime(runtime, lifecycle);
}

export function createRoleCommandBackend(options, lifecycle) {
  return options.runtime.format === "stagekeeper-macos-node-v1" ? createMacosCommands(options, lifecycle) : createRoleCommands(options, lifecycle);
}
