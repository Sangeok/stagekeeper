import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { dryRunHelper, openDryRunObserver } from "./codex-init-eval-observer.mjs";

const dryRunHelperPath = path.join(import.meta.dirname, dryRunHelper);

export function initEvalConfiguration({ repo, packageRoot, environment, observerUrl, observationDirectory }) {
  const filesystem = { ":root": "deny", ":minimal": "read", "/System/Library/Perl": "read", "/Library/Perl": "read", "/System/Library/OpenSSL": "read", [repo]: "write", [path.join(repo, ".git")]: "read", [packageRoot]: "read", [path.join(homedir(), ".codex")]: "deny" };
  filesystem[dryRunHelperPath] = "read";
  if (observationDirectory) filesystem[observationDirectory] = "deny";
  const shellEnvironment = {
    PATH: `${path.dirname(dryRunHelperPath)}:${environment.PATH}`,
    HARNESS_SERVER: environment.HARNESS_SERVER,
    HARNESS_TOKEN: environment.HARNESS_TOKEN,
    STAGEKEEPER_EVAL_LAUNCHER: path.join(packageRoot, "bin/harness"),
    STAGEKEEPER_EVAL_REPO: repo,
    ...(observerUrl ? { STAGEKEEPER_EVAL_OBSERVER: observerUrl } : {}),
  };
  const config = ['approval_policy="never"', 'forced_login_method="chatgpt"', 'model_provider="openai"', 'agents.enabled=false', 'features.apps=false', 'features.hooks=false', 'features.memories=false', 'features.goals=false', 'features.multi_agent=false', 'features.view_image=false', 'features.unified_exec=false', 'features.shell_tool=true', 'features.request_permissions_tool=false', 'features.code_mode.enabled=false', 'web_search="disabled"', 'project_doc_max_bytes=0', 'default_permissions="init-eval"', 'permissions.init-eval.extends=":read-only"', 'permissions.init-eval.network.enabled=true', 'shell_environment_policy.inherit="none"',
      ...Object.entries(shellEnvironment).map(([key, value]) => `shell_environment_policy.set.${key}=${JSON.stringify(value)}`),
      `permissions.init-eval.filesystem={${Object.entries(filesystem).map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`).join(",")}}`];
  const env = Object.fromEntries(["HOME", "PATH", "TMPDIR", "USER", "LOGNAME", "LANG"].flatMap(key => environment[key] ? [[key, environment[key]]] : []));
  return { config, env };
}

function launcherIdentity(packageRoot, incomplete) {
  const launcher = path.join(packageRoot, "bin/harness");
  if (incomplete) {
    if (existsSync(launcher) || existsSync(path.join(packageRoot, "macos-package.json"))) throw new Error("Unexpected complete eval package");
    return null;
  }
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, "macos-package.json"), "utf8"));
  const inventoryHash = createHash("sha256").update(JSON.stringify(manifest.inventory)).digest("hex");
  const entry = manifest.inventory.find(([name]) => name === "bin/harness");
  const digest = createHash("sha256").update(readFileSync(launcher)).digest("hex");
  const stat = lstatSync(launcher);
  if (manifest.format !== "stagekeeper-macos-plugin-v1" || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision)
    || manifest.packageSha256 !== inventoryHash || !entry || entry[1] !== digest || entry[2] !== (stat.mode & 0o777)
    || !stat.isFile() || !(stat.mode & 0o111) || realpathSync(launcher) !== path.join(realpathSync(packageRoot), "bin/harness")) {
    throw new Error("Unverified native eval launcher");
  }
  return { sourceCommit: manifest.sourceRevision, packageSha256: manifest.packageSha256, launcherSha256: digest };
}

export async function observedInitTurn(options, turn, run) {
  const { AppServer } = await import("../../../plugin/runtime/codex-thread.mjs");
  const { repo, packageRoot, work, cli } = options;
  const target = launcherIdentity(packageRoot, turn.name === "incomplete-package");
  const observationDirectory = work && path.join(realpathSync(work), "private-observations");
  if (observationDirectory) {
    mkdirSync(observationDirectory, { recursive: true, mode: 0o700 });
    if (!lstatSync(observationDirectory).isDirectory()) throw new Error("eval-observation-unverified");
  }
  const canary = observationDirectory && path.join(observationDirectory, `probe-${turn.id}`);
  const observer = await openDryRunObserver({ ...turn, target });
  let server, value, observation, canaryCreated = false, verified = false;
  try {
    if (canary) {
      writeFileSync(canary, turn.id, { flag: "wx", mode: 0o600 });
      canaryCreated = true;
    }
    const { config, env } = initEvalConfiguration({ ...options, observerUrl: observer.url, observationDirectory });
    const child = spawn(cli.executable, [...cli.prefix, ...config.flatMap(v => ["-c", v]), "app-server", "--stdio", "--strict-config"], {
      cwd: repo, env, stdio: ["pipe", "pipe", "pipe"],
    });
    server = new AppServer(child);
    await server.request("initialize", { clientInfo: { name: "stagekeeper-init-eval-observer", version: "1" } });

    const probe = async () => {
      let script = `command -v ${dryRunHelper} && ${dryRunHelper} --check-observer`;
      if (canary) {
        if (readFileSync(canary, "utf8") !== turn.id) throw new Error("eval-observation-unverified");
        script = 'if /bin/cat "$1" >/dev/null 2>&1 || ( : >> "$1" ) 2>/dev/null; then exit 125; fi\n' + script;
      }
      const result = await server.request("command/exec", {
        command: ["/bin/zsh", "-lc", script, "observer-probe", ...(canary ? [canary] : [])],
        cwd: repo, timeoutMs: 10000, outputBytesCap: 2048,
      }, 15000).catch(() => null);
      if (result?.exitCode !== 0 || result.stderr || result.stdout !== `${dryRunHelperPath}\n${turn.id}\n`) {
        throw new Error("eval-observation-unverified");
      }
    };
    await probe();
    const runNative = () => server.request("command/exec", {
      command: [path.join(packageRoot, "bin/harness"), "init", "--client", "codex", "--dry-run", "--root", repo],
      cwd: repo, timeoutMs: 60000, outputBytesCap: 131072,
    }, 65000);
    observer.begin(target ? runNative : null);
    value = await run({ server, config, env });
    observer.seal();
    await probe();
    verified = true;
  } finally {
    observer.seal();
    try {
      observation = await observer.close(verified);
      if (observationDirectory) {
        const file = path.join(observationDirectory, `${turn.name}-${turn.repetition}.json`);
        writeFileSync(file, JSON.stringify(observation), { flag: "wx", mode: 0o600 });
      }
    } finally {
      try { await server?.close(); }
      finally { if (canaryCreated) rmSync(canary, { force: true }); }
    }
  }
  if (!observation.complete) throw new Error("eval-observation-unverified");
  return { value, observation };
}
