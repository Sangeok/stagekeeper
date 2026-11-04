import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCES = [
  { directory: "packages/core", prefix: "" },
  { directory: "packages/github", prefix: "github" },
];
const LIB = "plugin/lib";

const isDeliverable = (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs");

function listModules(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = posix.join(prefix, entry.name);
    if (entry.isDirectory()) return listModules(join(directory, entry.name), relative);
    return entry.isFile() && isDeliverable(entry.name) ? [relative] : [];
  }).sort();
}

function sourceModules(projectRoot) {
  const modules = new Map();
  for (const { directory, prefix } of SOURCES) {
    const source = resolve(projectRoot, directory);
    if (!existsSync(source)) throw new Error(`${directory} not found under ${projectRoot} — run from the repository root`);
    for (const name of listModules(source)) {
      const target = posix.join(prefix, name);
      if (modules.has(target)) throw new Error(`Duplicate plugin module destination: ${target}`);
      modules.set(target, resolve(source, name));
    }
  }
  return modules;
}

function diffModules(projectRoot, modules) {
  const lib = resolve(projectRoot, LIB);
  const drift = [...modules.keys()].sort().filter((name) => {
    const copy = join(lib, name);
    return !existsSync(copy) || readFileSync(copy, "utf8") !== readFileSync(modules.get(name), "utf8");
  });
  const orphan = (existsSync(lib) ? listModules(lib) : []).filter((name) => !modules.has(name));
  return { drift, orphan };
}

export function diffPluginLib(projectRoot = process.cwd()) {
  return diffModules(projectRoot, sourceModules(projectRoot));
}

export function syncPluginLib(projectRoot = process.cwd()) {
  const modules = sourceModules(projectRoot);
  const { drift, orphan } = diffModules(projectRoot, modules);
  mkdirSync(resolve(projectRoot, LIB), { recursive: true });
  for (const name of drift) {
    const target = resolve(projectRoot, LIB, name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(modules.get(name), target);
  }
  for (const name of orphan) rmSync(resolve(projectRoot, LIB, name));
  return { drift, orphan };
}

function runCli() {
  const args = process.argv.slice(2);
  const usage = "Usage: node scripts/plugin-lib.mjs [--check | --help] (run from the repository root; no arguments synchronizes plugin/lib)";
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return; }
  if (args.length && !(args.length === 1 && args[0] === "--check")) {
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  if (args[0] === "--check") {
    const { drift, orphan } = diffPluginLib();
    for (const name of drift) console.log(`drift: ${LIB}/${name}`);
    for (const name of orphan) console.log(`orphan: ${LIB}/${name}`);
    if (drift.length || orphan.length) { console.log("run: npm run sync:plugin-lib"); process.exitCode = 1; return; }
    console.log("plugin/lib in sync");
    return;
  }
  const { drift, orphan } = syncPluginLib();
  console.log(`plugin/lib synced (${drift.length} copied, ${orphan.length} removed)`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) runCli();
