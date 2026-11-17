import { existsSync, readFileSync, statSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { canonicalProjectRoot, firstPartySources, isCodeSource, isDeclarationSource, isPluginModule, isTestSource, modulePath, readModuleReferences, readSharedModuleGraph } from "../lib/shared-module-graph.mjs";

const SOURCE_ROOTS = ["src", "packages/shared", "packages/app-core", "plugin/bin", "plugin/runtime", "scripts", "tests"];
const shared = file => file === "packages/shared" || file.startsWith("packages/shared/");
const appCore = file => file === "packages/app-core" || file.startsWith("packages/app-core/");
const plugin = file => file.startsWith("plugin/bin/") || file.startsWith("plugin/runtime/");
const testOnly = file => isTestSource(file);

function resolutionOptions(root) {
  const config = join(root, "tsconfig.json");
  if (existsSync(config)) {
    const read = ts.readConfigFile(config, ts.sys.readFile);
    if (read.error) throw new Error("Cannot read TypeScript resolution settings");
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
    if (parsed.errors.some(error => error.code !== 18003)) throw new Error("Cannot parse TypeScript resolution settings");
    return parsed.options;
  }
  return { moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true };
}

export function inspectSharedBoundaries(projectRoot = process.cwd(), { graph } = {}) {
  const root = canonicalProjectRoot(projectRoot);
  graph ??= readSharedModuleGraph(root);
  if (graph.root !== root) throw new Error("Shared graph belongs to another project");
  const violations = [], records = new Map(), pluginModules = new Map();
  const options = resolutionOptions(root), cache = ts.createModuleResolutionCache(root, value => value, options);
  const report = (file, line, rule, message) => violations.push({ file, line, rule, message });
  const aliases = [
    ["@harness/shared/", "packages/shared/"], ["@harness/app-core/", "packages/app-core/"], ["@/", "src/"],
  ];
  function resolveTarget(file, specifier, runtime) {
    if (isBuiltin(specifier)) return { builtin: specifier };
    const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
    const local = alias ? alias[1] + specifier.slice(alias[0].length)
      : specifier.startsWith(".") ? modulePath(relative(root, resolve(root, dirname(file), specifier))) : null;
    if (local === "plugin/lib" || local?.startsWith("plugin/lib/")) {
      const key = local.slice("plugin/lib/".length);
      return { file: "packages/shared/" + key, viaLib: true, exists: graph.modules.has(key) };
    }
    if (local && (local.endsWith(".mjs") || local.endsWith(".cjs") || local.endsWith(".js")) && existsSync(resolve(root, local))) return { file: local, exists: true };
    const resolved = ts.resolveModuleName(specifier, resolve(root, file), options, ts.sys, cache).resolvedModule?.resolvedFileName;
    if (resolved) {
      let target = modulePath(relative(root, resolved));
      if (runtime && /\.d\.mts$/.test(target) && specifier.endsWith(".mjs")) target = target.replace(/\.d\.mts$/, ".mjs");
      if (!runtime && specifier.endsWith(".mjs") && target.endsWith(".d.mts")) target = target.replace(/\.d\.mts$/, ".mjs");
      return { file: target, exists: existsSync(resolve(root, target)), external: target.includes("node_modules/") };
    }
    if (local) {
      for (const suffix of ["", ".ts", ".tsx", ".mjs", ".js", ".cjs", "/index.ts", "/index.tsx", "/index.mjs", "/index.js"]) {
        const candidate = resolve(root, local + suffix);
        if (existsSync(candidate) && statSync(candidate).isFile()) return { file: modulePath(relative(root, candidate)), exists: true };
      }
      return { file: local, exists: false };
    }
    return { external: specifier };
  }
  for (const file of firstPartySources(root, SOURCE_ROOTS)) {
    const bytes = graph.modules.get(file.slice("packages/shared/".length))?.file === file
      ? graph.modules.get(file.slice("packages/shared/".length)).bytes : readFileSync(resolve(root, file));
    const source = graph.modules.get(file.slice("packages/shared/".length))?.file === file
      ? graph.modules.get(file.slice("packages/shared/".length)) : readModuleReferences(file, bytes.toString("utf8"));
    const testing = testOnly(file), declaration = isDeclarationSource(file);
    const production = !testing && !declaration;
    if (plugin(file) && production) pluginModules.set(file, { sourcePath: resolve(root, file), bytes });
    if (plugin(file) && production && /\.[cm]?tsx?$/.test(file)) report(file, 1, "plugin/typescript-runtime", "Installed plugin source must be JavaScript");
    const edges = [];
    for (const original of source.references) {
      const reference = declaration ? { ...original, runtime: false } : original;
      const specifier = reference.specifier;
      if (!specifier) {
        const prefixTarget = reference.prefix ? resolveTarget(file, reference.prefix, reference.runtime) : null;
        if (production && (shared(file) || appCore(file)) || reference.prefix.startsWith("@harness/") || prefixTarget?.viaLib || prefixTarget?.file && (shared(prefixTarget.file) || appCore(prefixTarget.file))) {
          report(file, reference.line, "shared/computed-import", "Use a literal module path for shared and app-core imports");
        }
        continue;
      }
      if (specifier.startsWith("@harness/core/") || specifier.startsWith("@harness/github/")) {
        report(file, reference.line, "shared/legacy-path", "Legacy package alias: " + specifier);
        continue;
      }
      const target = resolveTarget(file, specifier, reference.runtime);
      edges.push({ ...reference, target });
      if (target.file && !target.exists) report(file, reference.line, "module/unresolved", "Cannot resolve " + specifier);
      if (testing) {
        if (target.file && shared(target.file) && !shared(file) && !graph.runtimes.has(target.file.slice("packages/shared/".length))) report(file, reference.line, "shared/private-import", "Shared internal module: " + specifier);
        continue;
      }
      if (target.file && testOnly(target.file)) report(file, reference.line, "production/test-import", "Production imports test code: " + specifier);
      if (shared(file) && (target.external || target.file && !shared(target.file))) report(file, reference.line, "shared/dependency", "Shared code may only import shared code and Node builtins: " + specifier);
      if (appCore(file) && (target.external || reference.runtime && target.builtin || target.file && !appCore(target.file) && !shared(target.file))) report(file, reference.line, "app-core/dependency", "App policy may only import app-core and shared public modules: " + specifier);
      if (target.file && shared(target.file) && !shared(file)) {
        const key = target.file.slice("packages/shared/".length);
        if (!graph.runtimes.has(key)) report(file, reference.line, "shared/private-import", "Shared internal module: " + specifier);
        if (plugin(file) && !target.viaLib) report(file, reference.line, "plugin/source-import", "Plugin must consume the generated lib path: " + specifier);
      }
      if (plugin(file) && target.file && (appCore(target.file) || target.file.startsWith("src/") || target.file.startsWith("packages/") && !target.viaLib)) report(file, reference.line, "plugin/app-import", "Plugin imports application source: " + specifier);
      if (plugin(file) && reference.runtime && !target.builtin && !target.viaLib) {
        const owned = target.file && isPluginModule(target.file);
        const asset = target.file?.startsWith("plugin/") && !isCodeSource(target.file) && !/^plugin\/(?:templates|evals)\//.test(target.file);
        if (!owned && !asset) report(file, reference.line, "plugin/external-runtime", "Installed plugin must resolve inside its own payload: " + specifier);
      }
      if (plugin(file) && reference.runtime && target.file?.endsWith(".ts")) report(file, reference.line, "plugin/typescript-runtime", "Installed plugin cannot import TypeScript source: " + specifier);
    }
    records.set(file, { ...source, edges, production });
  }
  function isActionReference(edge) {
    if (!edge.target.file?.startsWith("src/")) return false;
    const target = records.get(edge.target.file);
    if (!target?.directives.has("use server") || !target.actionOnly || !target.actionExports.size) return false;
    return edge.kind === "import" && edge.bindings.filter(binding => !binding.typeOnly).every(binding => binding.imported === "*" || target.actionExports.has(binding.imported));
  }
  for (const [entry, source] of records) {
    if (!source.production || !source.directives.has("use client") && !appCore(entry)) continue;
    const browser = source.directives.has("use client");
    const seen = new Set();
    function visit(file, chain) {
      if (seen.has(file)) return;
      seen.add(file);
      for (const edge of records.get(file)?.edges ?? []) {
        if (!edge.runtime || browser && isActionReference(edge)) continue;
        const target = edge.target, next = target.file ?? target.builtin;
        const trace = [...chain, file, next].filter(Boolean).join(" -> ");
        if (target.builtin || target.file && shared(target.file) && graph.runtimes.get(target.file.slice("packages/shared/".length)) === "node") report(entry, edge.line, browser ? "browser/node-import" : "app-core/node-import", trace);
        else if (target.file && !target.external) visit(target.file, [...chain, file]);
      }
    }
    visit(entry, []);
  }
  const unique = new Map(violations.map(value => [JSON.stringify(value), value]));
  return { violations: [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule)), pluginModules };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { violations } = inspectSharedBoundaries();
    for (const item of violations) console.error(`${item.file}:${item.line} [${item.rule}] ${item.message}`);
    if (violations.length) process.exitCode = 1;
    else console.log("Shared module boundaries passed.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
