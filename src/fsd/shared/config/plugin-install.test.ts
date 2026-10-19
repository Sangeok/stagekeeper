import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import ts from "typescript";

import { PLUGIN_ID, PLUGIN_MARKETPLACE, installCommands } from "./plugin-install";

it("adds the public marketplace before installing the plugin it declares", () => {
  assert.deepEqual([...installCommands], [
    "claude plugin marketplace add Sangeok/stagekeeper",
    "claude plugin install harness@stagekeeper-local",
  ]);
  assert.match(PLUGIN_MARKETPLACE, /^[\w.-]+\/[\w.-]+$/);
  const manifest: unknown = JSON.parse(readFileSync(new URL("../../../../.claude-plugin/marketplace.json", import.meta.url), "utf8"));
  assert.ok(manifest && typeof manifest === "object" && "name" in manifest && "plugins" in manifest);
  assert.equal(typeof manifest.name, "string");
  assert.ok(Array.isArray(manifest.plugins));
  const plugin: unknown = manifest.plugins[0];
  assert.ok(plugin && typeof plugin === "object" && "name" in plugin && typeof plugin.name === "string");
  assert.equal(PLUGIN_ID, `${plugin.name}@${manifest.name}`);
});

it("keeps one public owner for installation values while preserving the Codex consumer", () => {
  const file = new URL("../../entities/project-token/model/connect-command.ts", import.meta.url);
  const source = ts.createSourceFile(file.pathname, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const moved = new Set(["PLUGIN_ID", "PLUGIN_MARKETPLACE", "installCommands"]);
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        assert.ok(!moved.has(declaration.name.getText(source)), "connect-command must not redeclare installation exports");
      }
    }
    if (ts.isExportDeclaration(statement)) {
      assert.ok(statement.exportClause && ts.isNamedExports(statement.exportClause), "no wildcard bypass of the config owner");
      for (const entry of statement.exportClause.elements) assert.ok(!moved.has(entry.name.text));
    }
  }
  const configImport = source.statements.find((statement) => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "@/fsd/shared/config/plugin-install");
  assert.ok(configImport && ts.isImportDeclaration(configImport));
  const bindings = configImport.importClause?.namedBindings;
  assert.ok(bindings && ts.isNamedImports(bindings));
  assert.deepEqual(bindings.elements.map((entry) => entry.name.text).sort(), ["PLUGIN_ID", "PLUGIN_MARKETPLACE"]);
  const tokenView = readFileSync(new URL("../../entities/project-token/ui/token-reveal.tsx", import.meta.url), "utf8");
  assert.match(tokenView, /import \{ installCommands \} from "@\/fsd\/shared\/config\/plugin-install"/);
});
