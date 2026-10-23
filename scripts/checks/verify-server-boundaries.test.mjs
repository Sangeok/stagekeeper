import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { test } from "node:test";
import { inspectServerBoundaries } from "./verify-server-boundaries.mjs";

const base = {
  "src/server/projects/query.ts": "export const value = 1; export type Shape = { id: string };",
  "src/server/projects/api.ts": 'export { value } from "./query";',
  "src/server/projects/contracts.ts": "export type Input = { id: string };",
  "src/server/projects/api.server.ts": 'import "server-only"; export const bound = 1;',
  "src/server/tokens/query.ts": 'import { value } from "../projects/api"; export const token = value;',
  "src/server/tokens/api.ts": 'export { token } from "./query";',
  "src/server/db.ts": 'import "server-only"; export const db = {};',
};

function fixture(files, run, rows = []) {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(join(parent, "stagekeeper-server-boundaries-"));
  const write = (file, body) => { const target = resolve(root, file); assert.ok(target.startsWith(root + sep)); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body); };
  try {
    for (const [file, body] of Object.entries({ ...base, ...files })) write(file, body);
    write("docs/architecture/server.md", ["<!-- server-internal-tests:start -->", "| 시험 파일 | 내부 모듈 | 이유 |", "| --- | --- | --- |", ...rows.map(row => `| ${row.join(" | ")} |`), "<!-- server-internal-tests:end -->"].join("\n"));
    return run(root, write);
  } finally {
    assert.ok(resolve(root).startsWith(parent + sep));
    assert.ok(root.split(sep).at(-1).startsWith("stagekeeper-server-boundaries-"));
    rmSync(root, { recursive: true, force: true });
  }
}

function rejects(files, rule, rows) {
  fixture(files, root => {
    const result = inspectServerBoundaries(root);
    assert.ok(result.violations.some(item => item.rule === rule), JSON.stringify(result.violations));
    assert.ok(result.violations.every(item => item.file && item.line > 0 && item.message));
  }, rows);
}

test("fixture writes of virtual source paths are metadata rather than internal reads", () => fixture({
  "scripts/virtual.test.mjs": 'write(root, "src/server/projects/query.ts", "export const mock = 1;");',
}, root => assert.deepEqual(inspectServerBoundaries(root).violations, [])));

test("allows explicit public APIs, type contracts, local implementations and declared runtime assembly", () => fixture({
  "src/app/page.ts": 'import { value } from "@/server/projects/api"; import type { Input } from "@/server/projects/contracts";',
  "src/server/projects/owner.ts": 'import type { Input } from "./contracts"; import { value } from "./query";',
  "src/server/projects/query.test.ts": 'import { value } from "./query";',
  "src/server/rest/project-registration.ts": 'import { bound } from "../projects/api.server";',
  "src/server/rest/api.server.ts": 'import "server-only"; export { registerProject } from "./project-registration";',
}, root => assert.deepEqual(inspectServerBoundaries(root).violations, [])));

for (const [name, file, body, rule] of [
  ["cross-module alias private import", "src/server/tokens/query.ts", 'import { value } from "@/server/projects/query";', "private"],
  ["cross-module relative private import", "src/server/tokens/query.ts", 'import { value } from "../projects/query";', "private"],
  ["external alias private import", "src/app/page.ts", 'import { value } from "@/server/projects/query";', "private"],
  ["external relative private import", "src/app/page.ts", 'import { value } from "../server/projects/query";', "private"],
  ["disallowed value direction", "src/server/projects/query.ts", 'import { token } from "../tokens/api";', "direction"],
  ["disallowed type direction", "src/server/projects/query.ts", 'import type { Token } from "../tokens/contracts";', "direction"],
  ["type-query private path", "src/app/page.ts", 'type X = typeof import("@/server/projects/query");', "private"],
  ["literal dynamic private import", "src/app/page.ts", 'import("@/server/projects/query");', "private"],
  ["literal require private import", "src/app/page.ts", 'require("@/server/projects/query");', "private"],
  ["computed dynamic server import", "src/app/page.ts", 'import(`@/server/projects/${name}`);', "computed"],
  ["computed require server prefix", "src/app/page.ts", 'require("src/server/" + name);', "computed"],
  ["own alias aggregate", "src/server/projects/query.ts", 'import { value } from "@/server/projects/api";', "self-api"],
  ["own relative aggregate", "src/server/projects/query.ts", 'import { value } from "./api";', "self-api"],
  ["own runtime aggregate", "src/server/projects/query.ts", 'import { bound } from "./api.server";', "self-api"],
  ["wildcard value export", "src/server/projects/api.ts", 'export * from "./query";', "wildcard"],
  ["wildcard type export", "src/server/projects/contracts.ts", 'export type * from "./query";', "wildcard"],
  ["contracts runtime export", "src/server/projects/contracts.ts", "export const value = 1;", "contracts"],
  ["root imports feature", "src/server/result.ts", 'import { value } from "./projects/api";', "root-direction"],
  ["unlisted runtime assembly", "src/server/tokens/query.ts", 'import { bound } from "../projects/api.server";', "runtime-assembly"],
  ["unknown root implementation", "src/server/extra.ts", "export const value = 1;", "structure"],
  ["unregistered test private import", "tests/server/example.test.ts", 'import { value } from "../../src/server/projects/query";', "test-private"],
  ["unregistered VM source read", "tests/server/example.test.ts", 'const path = "src/server/projects/query.ts";', "test-private"],
]) test("rejects " + name, () => rejects({ "src/server/tokens/contracts.ts": "export type Token = string;", [file]: body }, rule));

for (const [name, middle] of [
  ["database", 'export { db as value } from "../db";'],
  ["runtime public entry", 'export { bound as value } from "./api.server";'],
  ["server-only implementation", 'import "server-only"; export const value = 1;'],
  ["auth initialization", 'export { auth as value } from "../auth/index";'],
]) test("rejects transitive " + name + " initialization from a pure entry", () => rejects({
  "src/server/projects/query.ts": middle,
  "src/server/auth/index.ts": 'import "server-only"; export const auth = {};',
}, "initialization"));

test("rejects runtime dependencies in type-only contract provenance", () => rejects({
  "src/server/projects/contracts.ts": 'export type { Shape } from "./runtime";',
  "src/server/projects/runtime.ts": 'import "server-only"; export type Shape = string;',
}, "initialization"));

test("rejects internal contracts that merely re-export the owning implementation", () => rejects({
  "src/server/projects/contracts.ts": 'export type { Shape } from "./query";',
  "src/server/projects/owner.ts": 'import type { Shape } from "./contracts";',
}, "self-contract"));

test("normalizes directory, extension and explicit index resolution before checking privacy", () => rejects({
  "src/server/projects/private/index.ts": "export const value = 1;",
  "src/server/tokens/query.ts": 'import { value } from "../projects/private/index.js";',
}, "private"));

test("reports module cycles including type edges", () => rejects({
  "src/server/projects/query.ts": 'import type { Token } from "../tokens/contracts"; export const value = 1;',
  "src/server/tokens/contracts.ts": 'import type { Input } from "../projects/contracts"; export type Token = Input;',
}, "cycle"));

test("permits only the two preserved auth assembly edges", () => fixture({
  "src/server/auth/index.ts": 'import "server-only"; export const auth = {};',
  "src/server/auth/guard.ts": 'import { auth } from "./index";',
  "src/server/auth/config.base.ts": "export const authConfigBase = {};",
  "src/server/auth/config.ts": 'import { authConfigBase } from "./config.base";',
}, (root, write) => {
  assert.deepEqual(inspectServerBoundaries(root).violations, []);
  write("src/server/auth/extra.ts", 'import { auth } from "./index";');
  assert.ok(inspectServerBoundaries(root).violations.some(item => item.rule === "self-api"));
}));

test("registers exact test files and detects stale or blanket registry entries", () => fixture({
  "tests/server/example.test.ts": 'import { value } from "../../src/server/projects/query";',
}, (root, write) => {
  assert.deepEqual(inspectServerBoundaries(root).violations, []);
  write("tests/server/example.test.ts", 'import { value } from "../../src/server/projects/api";');
  assert.ok(inspectServerBoundaries(root).violations.some(item => item.rule === "stale-registry"));
}, [["tests/server/example.test.ts", "projects", "DB fixture composition"]]));

test("rejects wildcard test registry exemptions", () => rejects({}, "registry", [["tests/server/*.test.ts", "projects", "blanket"]]));

for (const file of [
  "scripts/rehearsals/rehearse-project.ts",
  "scripts/project-ownership/rehearse-project.ts",
  "scripts/windows/rehearse-windows-project-build.mjs",
]) {
  test(`requires exact registration for ${file}`, () => {
    const body = 'import { value } from "../../src/server/projects/query";';
    rejects({ [file]: body }, "test-private");
    fixture({ [file]: body }, (root, write) => {
      assert.deepEqual(inspectServerBoundaries(root).violations, []);
      write(file, 'import { value } from "../../src/server/projects/api";');
      assert.ok(inspectServerBoundaries(root).violations.some(item => item.rule === "stale-registry"));
    }, [[file, "projects", "Isolated rehearsal fixture"]]);
  });
}

for (const file of [
  "scripts/rehearsals/helper.ts",
  "scripts/project-ownership/check-project-ownership-cleanup.ts",
  "scripts/windows/package-windows-plugin.mjs",
  "scripts/templates/rehearse-template.ts",
  "scripts/rehearsals/nested/rehearse-project.ts",
]) test(`does not grant test access to ${file}`, () => {
  const files = { [file]: 'import { value } from "@/server/projects/query";' };
  rejects(files, "private");
  rejects(files, "registry", [[file, "projects", "Invalid operational exemption"]]);
});

for (const tracked of [true, false]) test(`checks ${tracked ? "tracked" : "untracked"} positive and negative files`, () => fixture({}, (root, write) => {
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "--", "."], { cwd: root });
  write("src/app/positive.ts", 'import { value } from "@/server/projects/api";');
  if (tracked) execFileSync("git", ["add", "--", "."], { cwd: root });
  assert.deepEqual(inspectServerBoundaries(root).violations, []);
  write("src/app/negative.ts", 'import { value } from "@/server/projects/query";');
  if (tracked) execFileSync("git", ["add", "--", "."], { cwd: root });
  assert.ok(inspectServerBoundaries(root).violations.some(item => item.file === "src/app/negative.ts" && item.rule === "private"));
}));

test("ignores generated, dependency and build trees and variable-only VM require", () => fixture({
  "src/generated/extra.ts": 'import { value } from "@/server/projects/query";',
  "src/node_modules/extra.ts": 'import { value } from "@/server/projects/query";',
  "src/.next/extra.ts": 'import { value } from "@/server/projects/query";',
  "tests/server/loader.test.ts": "require(name);",
}, root => assert.deepEqual(inspectServerBoundaries(root).violations, [])));
