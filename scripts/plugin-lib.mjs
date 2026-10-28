import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = "packages/core";
const LIB = "plugin/lib";

const isDeliverable = (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs");

function listModules(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = posix.join(prefix, entry.name);
    if (entry.isDirectory()) return listModules(join(directory, entry.name), relative);
    return entry.isFile() && isDeliverable(entry.name) ? [relative] : [];
  }).sort();
}

export function diffPluginLib(projectRoot = process.cwd()) {
  const core = resolve(projectRoot, CORE);
  const lib = resolve(projectRoot, LIB);
  if (!existsSync(core)) throw new Error(`${CORE} not found under ${projectRoot} — run from the repository root`);
  const coreModules = listModules(core);
  const drift = coreModules.filter((name) => {
    const copy = join(lib, name);
    return !existsSync(copy) || readFileSync(copy, "utf8") !== readFileSync(join(core, name), "utf8");
  });
  const orphan = (existsSync(lib) ? listModules(lib) : []).filter((name) => !coreModules.includes(name));
  return { drift, orphan };
}

export function syncPluginLib(projectRoot = process.cwd()) {
  const { drift, orphan } = diffPluginLib(projectRoot);
  mkdirSync(resolve(projectRoot, LIB), { recursive: true });
  for (const name of drift) {
    const target = resolve(projectRoot, LIB, name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(projectRoot, CORE, name), target);
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
