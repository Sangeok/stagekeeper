import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import { LIMITS, PLANS } from "@harness/core/entitlement.mjs";
import { planMatrix } from "./plan-matrix";

it("owns the table declarations and consumes them through the Billing slice", () => {
  const moved = new Set(["PlanRow", "planMatrix", "BILLING_NOTE"]);
  for (const file of ["entitlement-copy.ts", "entitlement-copy.test.ts"]) assert.equal(existsSync(new URL(`../../../shared/lib/${file}`, import.meta.url)), false);
  const labels = ts.createSourceFile("plan-label.ts", readFileSync(new URL("../../../entities/account-plan/model/plan-label.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const names = labels.statements.flatMap(node => ts.isVariableStatement(node)
    ? node.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) ? [declaration.name.text] : [])
    : (ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name ? [node.name.text] : []);
  assert.ok(names.every(name => !moved.has(name)));
  const api = ts.createSourceFile("index.ts", readFileSync(new URL("../../../entities/account-plan/index.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const exports = api.statements.filter(ts.isExportDeclaration);
  assert.equal(exports.length, 1);
  assert.equal(exports[0].moduleSpecifier && ts.isStringLiteral(exports[0].moduleSpecifier) ? exports[0].moduleSpecifier.text : null, "./model/plan-label");
  const clause = exports[0].exportClause;
  assert.deepEqual(clause && ts.isNamedExports(clause) ? clause.elements.map(element => element.name.text) : [], ["planLabel"]);
  const page = ts.createSourceFile("billing-page.tsx", readFileSync(new URL("../ui/billing-page.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = page.statements.filter(ts.isImportDeclaration).flatMap(node => {
    const binding = node.importClause?.namedBindings;
    return binding && ts.isNamedImports(binding) && ts.isStringLiteral(node.moduleSpecifier)
      ? binding.elements.map(element => ({ name: element.name.text, from: (node.moduleSpecifier as ts.StringLiteral).text })) : [];
  });
  for (const name of ["planMatrix", "BILLING_NOTE"]) assert.deepEqual(imports.filter(entry => entry.name === name), [{ name, from: "../model/plan-matrix" }]);
  assert.deepEqual(imports.filter(entry => entry.name === "planLabel"), [{ name: "planLabel", from: "@/fsd/entities/account-plan" }]);
});

describe("planMatrix", () => {
  it("covers every plan in LIMITS — a new plan must not silently miss the table", () => {
    assert.equal(PLANS.length, Object.keys(LIMITS).length);
    for (const row of planMatrix()) {
      for (const plan of PLANS) assert.ok(row.values[plan], `${row.label} / ${plan}`);
    }
  });
  it("renders the unlimited axes as words, not Infinity", () => {
    const rows = planMatrix();
    const text = rows.flatMap((r) => PLANS.map((p) => r.values[p])).join(" ");
    assert.doesNotMatch(text, /Infinity/);
    assert.match(text, /Unlimited/);
  });
  it("reads the numbers from LIMITS rather than repeating them", () => {
    const projects = planMatrix().find((r) => r.label === "Projects");
    assert.equal(projects?.values.free, "1");
    assert.equal(projects?.values.pro, "5");
    assert.equal(projects?.values.max, "Unlimited");
  });

});

// 파이프라인 축 둘이 표에 줄로 선다 — 값은 LIMITS에서 읽으므로 표와 코드가 어긋날 수 없다.
describe("planMatrix — pipeline rows", () => {
  it("shows who may edit the graph", () => {
    const row = planMatrix().find((r) => r.label === "Pipeline editing");
    assert.ok(row);
    assert.deepEqual(row.values, { free: "Default only", pro: "Yes", max: "Yes" });
  });
  it("shows the dispatch cap with its window in the label", () => {
    const row = planMatrix().find((r) => r.label.startsWith("New agent runs per "));
    assert.ok(row, "the dispatch row is missing");
    assert.equal(row.label, "New agent runs per 5-hour window");
    assert.deepEqual(row.values, { free: "20", pro: "100", max: "Unlimited" });
  });
});
