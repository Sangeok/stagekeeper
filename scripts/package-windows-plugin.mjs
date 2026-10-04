import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installedWindowsRuntime } from "../plugin/runtime/role-commands.mjs";
import { verifierPackage } from "../plugin/runtime/codex-agent.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function regularTree(directory) {
  const files = [];
  function visit(current, relative = "") {
    if (lstatSync(current).isSymbolicLink()) throw new Error("Package directory alias refused");
    for (const name of readdirSync(current).sort()) {
      const source = path.join(current, name), rel = path.join(relative, name), stat = lstatSync(source);
      if (stat.isSymbolicLink() || !stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1)) throw new Error("Package file alias or type refused");
      if (stat.isDirectory()) visit(source, rel); else files.push([rel.split(path.sep).join("/"), digest(readFileSync(source))]);
    }
  }
  visit(directory); return files;
}

// Produces a private, reviewable install directory; it never uploads/publishes it.
// The verifier comes only from the unchanged complete owner package, not auth files.
export function packageWindowsPlugin({ output, runtimeDirectory, verifierDirectory }) {
  if (!path.isAbsolute(output) || existsSync(output) || path.relative(repository, output).split(path.sep)[0] !== "..") throw new Error("A new output directory outside the repository is required");
  const runtime = installedWindowsRuntime(runtimeDirectory), verifier = verifierPackage(verifierDirectory);
  regularTree(path.dirname(verifier.path));
  const runtimeRows = regularTree(runtime.directory).filter(([name]) => name !== "provenance.json");
  if (digest(JSON.stringify(runtimeRows)) !== runtime.packageSha256 || digest(readFileSync(path.join(runtime.directory, "node.exe"))) !== runtime.executableSha256) throw new Error("Runtime build artifact changed");
  const source = execFileSync("git", ["ls-files", "--", "plugin"], { cwd: repository, encoding: "utf8" }).trim().split(/\r?\n/);
  mkdirSync(output);
  for (const name of source) {
    if (name.startsWith("plugin/templates/") || name.endsWith(".test.mjs")) continue;
    const sourceFile = path.join(repository, name), target = path.join(output, name.slice("plugin/".length));
    if (!lstatSync(sourceFile).isFile() || lstatSync(sourceFile).isSymbolicLink()) throw new Error("Plugin source type refused");
    mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, readFileSync(sourceFile), { flag: "wx" });
  }
  const packagedRuntime = path.join(output, "runtime/windows/node");
  cpSync(runtime.directory, packagedRuntime, { recursive: true, errorOnExist: true, force: false });
  const verifierRoot = path.dirname(verifier.path);
  for (const destination of ["codex/skills/reconciling-proposals-with-codebase", "skills/reconciling-proposals-with-codebase"]) {
    const target = path.join(output, destination); cpSync(verifierRoot, target, { recursive: true, errorOnExist: true, force: false });
    const copied = verifierPackage(target);
    if (copied.checksum !== verifier.checksum || copied.files !== verifier.files) throw new Error("Complete verifier copy differs");
  }
  if (verifierPackage(verifierRoot).checksum !== verifier.checksum) throw new Error("Owner verifier changed while packaging");
  for (const needed of ["bin/harness.ps1", "runtime/windows/RoleProcess.cs", "runtime/windows/role-process.ps1"]) if (!existsSync(path.join(output, needed))) throw new Error("Native plugin source is incomplete; stage its new tracked files before packaging");
  const inventory = regularTree(output);
  const manifest = { format: "stagekeeper-windows-plugin-v1", sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim(),
    packageSha256: digest(JSON.stringify(inventory)), files: inventory.length, runtimeSha256: runtime.executableSha256,
    verifier: { checksum: verifier.checksum, files: verifier.files }, inventory };
  writeFileSync(path.join(output, "windows-package.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { path: realpathSync(output), files: manifest.files, packageSha256: manifest.packageSha256, runtimeSha256: manifest.runtimeSha256, verifier: manifest.verifier };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--output", "--runtime", "--verifier"].includes(args[i]) || !args[i + 1] || Object.hasOwn(values, args[i])) throw new Error("Expected --output, --runtime and optional --verifier absolute directories");
    values[args[i]] = args[i + 1];
  }
  if (!values["--output"] || !values["--runtime"]) throw new Error("Output and built runtime are required");
  console.log(JSON.stringify(packageWindowsPlugin({ output: values["--output"], runtimeDirectory: values["--runtime"], verifierDirectory: values["--verifier"] })));
}
