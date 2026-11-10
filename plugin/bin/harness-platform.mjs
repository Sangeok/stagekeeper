#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { installedMacosRuntime } from "../runtime/macos-runtime.mjs";

const tasks = { init: "harness-init.mjs", codex: "harness-codex.mjs", background: "harness-background.mjs", session: "harness-session.mjs",
  watch: "harness-watch.mjs", "template-guard": "harness-template-guard.mjs", "commit-guard": "harness-commit-guard.mjs" };
const [task, ...args] = process.argv.slice(2);
if (process.platform !== "darwin" || !Object.hasOwn(tasks, task)) throw new Error("Use a macOS helper task: init, codex, background, session, watch, template-guard or commit-guard");
let verified = false;
try { installedMacosRuntime(); verified = true; }
catch {
  console.log(JSON.stringify({ event: "error", code: "macos-package-invalid", reason: "The macOS runtime package is missing or changed. Reinstall the complete native package." }));
  process.exitCode = 1;
}
if (verified) {
  const target = new URL(tasks[task], import.meta.url);
  process.argv = [process.execPath, fileURLToPath(target), ...args];
  await import(target.href);
}
