import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directions = {
  projects: [], tokens: ["projects"], usage: ["projects"], templates: ["projects"],
  pipeline: ["projects", "usage"], agents: ["projects", "usage", "templates", "pipeline"],
  auth: ["projects"], rest: ["projects", "tokens", "usage", "templates"],
  mcp: ["projects", "tokens", "usage", "templates", "agents", "pipeline"],
};
const rootFiles = new Set(["db.ts", "database-clock.ts", "github.ts", "public-url.ts", "result.ts"]);
const authPublic = new Set(["auth/index.ts", "auth/guard.ts", "auth/config.base.ts"]);
const authAssembly = new Set(["auth/guard.ts->auth/index.ts", "auth/config.ts->auth/config.base.ts"]);
const runtimeAssembly = new Set([
  "rest/api.server.ts", "rest/templates.ts", "rest/runbook.ts", "rest/project-identity.ts", "rest/project-registration.ts",
  "mcp/api.server.ts", "mcp/deps.ts", "mcp/owner-deps.ts", "auth/index.ts", "auth/guard.ts", "auth/config.ts",
]);
const normalize = value => value.split(sep).join("/");
const serverPath = file => file.startsWith("src/server/") ? file.slice("src/server/".length) : null;
const moduleOf = file => { const tail = serverPath(file); return tail?.includes("/") ? tail.split("/")[0] : null; };
const isTest = file => file.includes(".test.") || file.startsWith("tests/") || file.startsWith("scripts/rehearse-");
const isPublic = file => {
  const tail = serverPath(file);
  return tail && (rootFiles.has(tail) || authPublic.has(tail) || /^[^/]+\/(api(?:\.server)?|contracts)\.ts$/.test(tail));
};
const isTypeImport = node => Boolean(node.importClause?.isTypeOnly || node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
  && node.importClause.namedBindings.elements.length && node.importClause.namedBindings.elements.every(item => item.isTypeOnly));
const isTypeExport = node => node.isTypeOnly || Boolean(node.exportClause && ts.isNamedExports(node.exportClause)
  && node.exportClause.elements.length && node.exportClause.elements.every(item => item.isTypeOnly));

function sourceFiles(root) {
  const result = [];
  function visit(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name), file = normalize(relative(root, absolute));
      if ([".git", ".next", "node_modules"].includes(entry.name) || file === "src/generated") continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(?:[cm]?[jt]s|tsx|jsx)$/.test(entry.name)) result.push(file);
    }
  }
  for (const directory of ["src", "tests", "scripts"]) visit(join(root, directory));
  return result.sort();
}

function readRegistry(root) {
  const file = join(root, "docs/architecture/server.md");
  if (!existsSync(file)) return { entries: [], errors: ["Server architecture document missing"] };
  const text = readFileSync(file, "utf8"), start = text.indexOf("<!-- server-internal-tests:start -->"), end = text.indexOf("<!-- server-internal-tests:end -->");
  if (start < 0 || end <= start) return { entries: [], errors: ["Internal test registry markers missing or unordered"] };
  const entries = [], errors = [], seen = new Set();
  for (const line of text.slice(start, end).split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map(cell => cell.trim().replace(/^`|`$/g, ""));
    if (cells[0] === "시험 파일" || /^-+$/.test(cells[0])) continue;
    const [file, module, reason] = cells;
    if (cells.length !== 3 || !isTest(file) || !Object.hasOwn(directions, module) || !reason || file.includes("*") || file.includes("..") || file.includes("\\")) {
      errors.push("Invalid file/module/reason registry row: " + line); continue;
    }
    const key = file + "|" + module;
    if (seen.has(key)) errors.push("Duplicate internal test registry row: " + key);
    seen.add(key); entries.push({ file, module, reason, key });
  }
  return { entries, errors };
}

function compilerOptions(root) {
  const configPath = join(root, "tsconfig.json");
  if (existsSync(configPath)) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error("Cannot read tsconfig.json");
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    if (parsed.errors.some(error => error.code !== 18003)) throw new Error("Cannot parse TypeScript module resolution settings");
    return parsed.options;
  }
  return { moduleResolution: ts.ModuleResolutionKind.Bundler, baseUrl: root, paths: { "@/*": ["src/*"] } };
}

function staticPrefix(expression) {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) return expression.head.text;
  if (ts.isParenthesizedExpression(expression)) return staticPrefix(expression.expression);
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) return staticPrefix(expression.left);
  return "";
}

/** Inspect the actual working tree, including files that are not in Git's index. */
export function inspectServerBoundaries(root = process.cwd()) {
  root = resolve(root);
  const files = sourceFiles(root), options = compilerOptions(root), cache = ts.createModuleResolutionCache(root, file => file, options);
  const registry = readRegistry(root), allowedTests = new Set(registry.entries.map(entry => entry.key));
  const violations = [], sources = new Map(), internalReferences = new Map(), graph = new Map();
  const report = (file, line, rule, message) => violations.push({ file, line, rule, message });
  for (const error of registry.errors) report("docs/architecture/server.md", 1, "registry", error);
  function targetFor(file, spec) {
    const resolved = ts.resolveModuleName(spec, join(root, file), options, ts.sys, cache).resolvedModule?.resolvedFileName;
    if (resolved) return normalize(relative(root, resolved));
    if (spec.startsWith("src/server/") && existsSync(join(root, spec))) return spec;
    return null;
  }
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8"), ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const edges = [], directTypes = new Set(), marker = ast.statements.some(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text === "server-only");
    const from = moduleOf(file), tail = serverPath(file), contracts = tail?.endsWith("/contracts.ts");
    if (tail && !isTest(file) && (!from && !rootFiles.has(tail) || from && !Object.hasOwn(directions, from))) report(file, 1, "structure", "Unknown server module or root implementation");
    const line = node => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    const add = (node, spec, runtime, fixture = false) => {
      const target = targetFor(file, spec);
      if (target) edges.push({ target, spec, runtime, fixture, line: line(node), node });
      else if (!fixture && spec.startsWith("@/server/")) report(file, line(node), "resolution", "Unresolved server reference: " + spec);
    };
    for (const node of ast.statements) {
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) directTypes.add(node.name.text);
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) add(node, node.moduleSpecifier.text, !isTypeImport(node));
      if (ts.isExportDeclaration(node)) {
        if (tail && !node.exportClause) report(file, line(node), "wildcard", "Wildcard server exports are forbidden");
        if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) add(node, node.moduleSpecifier.text, !isTypeExport(node));
      }
      if (contracts && !(ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEmptyStatement(node)
        || ts.isImportDeclaration(node) && isTypeImport(node) || ts.isExportDeclaration(node) && isTypeExport(node))) {
        report(file, line(node), "contracts", "Contracts may contain only explicit type declarations, imports and exports");
      }
    }
    function walk(node) {
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) add(node, node.argument.literal.text, false);
      if (ts.isCallExpression(node) && node.arguments.length && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        const argument = node.arguments[0];
        if (ts.isStringLiteralLike(argument)) add(node, argument.text, true);
        else if (/^(?:@\/server\/|src\/server\/)/.test(staticPrefix(argument))) report(file, line(node), "computed", "Computed server import/require is forbidden");
      }
      // Existing VM loaders read source paths and mock keys as data. Classify real source targets;
      // fixture-only virtual paths are not imports and are checked by their own fixture runner.
      if (isTest(file) && ts.isStringLiteralLike(node) && /^src\/server\/[^\r\n*]+$/.test(node.text)
        && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
        && !(ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && node.parent.expression.text === "write" && node.parent.arguments[1] === node)
        && !(ts.isCallExpression(node.parent) && ts.isIdentifier(node.parent.expression) && node.parent.expression.text === "violations")) add(node, node.text, false, true);
      ts.forEachChild(node, walk);
    }
    walk(ast); sources.set(file, { edges, marker, directTypes, contracts });
  }
  function permitsOwnContract(edge) {
    const types = sources.get(edge.target)?.directTypes;
    if (!types || !ts.isImportDeclaration(edge.node) || !isTypeImport(edge.node)) return false;
    const bindings = edge.node.importClause?.namedBindings;
    return bindings && ts.isNamedImports(bindings) && bindings.elements.every(item => types.has(item.propertyName?.text ?? item.name.text));
  }
  for (const [file, source] of sources) for (const edge of source.edges) {
    const to = moduleOf(edge.target), from = moduleOf(file), targetTail = serverPath(edge.target), tail = serverPath(file);
    if (!targetTail) continue;
    const own = from && from === to;
    if (isTest(file)) {
      if (own && edge.spec.startsWith(".")) continue;
      if (!isPublic(edge.target)) {
        const key = file + "|" + to;
        internalReferences.set(key, { file, module: to });
        if (!allowedTests.has(key)) report(file, edge.line, "test-private", "Unregistered internal test reference: " + edge.target);
      }
      continue;
    }
    if (tail && !from && to) report(file, edge.line, "root-direction", "Root infrastructure cannot depend on a feature module");
    if (own) {
      if (/\/api(?:\.server)?\.ts$/.test(edge.target)) report(file, edge.line, "self-api", "Use the implementation instead of the module's aggregate API");
      else if (authPublic.has(targetTail) && !authAssembly.has(tail + "->" + targetTail)) report(file, edge.line, "self-api", "Undeclared auth assembly edge");
      else if (edge.target.endsWith("/contracts.ts") && !source.contracts && !permitsOwnContract(edge)) report(file, edge.line, "self-contract", "Use the owning type implementation; only directly defined contracts may be imported internally");
      else if (!edge.spec.startsWith(".")) report(file, edge.line, "internal-relative", "Same-module references must use relative paths");
      continue;
    }
    if (from && to) {
      if (!directions[from]?.includes(to)) report(file, edge.line, "direction", from + " cannot depend on " + to);
      if (!graph.has(from)) graph.set(from, new Set());
      graph.get(from).add(to);
      if (edge.target.endsWith("/api.server.ts") && !runtimeAssembly.has(tail)) report(file, edge.line, "runtime-assembly", "Only declared runtime assembly files may import another module's runtime API");
    }
    if (!isPublic(edge.target)) report(file, edge.line, "private", "Use the module's public API: " + edge.target);
  }
  for (const entry of registry.entries) if (!internalReferences.has(entry.key)) report("docs/architecture/server.md", 1, "stale-registry", "Unused internal test registry row: " + entry.key);
  const visited = new Set(), active = [];
  function cycle(moduleName) {
    if (active.includes(moduleName)) { report("src/server/" + moduleName, 1, "cycle", "Module cycle: " + [...active.slice(active.indexOf(moduleName)), moduleName].join(" -> ")); return; }
    if (visited.has(moduleName)) return;
    visited.add(moduleName); active.push(moduleName);
    for (const next of graph.get(moduleName) ?? []) cycle(next);
    active.pop();
  }
  for (const moduleName of graph.keys()) cycle(moduleName);
  for (const [entry, source] of sources) {
    if (!entry.endsWith("/api.ts") && !source.contracts) continue;
    const seen = new Set();
    function closure(file, chain) {
      if (seen.has(file)) return;
      seen.add(file);
      const current = sources.get(file);
      if (file === "src/server/db.ts" || file.endsWith("/api.server.ts") || current?.marker || ["src/server/auth/index.ts", "src/server/auth/config.ts"].includes(file)) {
        report(entry, 1, "initialization", "Runtime dependency: " + [...chain, file].join(" -> ")); return;
      }
      for (const edge of current?.edges ?? []) if (!edge.fixture && (edge.runtime || source.contracts)) closure(edge.target, [...chain, file]);
    }
    closure(entry, []);
  }
  const unique = new Map(violations.map(item => [JSON.stringify(item), item]));
  return { violations: [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule)), internalReferences: [...internalReferences.values()].sort((a, b) => a.file.localeCompare(b.file) || a.module.localeCompare(b.module)), files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectServerBoundaries();
    for (const violation of result.violations) console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
    if (result.violations.length) process.exitCode = 1;
    else console.log("Server module boundary check passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Server boundary inspection failed");
    process.exitCode = 1;
  }
}
