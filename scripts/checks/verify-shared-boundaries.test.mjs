import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { inspectSharedBoundaries } from "./verify-shared-boundaries.mjs";
import { moduleProject, writeExports, writeModule } from "../lib/testing/shared-module-fixture.mjs";

const rules = root => inspectSharedBoundaries(root).violations.map(item => item.rule);

it("resolves public aliases and virtual lib imports before generated files exist", t => {
  const root = moduleProject(t);
  writeModule(root, "packages/app-core/rules.mjs", 'export { value } from "../shared/config.mjs";');
  writeModule(root, "src/policy.ts", 'export { value } from "@harness/app-core/rules.mjs";');
  writeModule(root, "src/client.ts", '"use client"; export { value } from "@harness/shared/config.mjs";');
  writeModule(root, "plugin/bin/tool.mjs", 'export { value } from "../lib/config.mjs";');
  const result = inspectSharedBoundaries(root);
  assert.deepEqual(result.violations, []);
  assert.deepEqual([...result.pluginModules.keys()], ["plugin/bin/tool.mjs"]);
  assert.equal(existsSync(join(root, "plugin/lib")), false);
});

it("keeps private shared helpers available only to their owning package and its tests", t => {
  const root = moduleProject(t);
  writeModule(root, "packages/shared/config.mjs", 'export { value } from "./internal.mjs";');
  writeModule(root, "packages/shared/internal.mjs");
  writeModule(root, "packages/shared/config.test.mjs", 'import { it } from "node:test"; import { value } from "./internal.mjs";');
  assert.deepEqual(rules(root), []);
  writeModule(root, "src/leak.ts", 'export { value } from "@harness/shared/internal.mjs";');
  writeModule(root, "plugin/runtime/leak.mjs", 'export { value } from "../lib/internal.mjs";');
  assert.equal(rules(root).filter(rule => rule === "shared/private-import").length, 2);
});

it("rejects app-core dependencies on server, plugin, npm and Node code", t => {
  const root = moduleProject(t);
  writeModule(root, "src/server/private.ts");
  writeModule(root, "plugin/runtime/private.mjs");
  for (const specifier of ["../../src/server/private.ts", "../../plugin/runtime/private.mjs", "zod", "node:crypto", "crypto"]) {
    writeModule(root, "packages/app-core/rules.mjs", `import ${JSON.stringify(specifier)};`);
    assert.ok(rules(root).includes("app-core/dependency"), specifier);
  }
});

it("allows Node test infrastructure without allowing production to import the test", t => {
  const root = moduleProject(t);
  writeModule(root, "packages/app-core/rules.mjs");
  writeModule(root, "packages/app-core/rules.test.mjs", 'import { it } from "node:test"; import assert from "node:assert/strict"; import { value } from "./rules.mjs";');
  assert.deepEqual(rules(root), []);
  writeModule(root, "packages/app-core/rules.mjs", 'import "./rules.test.mjs";');
  assert.ok(rules(root).includes("production/test-import"));
  writeModule(root, "packages/app-core/rules.mjs", 'import { it } from "node:test";');
  assert.ok(rules(root).includes("app-core/dependency"));
});

it("keeps type declarations inside the same ownership boundaries without runtime Node false positives", t => {
  const root = moduleProject(t, [{ path: "config.mjs", runtime: "node" }]);
  writeModule(root, "packages/shared/config.mjs", 'import { createHash } from "node:crypto"; export const value = createHash;');
  writeModule(root, "packages/shared/config.d.mts", 'export type Value = string;');
  writeModule(root, "src/client.ts", '"use client"; import type { Value } from "@harness/shared/config.mjs"; export type Output = Value;');
  assert.deepEqual(rules(root), []);
  writeModule(root, "src/server/contracts.ts", 'export type Private = string;');
  writeModule(root, "packages/app-core/rules.d.mts", 'import type { Private } from "../../src/server/contracts"; export type Value = Private;');
  assert.ok(rules(root).includes("app-core/dependency"));
});

it("rejects Node public entries in app-core even without a Client Component consumer", t => {
  const root = moduleProject(t, [{ path: "config.mjs", runtime: "node" }]);
  writeModule(root, "packages/shared/config.mjs", 'export const value = 1;');
  writeModule(root, "packages/app-core/rules.mjs", 'export { value } from "../shared/config.mjs";');
  assert.ok(rules(root).includes("app-core/node-import"));
});

it("reports indirect Node entry paths from a real client boundary", t => {
  const root = moduleProject(t, [{ path: "config.mjs", runtime: "node" }]);
  writeModule(root, "src/client.ts", '"use client"; export { value } from "./middle";');
  writeModule(root, "src/middle.ts", 'export { value } from "@harness/shared/config.mjs";');
  const failure = inspectSharedBoundaries(root).violations.find(item => item.rule === "browser/node-import");
  assert.match(failure.message, /src\/client.ts -> src\/middle.ts -> packages\/shared\/config.mjs/);
});

it("recognizes an async Server Function reference while still rejecting ordinary server imports", t => {
  const root = moduleProject(t);
  writeModule(root, "src/client.ts", '"use client"; import { action } from "./actions"; export { action };');
  writeModule(root, "src/actions.ts", '"use server"; import { randomUUID } from "node:crypto"; export async function action() { return randomUUID(); }');
  assert.deepEqual(rules(root), []);
  writeModule(root, "src/actions.ts", 'import { randomUUID } from "node:crypto"; export async function action() { return randomUUID(); }');
  assert.ok(rules(root).includes("browser/node-import"));
  writeModule(root, "src/actions.ts", '"use server"; import { randomUUID } from "node:crypto"; export const action = randomUUID;');
  assert.ok(rules(root).includes("browser/node-import"));
});

it("does not turn a shared Node entry into a client module through a use-server marker", t => {
  const root = moduleProject(t, [{ path: "config.mjs", runtime: "node" }]);
  writeModule(root, "packages/shared/config.mjs", '"use server"; export async function action() { return 1; }');
  writeModule(root, "src/client.ts", '"use client"; import { action } from "@harness/shared/config.mjs";');
  assert.ok(rules(root).includes("browser/node-import"));
});

it("requires plugin consumers to use lib and rejects application imports", t => {
  const root = moduleProject(t);
  writeModule(root, "src/server/private.ts");
  writeModule(root, "packages/app-core/rules.mjs");
  for (const specifier of ["../../packages/shared/config.mjs", "../../packages/app-core/rules.mjs", "../../src/server/private.ts"]) {
    writeModule(root, "plugin/bin/tool.mjs", `import ${JSON.stringify(specifier)};`);
    assert.ok(rules(root).some(rule => rule === "plugin/source-import" || rule === "plugin/app-import"), specifier);
  }
  writeModule(root, "outside.mjs");
  for (const specifier of ["../../outside.mjs", "some-external-package"]) {
    writeModule(root, "plugin/bin/tool.mjs", `import ${JSON.stringify(specifier)};`);
    assert.ok(rules(root).includes("plugin/external-runtime"), specifier);
  }
});

it("rejects a computed lib or shared path without banning existing native dispatch expressions", t => {
  const root = moduleProject(t);
  writeModule(root, "plugin/bin/tool.mjs", 'const name = "config.mjs"; export const load = () => import("../lib/" + name);');
  assert.ok(rules(root).includes("shared/computed-import"));
  writeModule(root, "plugin/bin/tool.mjs", 'export const load = file => import(file);');
  assert.deepEqual(rules(root), []);
  writeModule(root, "src/client.ts", 'export const load = name => import("../packages/shared/" + name);');
  assert.ok(rules(root).includes("shared/computed-import"));
});

it("excludes native Node and npm code before parsing it and still checks first-party files", t => {
  const root = moduleProject(t);
  for (const system of ["macos", "windows"]) writeModule(root, `plugin/runtime/${system}/node/npm/vendor.js`, 'invalid [ source; import "missing";');
  writeModule(root, "plugin/runtime/owned.mjs", 'export { value } from "../lib/config.mjs";');
  const result = inspectSharedBoundaries(root);
  assert.deepEqual(result.violations, []);
  assert.deepEqual([...result.pluginModules.keys()], ["plugin/runtime/owned.mjs"]);
  writeModule(root, "plugin/runtime/owned.mjs", 'export { value } from "../../packages/shared/config.mjs";');
  assert.ok(rules(root).includes("plugin/source-import"));
});

it("reports legacy aliases, unresolved local paths and plugin TypeScript runtime sources", t => {
  const root = moduleProject(t);
  writeModule(root, "src/legacy.ts", 'import "@harness/core/project-slug.mjs"; import "./absent";');
  writeModule(root, "plugin/runtime/unsupported.ts", 'export const value: number = 1;');
  assert.ok(rules(root).includes("shared/legacy-path"));
  assert.ok(rules(root).includes("module/unresolved"));
  assert.ok(rules(root).includes("plugin/typescript-runtime"));
});

it("rejects a graph from a different checkout", t => {
  const root = moduleProject(t), other = moduleProject(t);
  assert.throws(() => inspectSharedBoundaries(root, { graph: { root: other } }), /another project/);
  writeExports(root, [{ path: "config.mjs", runtime: "universal" }]);
  assert.deepEqual(rules(root), []);
});
