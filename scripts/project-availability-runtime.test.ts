import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { it } from "node:test";
import ts from "typescript";

function violations(source: string, filename: string): string[] {
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const errors: string[] = [];
  const propertyName = (node: ts.PropertyName) => ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : "";
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && ["requireMember", "activeProjectIds", "projectMember"].includes(node.text)) errors.push(node.text);
    if (ts.isPropertyAccessExpression(node) && node.name.text === "locked") errors.push("locked access");
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name === "locked") errors.push("locked contract");
      if (name === "owner" && node.initializer.kind === ts.SyntaxKind.TrueKeyword) errors.push("legacy owner select");
      if (name === "members" && !(filename === "src/server/project-registration-query.ts" && ts.isObjectLiteralExpression(node.initializer)
        && node.initializer.properties.length === 1 && ts.isPropertyAssignment(node.initializer.properties[0])
        && propertyName(node.initializer.properties[0].name) === "create")) errors.push("membership relation read");
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
      && ["projectMember", "members", "locked"].includes(node.argumentExpression.text)) errors.push("legacy computed access");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression;
      if (ts.isPropertyAccessExpression(target) && target.name.text === "project" && node.expression.name.text.startsWith("find")) {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg) && !arg.properties.some((p) => ts.isPropertyAssignment(p) && propertyName(p.name) === "select")) errors.push("implicit full Project select");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return errors;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.[cm]?[jt]sx?$/.test(file) && !file.includes(".test.") ? [file] : [];
  });
}

it("contains no runtime membership reads, legacy policy, implicit owner projection, or locked contract", () => {
  const errors = ["src/app", "src/server", "src/fsd"].flatMap(sourceFiles).flatMap((file) => violations(readFileSync(file, "utf8"), relative(process.cwd(), file) || file).map((error) => `${file}: ${error}`));
  assert.deepEqual(errors, []);
});

it("detects aliased imports, relation reads and unsafe projections while allowing repository DTOs and the registration shadow", () => {
  for (const source of ['import { activeProjectIds as policy } from "core";', 'db.projectMember.count({});', 'db["projectMember"].findMany({});', 'db.project.findMany({ where: {} });', 'const q = { select: { owner: true } };', 'const q = { members: { some: {} } };']) {
    assert.ok(violations(source, "src/server/example.ts").length > 0, source);
  }
  assert.deepEqual(violations('const dto = { owner: repositoryOwner(row.repoOwner) };', "src/server/example.ts"), []);
  assert.deepEqual(violations('const data = { members: { create: { userId, role: "owner" } } };', "src/server/project-registration-query.ts"), []);
});

it("retires operational D1 apply before attempting a database connection", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/backfill-project-availability.ts", "--apply"], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--apply is retired/);
  assert.doesNotMatch(result.stderr, /DATABASE_URL/);
});
