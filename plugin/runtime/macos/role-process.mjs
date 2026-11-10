import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { commandProfile, endSandbox, readCommandIdentity } from "./sandbox.mjs";

const requestPath = process.argv[2], initial = JSON.parse(readFileSync(requestPath, "utf8"));
const request = readCommandIdentity(initial.root, initial.nonce);
const scanner = path.join(request.runtime, "sandbox-identity");
let child, launched = false, finishing = false, stopped = false, reason = null, timer;
const output = { stdout: "", stderr: "" };
let bytes = 0, truncated = false;
const stop = status => {
  stopped = true; reason ??= status;
  if (launched) void finish(-1);
  else process.exitCode = 1;
};
const finish = async code => {
  if (finishing) return;
  finishing = true; clearTimeout(timer);
  try {
    const termination = endSandbox(request.root, request.nonce, scanner);
    child?.stdout.destroy(); child?.stderr.destroy();
    process.stdout.write(JSON.stringify({ nonce: request.nonce, status: reason ?? "exited", exitCode: Number.isInteger(code) ? code : -1,
      ...output, outputTruncated: truncated, ...termination }) + "\n");
  } catch (error) {
    process.stderr.write(String(error.message).slice(0, 500) + "\n"); process.exitCode = 1;
  } finally { process.stdin.destroy(); }
};
const collect = name => chunk => {
  bytes += chunk.length;
  if (bytes > 128 * 1024) { truncated = true; stop("output-limit"); return; }
  output[name] += chunk.toString("utf8");
};
const launch = () => {
  if (launched || stopped) return;
  launched = true;
  const scratch = path.join(request.root, "scratch"), repo = path.join(request.root, "repo");
  const env = { PATH: `${request.runtime}/bin:/usr/bin:/bin`, HOME: scratch, TMPDIR: scratch, TMP: scratch, TEMP: scratch,
    LANG: "C", LC_ALL: "C", STAGEKEEPER_ROLE_SCRATCH: scratch, STAGEKEEPER_ROLE_SNAPSHOT: "1", npm_config_cache: path.join(scratch, "npm-cache"),
    npm_config_offline: "true", npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false",
    npm_config_userconfig: path.join(scratch, "empty-user-npmrc"), npm_config_globalconfig: path.join(scratch, "empty-global-npmrc") };
  child = spawn("/usr/bin/sandbox-exec", ["-p", commandProfile(request.root, request.runtime, request.allowed, request.denied), "/bin/sh", "-c", request.command],
    { cwd: path.join(repo, request.cwd), env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", collect("stdout")); child.stderr.on("data", collect("stderr"));
  child.once("error", () => { reason = "stopped"; void finish(-1); });
  child.once("exit", code => { void finish(code); });
  timer = setTimeout(() => stop("timeout"), request.timeoutMs);
  process.stdout.write("__stagekeeper_native_started__\r\n");
};
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
  if (input.length > 64) { stop("stopped"); return; }
  const lines = input.split("\n"); input = lines.pop();
  for (const line of lines) { if (line === "start") launch(); else stop("stopped"); }
});
process.stdin.once("end", () => stop("stopped"));
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => stop("stopped"));
