import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MACOS_NODE_ARCHIVES, macosRuntimeInventory } from "../../../plugin/runtime/macos-runtime.mjs";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const omitted = ["plugin/templates", "plugin/evals", "plugin/runtime/macos/node", "plugin/runtime/windows/node"];

export function packageProject(t) {
  const base = mkdtempSync(join(realpathSync.native(tmpdir()), "stagekeeper-package-contract-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, "source");
  mkdirSync(root);
  function copy(file) {
    if (omitted.some(prefix => file === prefix || file.startsWith(prefix + "/")) || file.includes(".test.")) return;
    const source = join(repository, file), target = join(root, file), stat = lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error("Fixture source must not contain directory links");
    if (stat.isDirectory()) {
      mkdirSync(target, { recursive: true });
      for (const name of readdirSync(source)) copy(file + "/" + name);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
  for (const directory of ["plugin", "packages/shared"]) copy(directory);
  for (const file of ["scripts/plugin-lib.mjs", "scripts/lib/plugin-payload.mjs", "scripts/lib/shared-module-graph.mjs", "scripts/checks/verify-shared-boundaries.mjs", "scripts/macos/package-plugin.mjs", "scripts/windows/package-windows-plugin.mjs"]) copy(file);
  const typescript = dirname(createRequire(import.meta.url).resolve("typescript/package.json"));
  cpSync(typescript, join(root, "node_modules/typescript"), { recursive: true });
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: environment, windowsHide: true }).trim();
  git("-c", "init.defaultBranch=fixture", "init", "-q");
  git("-c", "core.autocrlf=false", "add", "--", "plugin");
  git("-c", "user.name=Package Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=" + join(base, "no-hooks"), "commit", "-qm", "fixture");
  const load = name => import(pathToFileURL(join(root, name)).href);
  return { base, root, git, load, output: name => join(base, name) };
}

export function windowsRuntimeFixture(base) {
  const directory = join(base, "runtime"), node = Buffer.from("fixture node");
  mkdirSync(directory);
  writeFileSync(join(directory, "node.exe"), node);
  writeFileSync(join(directory, "provenance.json"), JSON.stringify({ format: "stagekeeper-windows-node-v1", version: "22.23.3", architecture: "x64",
    sourceSha256: "9436c81b284889303d39f5b8bd629bf19e790c665ccb94b4994aa87220d9799a", pipeBackport: "https://github.com/libuv/libuv/pull/5181",
    executableSha256: digest(node), packageSha256: digest(JSON.stringify([["node.exe", digest(node)]])) }));
  return directory;
}

export function macosRuntimeFixture(base, sourceRoot) {
  const directory = join(base, "runtime");
  const entries = [["LICENSE", "license", 0o644], ["bin/node", "node-fixture", 0o755], ["bin/npm", "npm-launcher", 0o755], ["bin/npx", "npx-launcher", 0o755],
    ["node.sha256", "node-checksum", 0o644], ["npm/bin/npm-cli.js", "npm-fixture", 0o644], ["sandbox-identity", "scanner-fixture", 0o755]];
  for (const [name, bytes, mode] of entries) {
    const file = join(directory, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes, { mode });
    chmodSync(file, mode);
  }
  const manifest = { format: "stagekeeper-macos-node-v1", version: "22.23.3", architecture: process.arch,
    sourceSha256: MACOS_NODE_ARCHIVES[process.arch], executableSha256: digest("node-fixture"), scannerSha256: digest("scanner-fixture"),
    scannerSourceSha256: digest(readFileSync(join(sourceRoot, "plugin/runtime/macos/sandbox-identity.c"))),
    packageSha256: digest(JSON.stringify(macosRuntimeInventory(directory))) };
  writeFileSync(join(directory, "provenance.json"), JSON.stringify(manifest));
  return directory;
}

export function assertModuleInventory(assert, sourceRoot, output, inventory) {
  const entries = JSON.parse(readFileSync(join(sourceRoot, "packages/shared/plugin-exports.json"), "utf8")).entries;
  const expected = entries.map(entry => "lib/" + entry.path).concat("lib/templates/template-boundary.mjs").sort();
  assert.deepEqual(inventory.filter(([file]) => file.startsWith("lib/")).map(([file]) => file).sort(), expected);
  for (const file of expected) assert.deepEqual(readFileSync(join(output, file)), readFileSync(join(sourceRoot, "packages/shared", file.slice(4))));
  for (const file of ["configuration/harness-config.mjs", "execution/watch.mjs", "qa/config.mjs", "templates/install-manifest.mjs", "templates/metadata.mjs"]) {
    assert.deepEqual(readFileSync(join(output, "runtime", file)), readFileSync(join(sourceRoot, "plugin/runtime", file)));
  }
}
