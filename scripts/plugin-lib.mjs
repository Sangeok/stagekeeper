import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = "packages/core";
const LIB = "plugin/lib";

const isDeliverable = (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs");

function listModules(directory) {
  return readdirSync(directory).filter(isDeliverable).sort();
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
  for (const name of drift) copyFileSync(resolve(projectRoot, CORE, name), resolve(projectRoot, LIB, name));
  for (const name of orphan) rmSync(resolve(projectRoot, LIB, name));
  return { drift, orphan };
}

function runCli() {
  if (process.argv.includes("--check")) {
    const { drift, orphan } = diffPluginLib();
    for (const name of drift) console.log(`drift: ${LIB}/${name}`);
    for (const name of orphan) console.log(`orphan: ${LIB}/${name}`);
    if (drift.length || orphan.length) { console.log("run: npm run sync:plugin-lib"); process.exit(1); }
    console.log("plugin/lib in sync");
    return;
  }
  const { drift, orphan } = syncPluginLib();
  console.log(`plugin/lib synced (${drift.length} copied, ${orphan.length} removed)`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) runCli();
