import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkModulePath, isCodeSource, isPluginModule, isTestSource, modulePath, readSharedModuleGraph } from "./lib/shared-module-graph.mjs";
import { inspectSharedBoundaries } from "./checks/verify-shared-boundaries.mjs";

const LIB = "plugin/lib";

function preparePluginModules(projectRoot) {
  const graph = readSharedModuleGraph(projectRoot);
  const { violations, pluginModules } = inspectSharedBoundaries(graph.root, { graph });
  if (violations.length) throw new Error(violations.map(item => `${item.file}:${item.line} [${item.rule}] ${item.message}`).join("\n"));
  return { graph, pluginModules };
}

function libFiles(root) {
  const directory = checkModulePath(root, LIB, { directory: true, missing: true });
  if (!existsSync(directory)) return [];
  const files = [];
  function visit(local) {
    for (const name of readdirSync(resolve(root, local)).sort()) {
      const file = modulePath(join(local, name)), stat = lstatSync(resolve(root, file));
      checkModulePath(root, file, { directory: stat.isDirectory() });
      if (stat.isDirectory()) visit(file);
      else if (file.endsWith(".mjs") && !isTestSource(file)) files.push(file.slice(LIB.length + 1));
    }
  }
  visit(LIB);
  return files;
}

function diffModules(graph) {
  const files = libFiles(graph.root);
  const drift = [...graph.modules].filter(([name, source]) => {
    const target = checkModulePath(graph.root, `${LIB}/${name}`, { missing: true });
    return !existsSync(target) || !readFileSync(target).equals(source.bytes);
  }).map(([name]) => name).sort();
  const orphan = files.filter(name => !graph.modules.has(name)).sort();
  return { drift, orphan };
}

export function diffPluginLib(projectRoot = process.cwd()) {
  return diffModules(preparePluginModules(projectRoot).graph);
}

export function syncPluginLib(projectRoot = process.cwd()) {
  const { graph } = preparePluginModules(projectRoot);
  const { drift, orphan } = diffModules(graph);
  mkdirSync(resolve(graph.root, LIB), { recursive: true });
  for (const name of drift) {
    const target = resolve(graph.root, LIB, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, graph.modules.get(name).bytes);
  }
  for (const name of orphan) unlinkSync(resolve(graph.root, LIB, name));
  return { drift, orphan };
}

function sameFiles(expected, actual, label) {
  const expectedSet = new Set(expected), actualSet = new Set(actual);
  const missing = [...expectedSet].filter(file => !actualSet.has(file)).sort();
  const unexpected = [...actualSet].filter(file => !expectedSet.has(file)).sort();
  if (missing.length || unexpected.length) throw new Error(`${label}: missing tracked modules [${missing.join(", ")}]; unexpected modules [${unexpected.join(", ")}]`);
}

export function validatePluginModulesForPackaging(projectRoot, trackedFiles) {
  if (!Array.isArray(trackedFiles) || trackedFiles.some(file => typeof file !== "string" || !file.startsWith("plugin/") || file.includes("\\") || file.split("/").some(part => !part || part === "." || part === "..")) || new Set(trackedFiles).size !== trackedFiles.length) throw new Error("Invalid tracked plugin file list");
  if (trackedFiles.some(file => /^(?:plugin\/bin|plugin\/runtime)\//.test(file) && isCodeSource(file) && !isPluginModule(file))) throw new Error("Development or vendor module in the tracked plugin payload");
  const { graph, pluginModules } = preparePluginModules(projectRoot);
  const { drift, orphan } = diffModules(graph);
  if (drift.length || orphan.length) throw new Error(`Plugin lib is not synchronized: drift [${drift.join(", ")}]; orphan [${orphan.join(", ")}]`);
  const libModules = new Map([...graph.modules].map(([name, module]) => [`${LIB}/${name}`, { sourcePath: resolve(graph.root, LIB, name), bytes: module.bytes }]));
  sameFiles([...libModules.keys()], trackedFiles.filter(file => file.startsWith(LIB + "/")), "Plugin lib payload");
  sameFiles([...pluginModules.keys()], trackedFiles.filter(isPluginModule), "Plugin runtime payload");
  for (const [file, module] of [...libModules, ...pluginModules]) {
    const absolute = checkModulePath(graph.root, file);
    if (!readFileSync(absolute).equals(module.bytes)) throw new Error(`${file}: source changed during packaging preflight`);
  }
  return { libModules, pluginModules };
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
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  try { runCli(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
