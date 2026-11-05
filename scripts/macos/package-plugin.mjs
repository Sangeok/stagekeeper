import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installedMacosRuntime, macosDigest } from "../../plugin/runtime/macos-runtime.mjs";
import { verifierPackage } from "../../plugin/runtime/codex-agent.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const isShipped = name => name.startsWith("plugin/") && !name.startsWith("plugin/templates/") && !name.startsWith("plugin/evals/") && !name.endsWith(".test.mjs");

function inventory(directory) {
  const rows = [];
  function visit(current, relative = "") {
    for (const name of readdirSync(current).sort()) {
      const source = path.join(current, name), rel = path.join(relative, name), stat = lstatSync(source);
      if (stat.isSymbolicLink() || !stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) throw new Error("Plugin payload alias or type refused");
      if (stat.isDirectory()) visit(source, rel);
      else rows.push([rel.split(path.sep).join("/"), macosDigest(readFileSync(source)), stat.mode & 0o777]);
    }
  }
  visit(directory); return rows;
}

export function packageMacosPlugin({ output, runtimeDirectory }) {
  if (process.platform !== "darwin" || !path.isAbsolute(output) || existsSync(output)
    || path.relative(repository, output).split(path.sep)[0] !== "..") throw new Error("A new absolute output outside the repository on macOS is required");
  const runtime = installedMacosRuntime(runtimeDirectory), verifier = verifierPackage(path.join(repository, "plugin/skills/reconciling-proposals-with-codebase"));
  const files = execFileSync("git", ["ls-files", "--", "plugin"], { cwd: repository, encoding: "utf8" }).trim().split(/\r?\n/).filter(isShipped);
  mkdirSync(output, { recursive: true });
  for (const name of files) {
    const source = path.join(repository, name), target = path.join(output, name.slice("plugin/".length)), stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Plugin source type refused");
    mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, readFileSync(source), { flag: "wx", mode: stat.mode & 0o777 });
  }
  for (const needed of ["bin/harness", "bin/harness-platform.mjs", "runtime/macos-commands.mjs", "runtime/macos/role-process.mjs", "runtime/macos/sandbox-identity.c"]) {
    if (!existsSync(path.join(output, needed))) throw new Error("Stage the macOS plugin sources before packaging");
  }
  cpSync(runtime.directory, path.join(output, "runtime/macos/node"), { recursive: true, errorOnExist: true, force: false });
  const skill = "skills/reconciling-proposals-with-codebase";
  cpSync(path.join(output, skill), path.join(output, "codex", skill), { recursive: true, errorOnExist: true, force: false });
  for (const directory of [path.join(output, skill), path.join(output, "codex", skill)]) {
    if (verifierPackage(directory).checksum !== verifier.checksum) throw new Error("Packaged verifier checksum differs");
  }
  const hooksPath = path.join(output, "hooks/hooks.json"), hooks = JSON.parse(readFileSync(hooksPath, "utf8"));
  const guard = hooks.hooks.PreToolUse[0].hooks[0];
  if (guard.command !== "node" || guard.onFailure !== "block") throw new Error("Unexpected template hook contract");
  guard.command = "${CLAUDE_PLUGIN_ROOT}/bin/harness"; guard.args = ["template-guard"];
  writeFileSync(hooksPath, JSON.stringify(hooks, null, 2) + "\n");
  const rows = inventory(output), manifest = { format: "stagekeeper-macos-plugin-v1", architecture: runtime.architecture,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
    packageSha256: macosDigest(JSON.stringify(rows)), files: rows.length, runtimeSha256: runtime.executableSha256,
    verifier: { checksum: verifier.checksum, files: verifier.files }, inventory: rows };
  writeFileSync(path.join(output, "macos-package.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { path: realpathSync(output), files: rows.length, packageSha256: manifest.packageSha256, runtimeSha256: runtime.executableSha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!["--output", "--runtime"].includes(args[index]) || !args[index + 1] || Object.hasOwn(values, args[index])) throw new Error("Expected --output and --runtime");
    values[args[index]] = args[index + 1];
  }
  if (!values["--output"] || !values["--runtime"]) throw new Error("Output and runtime are required");
  console.log(JSON.stringify(packageMacosPlugin({ output: values["--output"], runtimeDirectory: values["--runtime"] })));
}
