import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { it } from "node:test";
import ts from "typescript";

const parse = path => ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
const imports = source => source.statements.filter(node => ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
  .flatMap(node => node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? [node.moduleSpecifier.text] : []);
const exported = source => source.statements.filter(ts.isExportDeclaration).flatMap(node =>
  node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(element => element.name.text) : []);
const directive = (source, value) => source.statements.some(node => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === value);
const identifiers = source => {
  const names = new Set();
  const visit = node => { if (ts.isIdentifier(node)) names.add(node.text); ts.forEachChild(node, visit); };
  visit(source); return names;
};

const loaders = [
  { slice: "board-item", file: "board-item-page.server.ts", name: "loadBoardItemPage", route: "src/app/(app)/p/[slug]/items/[key]/page.tsx" },
  { slice: "project-backlog", file: "project-backlog-page.server.ts", name: "loadProjectBacklogPage", route: "src/app/(app)/p/[slug]/backlog/page.tsx" },
];

it("page loaders expose only server reads while route ownership and Action composition remain at the entrypoint", () => {
  for (const { slice, file, name, route } of loaders) {
    const loader = parse(`src/fsd/pages/${slice}/api/${file}`);
    assert.ok(imports(loader).includes("server-only"));
    assert.ok(!directive(loader, "use server") && !directive(loader, "use client"));
    assert.ok(!imports(loader).some(path => path.startsWith("next/") || path.startsWith("@/server/auth")));
    assert.deepEqual(exported(parse(`src/fsd/pages/${slice}/index.server.ts`)), [name]);
    const client = exported(parse(`src/fsd/pages/${slice}/index.ts`));
    assert.ok(!client.includes(name) && !client.includes("toItemDocs"));
    const routeImports = imports(parse(route));
    assert.ok(routeImports.includes(`@/fsd/pages/${slice}/index.server`));
    assert.ok(routeImports.includes("@/server/auth/guard"));
    assert.ok(!routeImports.some(path => path === "@/server/db" || path.startsWith("@/server/pipeline/") || path.startsWith("@/server/projects/") || path.startsWith("@harness/core/")));
    assert.ok(!identifiers(parse(route)).has("toItemDocs"));
  }
  assert.ok(imports(parse("src/fsd/pages/board-item/api/board-item-page.server.ts")).includes("../model/item-docs"));
});

it("pipeline display props disappear without removing the five settings Actions or exposing the reference card", () => {
  const removed = ["autoProposeEnabled", "autoScoutEnabled", "canChangeAutoScout", "saveAutoScout", "automationControls"];
  for (const path of ["src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx", "src/fsd/features/edit-pipeline/ui/pipeline-list.tsx", "src/fsd/features/edit-pipeline/ui/pipeline-rules-panel.tsx"]) {
    const names = identifiers(parse(path));
    for (const name of removed) assert.ok(!names.has(name), `${path}:${name}`);
  }
  const list = parse("src/fsd/features/edit-pipeline/ui/pipeline-list.tsx");
  const actions = list.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === "PipelineSettingsActions");
  assert.ok(actions && ts.isTypeLiteralNode(actions.type));
  assert.deepEqual(actions.type.members.map(member => member.name.getText(list)), ["archive", "rename", "setDefault", "setRule", "setAutomaticPick"]);
  assert.ok(identifiers(parse("src/app/(app)/p/[slug]/pipeline/page.tsx")).has("setAutomaticPickAction"));
  assert.ok(exported(parse("src/fsd/features/edit-pipeline/index.server.ts")).includes("setAutomaticPickAction"));
  const rail = parse("src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx");
  const card = rail.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ReferencedPipelineCard");
  assert.ok(card && !card.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
  assert.ok(!exported(parse("src/fsd/features/edit-pipeline/index.ts")).includes("ReferencedPipelineCard"));
});

const routerTests = [
  "src/fsd/features/change-item-pipeline/ui/change-pipeline-control.test.ts",
  "src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts",
  "src/fsd/features/edit-pipeline/ui/pipeline-list.test.ts",
  "src/fsd/features/manage-project-connection/ui/project-connection-control.test.ts",
  "src/fsd/features/manage-token/ui/token-names.test.ts",
  "src/fsd/features/review-gate/ui/acceptance-failure.test.ts",
  "src/fsd/features/review-gate/ui/inbox-card.test.mjs",
  "src/fsd/pages/board-item/ui/board-item-page.test.ts",
  "src/fsd/pages/project-list/ui/project-list-page.test.mjs",
  "src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts",
  "src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts",
  "src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts",
  "src/fsd/widgets/turn-banner/ui/turn-banner.test.ts",
];

it("the complete static router consumer set uses a test-only public unit that cannot enter production imports", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd()).options;
  const graph = new Map();
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "generated") continue;
      const file = join(directory, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory()) walk(file);
      else if (/\.(?:tsx?|mjs)$/.test(file) && !file.endsWith(".d.ts")) {
        const dependencies = imports(parse(file)).flatMap(specifier => {
          const resolvedModule = ts.resolveModuleName(specifier, resolve(file), options, ts.sys).resolvedModule;
          return resolvedModule ? [relative(process.cwd(), resolvedModule.resolvedFileName).replaceAll("\\", "/")] : [];
        });
        graph.set(file, dependencies);
      }
    }
  }
  walk("src");
  for (const file of routerTests) {
    const names = imports(parse(file));
    assert.ok(names.includes("@/fsd/shared/lib/testing"), file);
    assert.ok(!names.some(name => name.includes("app-router-context")), file);
  }
  const helper = "src/fsd/shared/lib/testing/";
  for (const file of graph.keys()) {
    if (file.includes(".test.") || file.startsWith(helper)) continue;
    const queue = [file], seen = new Set();
    while (queue.length) {
      const next = queue.pop();
      if (seen.has(next)) continue;
      seen.add(next);
      assert.ok(!next.startsWith(helper), `${file} imports testing code through ${next}`);
      queue.push(...(graph.get(next) ?? []));
    }
  }
});

it("banner setup drops the unused flag while retaining the project existence read", () => {
  const model = parse("src/fsd/widgets/turn-banner/model/turn.ts");
  const setup = model.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === "SetupState");
  assert.ok(setup && ts.isTypeLiteralNode(setup.type));
  assert.deepEqual(setup.type.members.map(member => member.name.getText(model)), ["tokenIssued", "rosterSynced"]);
  const loader = parse("src/fsd/widgets/turn-banner/api/turn-data.server.ts");
  assert.ok(!identifiers(loader).has("autoScoutEnabled"));
  const calls = [];
  const visit = node => { if (ts.isCallExpression(node)) calls.push(node.expression.getText(loader)); ts.forEachChild(node, visit); };
  visit(loader);
  assert.ok(calls.includes("prisma.project.findUniqueOrThrow"));
});
