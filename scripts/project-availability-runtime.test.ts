import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
      if (name === "members") errors.push("membership relation read");
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

it("detects aliased imports, relation reads and unsafe projections while allowing repository DTOs", () => {
  for (const source of ['import { activeProjectIds as policy } from "core";', 'db.projectMember.count({});', 'db["projectMember"].findMany({});', 'db.project.findMany({ where: {} });', 'const q = { select: { owner: true } };', 'const q = { members: { some: {} } };']) {
    assert.ok(violations(source, "src/server/example.ts").length > 0, source);
  }
  assert.deepEqual(violations('const dto = { owner: repositoryOwner(row.repoOwner) };', "src/server/example.ts"), []);
  assert.ok(violations('const data = { members: { create: { userId, role: "owner" } } };', "src/server/project-registration-query.ts").length > 0);
});

it("removes retired ownership tools and keeps only the D3 cleanup commands", () => {
  for (const file of ["scripts/backfill-project-availability.ts", "scripts/check-project-ownership.ts", "scripts/lib/project-availability-migration.ts", "scripts/project-availability-migration.test.ts", "scripts/rehearse-project-availability.ts", "scripts/rehearse-project-availability-d2.ts"]) {
    assert.equal(existsSync(file), false, file);
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const script of ["check:project-ownership", "backfill:project-availability", "test:project-availability:db", "test:project-availability:d2:db"]) assert.equal(pkg.scripts[script], undefined, script);
  for (const script of ["check:project-ownership:cleanup", "restore:project-ownership:shadow", "test:project-availability:d3:db"]) assert.equal(typeof pkg.scripts[script], "string", script);
});

it("keeps the final Prisma schema and generated client free of membership storage", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.doesNotMatch(schema, /model ProjectMember\b|\bmembers\s+ProjectMember\[\]|^\s+owner\s+String\b/m);
  assert.match(schema, /ownerUserId\s+String\b/);
  assert.match(schema, /repoOwner\s+String\b/);
  assert.match(schema, /ownerUser\s+User\s+@relation\("ProjectOwner"[^\n]*onDelete: Cascade/);
  assert.equal(existsSync("src/generated/prisma/models/ProjectMember.ts"), false);
  const generated = ["src/generated/prisma/client.ts", "src/generated/prisma/browser.ts", "src/generated/prisma/models.ts", "src/generated/prisma/internal/class.ts", "src/generated/prisma/internal/prismaNamespace.ts", "src/generated/prisma/internal/prismaNamespaceBrowser.ts"];
  for (const file of generated) assert.doesNotMatch(readFileSync(file, "utf8"), /ProjectMember|projectMember/);
  // 이 수는 멤버십 저장소 정책의 백스톱이다 — 위 단언들이 ProjectMember의 부재를 직접 보고,
  // 이 줄은 "생성된 모델이 조용히 늘지 않았나"를 본다. 모델을 정당하게 더하면 함께 올린다.
  // 18 = 17 + UserToken(사용자 단위 토큰, hu_).
  const modelFiles = readdirSync("src/generated/prisma/models").filter((file) => file.endsWith(".ts"));
  assert.equal(modelFiles.length, 18);
});
