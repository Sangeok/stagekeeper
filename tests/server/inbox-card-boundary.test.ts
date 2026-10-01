import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const read = (path: string) => readFileSync(path, "utf8");
const parse = (path: string) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const hasDirective = (source: ts.SourceFile, value: string) => source.statements.some(node => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === value);

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
