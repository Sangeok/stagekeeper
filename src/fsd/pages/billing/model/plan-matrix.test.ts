import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import { LIMITS, PLANS } from "@harness/core/entitlement.mjs";
import { planMatrix } from "./plan-matrix";

const BILLING_EXPORTS = ["PlanRow", "planMatrix", "BILLING_NOTE"];

function assertAccountPlanApi(source: string): void {
  const api = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
  const names = api.statements.flatMap(node => {
    if (ts.isExportDeclaration(node)) {
      assert.ok(node.exportClause && ts.isNamedExports(node.exportClause), "Use explicit named exports");
      return node.exportClause.elements.map(element => element.name.text);
    }
    if (!ts.canHaveModifiers(node) || !ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
    if ((ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.name) return [node.name.text];
    return [];
  });
  assert.ok(names.includes("planLabel"), "planLabel must remain public");
  for (const name of BILLING_EXPORTS) assert.ok(!names.includes(name), `${name} belongs to Billing`);
}

it("allows unrelated public exports but rejects missing labels and Billing leaks", () => {
  const source = readFileSync(new URL("../../../entities/account-plan/index.ts", import.meta.url), "utf8");
  assertAccountPlanApi(source + '\nexport type { Plan } from "@harness/core/entitlement.mjs";');
  assertAccountPlanApi(source + '\nexport { anotherLabel } from "./model/another-label";');
  assert.throws(() => assertAccountPlanApi('export type { Plan } from "@harness/core/entitlement.mjs";'), /planLabel/);
  for (const name of BILLING_EXPORTS) {
    assert.throws(() => assertAccountPlanApi(source + `\nexport type { ${name} } from "./model/leak";`), new RegExp(name));
    assert.throws(() => assertAccountPlanApi(source + `\nexport const ${name} = 1;`), new RegExp(name));
  }
});

it("owns the table declarations and consumes them through the Billing slice", () => {
  const moved = new Set(["PlanRow", "planMatrix", "BILLING_NOTE"]);
  for (const file of ["entitlement-copy.ts", "entitlement-copy.test.ts"]) assert.equal(existsSync(new URL(`../../../shared/lib/${file}`, import.meta.url)), false);
  const labels = ts.createSourceFile("plan-label.ts", readFileSync(new URL("../../../entities/account-plan/model/plan-label.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const names = labels.statements.flatMap(node => ts.isVariableStatement(node)
    ? node.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) ? [declaration.name.text] : [])
    : (ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name ? [node.name.text] : []);
  assert.ok(names.every(name => !moved.has(name)));
  assertAccountPlanApi(readFileSync(new URL("../../../entities/account-plan/index.ts", import.meta.url), "utf8"));
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

// Pro 차이는 /billing에만 보인다(검토 요청 7). 값은 LIMITS의 residentRunner에서 읽는다.
describe("planMatrix — background runner", () => {
  it("shows the background runner on Pro and Max only", () => {
    const row = planMatrix().find((r) => r.label === "Background runner");
    assert.ok(row, "the background runner row is missing");
    assert.deepEqual(row.values, { free: "—", pro: "Yes", max: "Yes" });
    assert.equal(planMatrix().at(-1)?.label, "Background runner");
  });
});
