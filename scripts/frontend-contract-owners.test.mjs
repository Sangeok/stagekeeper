import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONFIG = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
assert.equal(CONFIG.error, undefined);
const RULES = [
  { names: ["PLUGIN_ID", "PLUGIN_MARKETPLACE", "installCommands"], publicPath: "@/fsd/shared/config/plugin-install", owner: "src/fsd/shared/config/plugin-install" },
  { names: ["ACCEPTANCE_CHECK_LABELS"], publicPath: "@/fsd/entities/pipeline", owner: "src/fsd/entities/pipeline/" },
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|mjs)$/.test(entry.name) && !/\.(?:test|fixture)\./.test(entry.name) ? [path] : [];
  });
}

function inspectOwners(root, files, virtual = false) {
  const options = ts.parseJsonConfigFileContent(CONFIG.config, ts.sys, root).options;
  const host = ts.createCompilerHost({ ...options, incremental: false });
  if (virtual) {
    const read = host.readFile, exists = host.fileExists, directoryExists = host.directoryExists;
    host.readFile = path => files.get(resolve(path)) ?? read(path);
    host.fileExists = path => files.has(resolve(path)) || exists(path);
    host.directoryExists = path => [...files.keys()].some(file => file.startsWith(resolve(path) + sep)) || directoryExists?.(path) === true;
    host.getSourceFile = (path, version) => {
      const source = host.readFile(path);
      return source === undefined ? undefined : ts.createSourceFile(path, source, version, true);
    };
    options.types = [];
    options.noLib = true;
  }
  const program = ts.createProgram([...files.keys()], { ...options, incremental: false }, host);
  const checker = program.getTypeChecker();
  const issues = [];
  const origin = symbol => symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const owned = (file, rule) => {
    const path = relative(root, file).split(sep).join("/");
    return rule.owner.endsWith("/") ? path.startsWith(rule.owner)
      : [".ts", ".tsx", ".mjs"].some(extension => path === rule.owner + extension) || path.startsWith(rule.owner + "/");
  };
  const rules = RULES.flatMap(rule => {
    const publicFile = ts.resolveModuleName(rule.publicPath, join(root, "src/fsd/entry.ts"), options, host).resolvedModule?.resolvedFileName;
    const source = publicFile && program.getSourceFile(publicFile);
    const symbol = source && checker.getSymbolAtLocation(source);
    const exports = symbol ? checker.getExportsOfModule(symbol) : [];
    return rule.names.map(name => {
      const expected = origin(exports.find(entry => entry.name === name));
      if (!expected?.declarations?.length || expected.declarations.some(declaration => !owned(declaration.getSourceFile().fileName, rule))) {
        issues.push("Invalid public owner for " + name);
      }
      return { ...rule, name, publicFile, expected };
    });
  });
  for (const file of files.keys()) {
    const source = program.getSourceFile(file);
    assert.ok(source, file);
    const report = name => issues.push(relative(root, file) + ": invalid ownership or public access for " + name);
    for (const statement of source.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          const rule = rules.find(entry => entry.name === declaration.name.text);
          if (rule && (!owned(file, rule) || origin(checker.getSymbolAtLocation(declaration.name)) !== rule.expected)) report(rule.name);
        }
      }
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const provider = ts.resolveModuleName(statement.moduleSpecifier.text, file, options, host).resolvedModule?.resolvedFileName;
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const binding of bindings.elements) {
            const imported = origin(checker.getSymbolAtLocation(binding.name));
            for (const rule of rules) {
              if ((binding.propertyName?.text ?? binding.name.text) !== rule.name && imported !== rule.expected) continue;
              if (!owned(file, rule) && (provider !== rule.publicFile || imported !== rule.expected)) report(rule.name);
            }
          }
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          const namespace = checker.getSymbolAtLocation(bindings.name);
          for (const symbol of namespace ? checker.getExportsOfModule(origin(namespace)) : []) {
            for (const rule of rules) {
              if (symbol.name !== rule.name && origin(symbol) !== rule.expected) continue;
              if (!owned(file, rule) && (provider !== rule.publicFile || origin(symbol) !== rule.expected)) report(rule.name);
            }
          }
        }
      }
      if (ts.isExportDeclaration(statement)) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const binding of statement.exportClause.elements) {
            const exported = origin(checker.getSymbolAtLocation(binding.name));
            for (const rule of rules) {
              if ((binding.propertyName?.text ?? binding.name.text) !== rule.name && binding.name.text !== rule.name && exported !== rule.expected) continue;
              if (!owned(file, rule) || exported !== rule.expected) report(rule.name);
            }
          }
        } else if (statement.moduleSpecifier) {
          const namespace = checker.getSymbolAtLocation(statement.moduleSpecifier);
          for (const symbol of namespace ? checker.getExportsOfModule(origin(namespace)) : []) {
            for (const rule of rules) if (symbol.name === rule.name || origin(symbol) === rule.expected) report(rule.name);
          }
        }
      }
    }
  }
  return issues;
}

it("keeps installation values and acceptance labels at their public owners and consumers", () => {
  const files = new Map(sourceFiles(join(ROOT, "src/fsd")).map(path => [resolve(path), readFileSync(path, "utf8")]));
  assert.deepEqual(inspectOwners(ROOT, files), []);
});

function fixture(changes = {}) {
  const root = join(ROOT, ".frontend-owner-fixture");
  const sources = {
    "src/fsd/shared/config/plugin-install.ts": 'export const PLUGIN_ID = "plugin"; export const PLUGIN_MARKETPLACE = "market"; export const installCommands = []; export const extra = true;',
    "src/fsd/entities/pipeline/index.ts": 'export { labels as ACCEPTANCE_CHECK_LABELS } from "./model/labels";',
    "src/fsd/entities/pipeline/model/labels.ts": 'export const labels = { 1: "Ready" };',
    "src/fsd/features/example/ui/view.ts": 'import {\n installCommands as commands, extra\n} from "@/fsd/shared/config/plugin-install"; import { ACCEPTANCE_CHECK_LABELS as labels } from "@/fsd/entities/pipeline";',
    ...changes,
  };
  const files = new Map(Object.entries(sources).filter(([, source]) => source !== null).map(([path, source]) => [join(root, path), source]));
  return inspectOwners(root, files, true);
}

it("accepts formatting, aliases, extra bindings and implementation moves behind public APIs", () => {
  assert.deepEqual(fixture(), []);
  assert.deepEqual(fixture({
    "src/fsd/entities/pipeline/model/labels.ts": null,
    "src/fsd/entities/pipeline/model/new-labels.ts": 'export const labels = { 1: "Ready" };',
    "src/fsd/entities/pipeline/index.ts": 'export { labels as ACCEPTANCE_CHECK_LABELS } from "./model/new-labels";',
  }), []);
  assert.deepEqual(fixture({
    "src/fsd/shared/config/plugin-install.ts": null,
    "src/fsd/shared/config/plugin-install/index.ts": 'export { PLUGIN_ID, PLUGIN_MARKETPLACE, installCommands } from "./values";',
    "src/fsd/shared/config/plugin-install/values.ts": 'export const PLUGIN_ID = "plugin"; export const PLUGIN_MARKETPLACE = "market"; export const installCommands = []; export const extra = true;',
    "src/fsd/features/example/ui/view.ts": 'import { installCommands as commands } from "@/fsd/shared/config/plugin-install";',
  }), []);
});

for (const [name, changes] of [
  ["cloned declaration", { "src/fsd/features/example/model/labels.ts": 'export const ACCEPTANCE_CHECK_LABELS = { 1: "Copy" };' }],
  ["named re-export", { "src/fsd/features/example/index.ts": 'export { PLUGIN_ID as otherPlugin } from "@/fsd/shared/config/plugin-install";' }],
  ["wildcard re-export", { "src/fsd/features/example/index.ts": 'export * from "@/fsd/entities/pipeline";' }],
  ["private consumer import", { "src/fsd/features/example/ui/view.ts": 'import { labels as ACCEPTANCE_CHECK_LABELS } from "@/fsd/entities/pipeline/model/labels";' }],
  ["foreign public owner", {
    "src/fsd/entities/pipeline/index.ts": 'export { ACCEPTANCE_CHECK_LABELS } from "../other/labels";',
    "src/fsd/entities/other/labels.ts": 'export const ACCEPTANCE_CHECK_LABELS = { 1: "Other" };',
  }],
]) it("rejects " + name + " without executing product modules", () => {
  assert.ok(fixture(changes).length > 0);
});
