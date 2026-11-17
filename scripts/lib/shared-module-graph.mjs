import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const MODULE_PATH = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$/;
const CODE_FILE = /\.(?:[cm]?[jt]s|jsx|tsx)$/;
const DECLARATION = /\.d\.(?:ts|mts|cts)$/;
const OMIT = new Set([".git", ".next", "node_modules", "generated"]);
const NATIVE_TREES = ["plugin/runtime/macos/node", "plugin/runtime/windows/node"];

export const modulePath = value => value.split(sep).join("/");
export const isTestSource = file => file.includes(".test.") || file.startsWith("tests/") || /(?:^|\/)(?:testing|__tests__|fixtures)(?:\/|$)/.test(file)
  || /^scripts\/(?:rehearsals|project-ownership|windows)\/rehearse-[^/]+\.(?:ts|mjs)$/.test(file);
export const isDeclarationSource = file => DECLARATION.test(file);
export const isCodeSource = file => CODE_FILE.test(file);
export const isPluginModule = file => (file.startsWith("plugin/bin/") || file.startsWith("plugin/runtime/"))
  && !NATIVE_TREES.some(prefix => file === prefix || file.startsWith(prefix + "/"))
  && isCodeSource(file) && !isTestSource(file) && !isDeclarationSource(file);

export function canonicalProjectRoot(projectRoot) {
  const absolute = resolve(projectRoot);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isDirectory()) throw new Error("Project root must be a regular directory");
  return realpathSync.native(absolute);
}

export function checkModulePath(root, file, { missing = false, directory = false } = {}) {
  const absolute = resolve(root, file), local = modulePath(relative(root, absolute));
  if (!local || local === ".." || local.startsWith("../") || isAbsolute(local)) throw new Error(`${file}: path leaves the project`);
  const parts = local.split("/");
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    if (!existsSync(current)) {
      try { lstatSync(current); } catch (error) {
        if (error.code === "ENOENT" && missing) return absolute;
        throw new Error(`${local}: path is missing`, { cause: error });
      }
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`${local}: symbolic link or junction refused`);
    const needsDirectory = index < parts.length - 1 || directory;
    if (needsDirectory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) throw new Error(`${local}: regular ${needsDirectory ? "directory" : "single-link file"} required`);
  }
  return absolute;
}

export function firstPartySources(root, directories) {
  const files = [];
  function visit(file) {
    if (NATIVE_TREES.some(prefix => file === prefix || file.startsWith(prefix + "/"))) return;
    const absolute = resolve(root, file), stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`${file}: source link refused`);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolute).sort()) if (!OMIT.has(entry)) visit(modulePath(join(file, entry)));
    } else if (stat.isFile() && isCodeSource(file)) {
      if (stat.nlink !== 1) throw new Error(`${file}: source hardlink refused`);
      files.push(file);
    }
  }
  for (const directory of directories) {
    try { lstatSync(resolve(root, directory)); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    visit(directory);
  }
  return files.sort();
}

function staticPrefix(expression) {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) return expression.head.text;
  if (ts.isParenthesizedExpression(expression)) return staticPrefix(expression.expression);
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) return staticPrefix(expression.left);
  return "";
}

export function readModuleReferences(file, source) {
  let ast, diagnostics;
  if (/\.[cm]?jsx?$/.test(file)) {
    const result = ts.transpileModule(source, {
      fileName: file, reportDiagnostics: true,
      compilerOptions: { allowJs: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve },
      transformers: { before: [() => node => { ast = node; return node; }] },
    });
    diagnostics = result.diagnostics ?? [];
  } else {
    ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    diagnostics = ast.parseDiagnostics;
  }
  if (!ast || diagnostics.length) throw new Error(`${file}: invalid module syntax: ${diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, " ")).join("; ")}`);
  const references = [], directives = new Set(), actionExports = new Set();
  let actionOnly = true;
  const line = node => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
  function add(node, expression, kind, runtime, bindings = []) {
    const literal = ts.isStringLiteralLike(expression);
    references.push({ specifier: literal ? expression.text : null, prefix: staticPrefix(expression), kind, runtime, bindings, line: line(node) });
  }
  for (const node of ast.statements) {
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) directives.add(node.expression.text);
    else break;
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause, bindings = clause?.namedBindings, names = [];
      if (clause?.name) names.push({ imported: "default", local: clause.name.text, typeOnly: Boolean(clause.isTypeOnly) });
      if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.map(item => ({ imported: (item.propertyName ?? item.name).text, local: item.name.text, typeOnly: Boolean(clause.isTypeOnly || item.isTypeOnly) })));
      else if (bindings) names.push({ imported: "*", local: bindings.name.text, typeOnly: Boolean(clause.isTypeOnly) });
      const runtime = !clause?.isTypeOnly && (names.length === 0 || names.some(item => !item.typeOnly));
      add(node, node.moduleSpecifier, "import", runtime, names);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const names = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(item => ({ imported: (item.propertyName ?? item.name).text, local: item.name.text, typeOnly: Boolean(node.isTypeOnly || item.isTypeOnly) }))
        : [{ imported: "*", local: "*", typeOnly: Boolean(node.isTypeOnly) }];
      add(node, node.moduleSpecifier, "export", !node.isTypeOnly && (names.length === 0 || names.some(item => !item.typeOnly)), names);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node, node.argument.literal, "type", false);
    } else if (ts.isCallExpression(node) && node.arguments.length && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      add(node, node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword ? "dynamic" : "require", true);
    }
    ts.forEachChild(node, visit);
    for (const doc of node.jsDoc ?? []) visit(doc);
  }
  visit(ast);
  for (const node of ast.statements) {
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) { actionOnly = false; continue; }
    if (!node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) continue;
    if (ts.isFunctionDeclaration(node) && node.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) actionExports.add(node.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : node.name?.text ?? "default");
    else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const value = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && value.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) actionExports.add(declaration.name.text);
        else actionOnly = false;
      }
    } else actionOnly = false;
  }
  return { references, directives, actionOnly, actionExports };
}

function manifestEntries(root) {
  const file = "packages/shared/plugin-exports.json";
  let manifest;
  try { manifest = JSON.parse(readFileSync(checkModulePath(root, file), "utf8")); }
  catch (error) { throw new Error(`${file}: cannot read plugin exports`, { cause: error }); }
  if (!manifest || Array.isArray(manifest) || Object.keys(manifest).sort().join() !== "entries,version" || manifest.version !== 1 || !Array.isArray(manifest.entries) || !manifest.entries.length) throw new Error(`${file}: expected version 1 and nonempty entries`);
  const seen = new Set();
  for (const entry of manifest.entries) {
    if (!entry || Array.isArray(entry) || Object.keys(entry).sort().join() !== "path,runtime" || typeof entry.path !== "string" || !MODULE_PATH.test(entry.path) || isTestSource(entry.path) || !["node", "universal"].includes(entry.runtime)) throw new Error(`${file}: invalid entry path or runtime`);
    if (seen.has(entry.path)) throw new Error(`${file}: duplicate entry ${entry.path}`);
    seen.add(entry.path);
  }
  return [...manifest.entries].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function readSharedModuleGraph(projectRoot = process.cwd()) {
  const root = canonicalProjectRoot(projectRoot), entries = manifestEntries(root);
  const runtimes = new Map(entries.map(entry => [entry.path, entry.runtime]));
  const modules = new Map();
  for (const file of firstPartySources(root, ["packages/shared"])) {
    if (isTestSource(file) || isDeclarationSource(file)) continue;
    const key = file.slice("packages/shared/".length);
    if (!MODULE_PATH.test(key)) throw new Error(`${file}: shared runtime modules must be kebab-case .mjs files`);
    const sourcePath = checkModulePath(root, file), bytes = readFileSync(sourcePath);
    modules.set(key, { file, sourcePath, bytes, ...readModuleReferences(file, bytes.toString("utf8")) });
  }
  const reached = new Set(), visited = new Set();
  function visit(key, runtime, chain) {
    const identity = runtime + ":" + key;
    if (visited.has(identity)) return;
    visited.add(identity);
    const record = modules.get(key), trace = [...chain, key];
    const fail = message => { throw new Error(`packages/shared/${key}: ${message} (${trace.join(" -> ")})`); };
    if (!record) fail("module is missing or is not a production module");
    if (runtime === "universal" && runtimes.get(key) === "node") fail("universal entry reaches a node entry");
    reached.add(key);
    for (const edge of record.references) {
      if (!edge.runtime) continue;
      const specifier = edge.specifier;
      if (!specifier || edge.kind === "require") fail("computed import or require is forbidden in shared runtime modules");
      if (isBuiltin(specifier)) {
        if (runtime !== "node") fail(`universal entry reaches ${specifier}`);
        continue;
      }
      if (!specifier.startsWith(".") || /[\\%?#]/.test(specifier) || !specifier.endsWith(".mjs")) fail(`invalid shared dependency ${specifier}`);
      const target = modulePath(relative(resolve(root, "packages/shared"), resolve(dirname(record.sourcePath), specifier)));
      if (!MODULE_PATH.test(target) || isTestSource(target)) fail(`dependency leaves shared production code: ${specifier}`);
      visit(target, runtime, trace);
    }
  }
  for (const entry of entries) visit(entry.path, entry.runtime, []);
  for (const key of modules.keys()) if (!reached.has(key)) throw new Error(`packages/shared/${key}: orphan production module is not reachable from plugin exports`);
  return { root, entries, runtimes, modules };
}
