import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { assertActions, manifestEntries } from "./fixtures/action-manifest";

const read = (path: string) => readFileSync(path, "utf8");
const parse = (path: string) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const hasDirective = (source: ts.SourceFile, value: string) => source.statements.some(node => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === value);

const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name).replaceAll("\\", "/");
  return entry.isDirectory() ? sourceFiles(path) : /\.(ts|tsx|mjs)$/.test(path) ? [path] : [];
});
const namedExports = (source: ts.SourceFile) => source.statements.filter(ts.isExportDeclaration).flatMap(node => {
  assert.ok(node.exportClause && ts.isNamedExports(node.exportClause), "public API must use named exports");
  return node.exportClause.elements.map(element => ({ name: element.name.text, from: node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null, typeOnly: node.isTypeOnly || element.isTypeOnly }));
});

it("moved server compositions and schemas have exact public provenance and no bypass consumers across src", () => {
  assert.equal(existsSync("src/fsd/pages/project-inbox/index.ts"), false);
  const compositions = [
    ["ProjectInboxPage", "project-inbox", "src/app/(app)/p/[slug]/inbox/page.tsx"],
    ["ProjectTokensPage", "project-tokens", "src/app/(app)/p/[slug]/tokens/page.tsx"],
    ["UserTokensPage", "user-tokens", "src/app/(app)/settings/tokens/page.tsx"],
  ];
  for (const [name, slice] of compositions) {
    assert.ok(namedExports(parse(`src/fsd/pages/${slice}/index.server.ts`)).some(entry => entry.name === name && !entry.typeOnly && entry.from === `./ui/${slice}-page`));
    if (slice !== "project-inbox") assert.ok(namedExports(parse(`src/fsd/pages/${slice}/index.ts`)).every(entry => entry.typeOnly));
  }
  assert.deepEqual(namedExports(parse("src/fsd/entities/project-token/index.server.ts")), [{ name: "TokenTable", from: "./ui/token-table", typeOnly: false }]);
  assert.ok(namedExports(parse("src/fsd/entities/project-token/index.ts")).some(entry => entry.name === "TokenRow" && entry.typeOnly && entry.from === "./model/token-row"));
  assert.ok(!namedExports(parse("src/fsd/entities/project-token/index.ts")).some(entry => entry.name === "TokenTable"));
  const consumers: Record<string, string[]> = { TokenTable: [], ProjectInboxPage: [], ProjectTokensPage: [], UserTokensPage: [] };
  const schemas = ["retryAcceptanceInputSchema", "transitionInputSchema", "approveGateInputSchema", "discardInputSchema", "proposeInputSchema"];
  for (const path of sourceFiles("src")) {
    const ast = parse(path);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const from = node.moduleSpecifier.text;
      const binding = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
      const elements = binding && (ts.isNamedImports(binding) || ts.isNamedExports(binding)) ? binding.elements : [];
      if (from.includes("project-token") && path.startsWith("src/fsd/entities/project-token/")) assert.doesNotMatch(from, /features|pages|@\/server/);
      if (hasDirective(ast, "use client")) assert.doesNotMatch(from, /index\.server|token-table|project-tokens-page|user-tokens-page|project-inbox-page/);
      for (const element of elements) {
        const name = (element.propertyName ?? element.name).text;
        const typeOnly = element.isTypeOnly || (ts.isImportDeclaration(node) ? !!node.importClause?.isTypeOnly : node.isTypeOnly);
        if (ts.isImportDeclaration(node) && name in consumers && !typeOnly && !/\.test\.(?:ts|tsx|mjs)$/.test(path)) {
          consumers[name].push(path);
          const slice = name === "TokenTable" ? "entities/project-token" : `pages/${compositions.find(entry => entry[0] === name)![1]}`;
          assert.equal(from, `@/fsd/${slice}/index.server`, `${path}: server API required`);
        }
        if (schemas.includes(name) && path.includes("/index")) assert.fail(`${path}: schema must not enter a public Action barrel`);
        if (schemas.includes(name) && ts.isImportDeclaration(node) && !path.endsWith(".test.ts")) assert.ok(path.endsWith("/api/review-gate.server.ts") || path.endsWith("/api/propose-item.server.ts"));
      }
    }
  }
  for (const [name, , route] of compositions) assert.deepEqual(consumers[name], [route]);
  assert.deepEqual(consumers.TokenTable.sort(), ["src/fsd/pages/project-tokens/ui/project-tokens-page.tsx", "src/fsd/pages/user-tokens/ui/user-tokens-page.tsx"]);
  const table = parse("src/fsd/entities/project-token/ui/token-table.tsx");
  assert.ok(!hasDirective(table, "use client") && !hasDirective(table, "use server"));
  for (const node of table.statements.filter(ts.isImportDeclaration)) if (ts.isStringLiteral(node.moduleSpecifier)) assert.doesNotMatch(node.moduleSpecifier.text, /features|pages|@\/server|server-only/);
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh Action registry contains all mutations and no display, loader, composition or schema modules", () => {
  assertActions("src/fsd/features/review-gate/api/review-gate.server.ts", ["retryAcceptance", "humanTransition", "approveGate", "discardItem"]);
  assertActions("src/fsd/features/propose-item/api/propose-item.server.ts", ["proposeItem"]);
  const forbidden = /token-table|project-(?:inbox|tokens)-page|user-tokens-page|review-gate-input|propose-input|project-board\.server|project-history\.server|inbox-data\.server/;
  for (const entry of manifestEntries()) assert.doesNotMatch(entry.filename ?? "", forbidden);
});

it("renders the canonical neutral fallback and retries without inferring a mutation outcome", () => {
  const source = read("src/fsd/features/review-gate/ui/inbox-card-boundary.tsx");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  let fallback!: (props: { itemKey: string }, info: { retry: () => void }) => ReactElement;
  const require = createRequire(import.meta.url);
  runInNewContext(code, { exports: {}, require: (name: string) => {
    if (name === "next/error") return { catchError: (render: typeof fallback) => { fallback = render; return () => null; } };
    if (name === "@/fsd/shared/ui/card") return { cardClass: () => "card" };
    if (name === "@/fsd/shared/ui/button") return { Button: (props: object) => createElement("button", props) };
    if (name === "react/jsx-runtime") return require(name);
    throw new Error(`Unexpected boundary dependency: ${name}`);
  } });
  let retries = 0;
  const tree = fallback({ itemKey: "K-1" }, { retry: () => { retries++; } });
  const html = renderToStaticMarkup(tree);
  const copy = "This card couldn't be loaded. Try again to check the latest Inbox state.";
  assert.ok(html.includes(copy.replace("'", "&#x27;")));
  assert.ok(read("docs/conventions/product-copy.md").includes(copy));
  const children = tree.props as { children: ReactElement[] };
  const buttonContainer = children.children[2].props as { children: ReactElement<{ onClick: () => void }> };
  buttonContainer.children.props.onClick();
  assert.equal(retries, 1);
});

it("keeps the static Inbox card behind the server API and JSX below the existing client boundary/provider", () => {
  const path = "src/fsd/features/review-gate/ui/inbox-card.tsx"; const source = parse(path);
  assert.equal(hasDirective(source, "use client"), false);
  assert.equal(hasDirective(source, "use server"), false);
  const clientExports = parse("src/fsd/features/review-gate/index.ts").statements.filter(ts.isExportDeclaration)
    .flatMap(node => node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(element => element.name.text) : []);
  assert.ok(!clientExports.includes("InboxCard"));
  assert.match(read("src/fsd/features/review-gate/index.server.ts"), /export \{ InboxCard \} from "\.\/ui\/inbox-card"/);
  assert.match(read("src/fsd/pages/project-inbox/ui/project-inbox-page.tsx"), /import \{ InboxCard \} from "@\/fsd\/features\/review-gate\/index\.server"/);
  const wrapper = source.statements.filter(ts.isFunctionDeclaration).find(node => node.name?.text === "InboxCard"); assert.ok(wrapper?.body);
  const tags: string[] = []; let eager = false;
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) tags.push(node.tagName.getText(source));
    if (ts.isCallExpression(node) && node.expression.getText(source) === "InboxCardContent") eager = true;
    ts.forEachChild(node, visit);
  };
  visit(wrapper.body); assert.deepEqual(tags, ["InboxCardBoundary", "GateCardLock", "InboxCardContent"]); assert.equal(eager, false);
  const controls = parse("src/fsd/features/review-gate/ui/inbox-card-controls.tsx"); assert.ok(hasDirective(controls, "use client"));
  for (const node of controls.statements.filter(ts.isImportDeclaration)) {
    if (ts.isStringLiteral(node.moduleSpecifier)) assert.doesNotMatch(node.moduleSpecifier.text, /@\/server|index\.server|\.server$|inbox-card$/);
  }
});

it("checks the fresh inbox client-reference manifest when explicitly run after build", { skip: process.env.SRC_CHECK_INBOX_MANIFEST !== "true" }, () => {
  const files: string[] = [];
  const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (entry.name === "page_client-reference-manifest.js") files.push(path);
  } };
  walk(".next/server/app");
  assert.ok(files.length > 0, "fresh client manifests are required");
  const allModules: string[] = [];
  for (const file of files) {
    const context = { globalThis: {} as { __RSC_MANIFEST?: Record<string, { clientModules: Record<string, unknown> }> } };
    runInNewContext(read(file), context);
    assert.ok(context.globalThis.__RSC_MANIFEST);
    for (const manifest of Object.values(context.globalThis.__RSC_MANIFEST)) { assert.ok(manifest.clientModules && typeof manifest.clientModules === "object"); allModules.push(...Object.keys(manifest.clientModules)); }
  }
  assert.ok(!allModules.some(name => /[\\/](token-table|project-inbox-page|project-tokens-page|user-tokens-page)\.tsx$/.test(name)));
  assert.ok(allModules.some(name => name.includes("rename-token-form.tsx")));
  assert.ok(allModules.some(name => name.includes("rename-user-token-form.tsx")));
  const routes = JSON.parse(read(".next/server/app-paths-manifest.json"));
  for (const route of ["/page", "/(app)/p/[slug]/page", "/(app)/p/[slug]/backlog/page", "/(app)/p/[slug]/tokens/page", "/(app)/p/[slug]/inbox/page", "/(app)/p/[slug]/items/[key]/page", "/(app)/settings/tokens/page", "/(app)/p/new/page"]) { assert.equal(typeof routes[route], "string", route); assert.ok(existsSync(join(".next/server", routes[route]))); }
  assert.equal(existsSync("app"), false);
  const path = files.find(file => file.replaceAll("\\", "/").includes("/(app)/p/[slug]/inbox/")); assert.ok(path);
  const context = { globalThis: {} as { __RSC_MANIFEST?: Record<string, { clientModules: Record<string, unknown> }> } };
  runInNewContext(read(path), context);
  const manifests = context.globalThis.__RSC_MANIFEST; assert.ok(manifests);
  const modules = Object.values(manifests).flatMap(manifest => Object.keys(manifest.clientModules));
  assert.ok(modules.some(name => name.includes("inbox-card-controls.tsx")));
  assert.ok(modules.some(name => name.includes("inbox-card-boundary.tsx")));
  assert.ok(modules.some(name => name.includes("gate-card-lock.tsx")));
  assert.ok(!modules.some(name => /[\\/]inbox-card\.tsx$/.test(name)));
  const actions = JSON.parse(read(".next/server/server-reference-manifest.json")) as { node: Record<string, { filename?: string }> };
  assert.ok(!Object.values(actions.node).some(action => /(?:owner-gate|inbox-card)\.tsx?$/.test(action.filename ?? "")));
});
