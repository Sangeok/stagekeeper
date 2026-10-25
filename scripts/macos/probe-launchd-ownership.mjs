import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("A real macOS kernel is required");
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error("A new evidence JSON path is required");
const parent = fs.realpathSync(os.tmpdir());
const root = fs.realpathSync(fs.mkdtempSync(path.join(parent, "stagekeeper-launchd-")));
fs.chmodSync(root, 0o700);
const source = fileURLToPath(new URL("./probe-launchd-ownership.c", import.meta.url));
const binary = path.join(root, "launchd-probe");
const digest = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const options = { encoding: "utf8", timeout: 40000, maxBuffer: 1024 * 1024 };
execFileSync("/usr/bin/xcrun", ["clang", "-std=c11", "-Wall", "-Wextra", "-Werror", source, "-o", binary], options);
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const scenarios = ["root-exit", "service-sigkill", "bootout", "timeout-bootout", "fork-during-bootout"];
const domains = [], observations = [];
for (const kind of ["user", "gui"]) {
  const domain = `${kind}/${process.getuid()}`;
  const discovery = spawnSync("/bin/launchctl", ["print", domain], options);
  assert.ifError(discovery.error);
  domains.push({ kind, available: discovery.status === 0 });
  if (discovery.status !== 0) {
    assert.notEqual(kind, "user", "The ordinary user launchd domain is required");
    continue;
  }
  for (const scenario of scenarios) {
    const directory = path.join(root, `${kind}-${scenario}`);
    fs.mkdirSync(directory, { mode: 0o700 });
    const label = `com.stagekeeper.ownership-probe.${randomUUID()}`;
    const target = `${domain}/${label}`;
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${escape(binary)}</string><string>worker</string><string>${scenario}</string></array>
<key>WorkingDirectory</key><string>${escape(directory)}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><false/>
<key>AbandonProcessGroup</key><false/><key>ExitTimeOut</key><integer>1</integer>
<key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
`;
    fs.writeFileSync(path.join(directory, "job.plist"), plist, { flag: "wx", mode: 0o600 });
    try {
      const result = JSON.parse(execFileSync(binary, [domain, target, scenario], { ...options, cwd: directory }));
      assert.equal(result.scenario, scenario);
      for (const key of ["ordinaryUser", "rootExitObserved", "sameGroupExitObserved", "serviceBootoutSucceeded", "ownedFixtureProcessesExited"]) assert.equal(result[key], true);
      assert.equal(result.detachedSurvivorsAfterBootout, scenario === "fork-during-bootout" ? 3 : 2);
      assert.equal(result.fixtureExitEvents, result.registeredProcesses);
      const absent = spawnSync("/bin/launchctl", ["print", target], options);
      assert.ifError(absent.error);
      assert.notEqual(absent.status, 0, "The owned launchd service must be removed");
      observations.push({ domain: kind, ...result, serviceAbsentAfterCleanup: true });
    } finally {
      spawnSync("/bin/launchctl", ["bootout", target], options);
    }
  }
}
const result = {
  schema: 1, platform: process.platform, arch: process.arch, release: os.release(), node: process.version,
  sourceSha256: digest(source), binarySha256: digest(binary),
  sdk: execFileSync("/usr/bin/xcrun", ["--show-sdk-version"], options).trim(), domains, observations,
  scope: "ordinary-user launchd lifecycle counterexamples; cooperative fixture oracle and cleanup only; no client authentication or production backend",
  verdict: "BLOCKED_LAUNCHD_JOB_REMOVAL_NOT_DESCENDANT_QUIESCENCE", productionBackendEnabled: false,
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
assert.equal(path.dirname(root), parent);
assert.ok(path.basename(root).startsWith("stagekeeper-launchd-"));
fs.rmSync(root, { recursive: true });
console.log(JSON.stringify({ verdict: result.verdict, arch: result.arch, scenarios: observations.length, ownedFixtureProcessesExited: true }));
