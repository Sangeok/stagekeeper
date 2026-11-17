import assert from "node:assert/strict";
import { linkSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { readModuleReferences, readSharedModuleGraph } from "./shared-module-graph.mjs";
import { moduleProject, writeExports, writeModule } from "./testing/shared-module-fixture.mjs";

it("follows shared imports, reexports and literal lazy imports without executing source", t => {
  const root = moduleProject(t, [{ path: "templates/public.mjs", runtime: "universal" }]);
  writeModule(root, "packages/shared/templates/public.mjs", 'export { value } from "./internal.mjs";\nexport const load = () => import("./lazy.mjs");\nthrow new Error("must not execute");\n');
  writeModule(root, "packages/shared/templates/internal.mjs", 'export const value = "contract";\n');
  writeModule(root, "packages/shared/templates/lazy.mjs");
  writeModule(root, "packages/shared/templates/public.test.mjs", 'import { it } from "node:test";\n');
  writeModule(root, "packages/shared/templates/public.d.mts", 'export declare const value: string;\n');
  writeModule(root, "packages/shared/README.md", "not runtime\n");
  const graph = readSharedModuleGraph(root);
  assert.deepEqual([...graph.modules.keys()], ["templates/internal.mjs", "templates/lazy.mjs", "templates/public.mjs"]);
  assert.deepEqual([...graph.runtimes], [["templates/public.mjs", "universal"]]);
  assert.equal(graph.modules.get("templates/internal.mjs").bytes.toString(), 'export const value = "contract";\n');
});

it("ignores import-shaped strings and distinguishes type references from runtime references", () => {
  const parsed = readModuleReferences("fixture.ts", 'import type { A } from "./a.mjs";\nexport { type B } from "./b.mjs";\nconst example = "import x from missing";\nexport type C = import("./c.mjs").C;\nexport const load = () => import("./runtime.mjs");\n');
  assert.deepEqual(parsed.references.map(edge => [edge.specifier, edge.runtime]), [["./a.mjs", false], ["./b.mjs", false], ["./c.mjs", false], ["./runtime.mjs", true]]);
});

it("rejects malformed manifests, unsafe names, duplicate entries and unknown runtimes", t => {
  const root = moduleProject(t);
  for (const manifest of [null, [], {}, { version: 2, entries: [] }, { version: 1, entries: [], extra: true },
    { version: 1, entries: [{ path: "config.mjs", runtime: "browser" }] },
    ...["../outside.mjs", "/absolute.mjs", "a\\b.mjs", "Upper.mjs", "config.test.mjs", "testing/helper.mjs", "a.mjs?x"].map(path => ({ version: 1, entries: [{ path, runtime: "universal" }] })),
    { version: 1, entries: [{ path: "config.mjs", runtime: "universal" }, { path: "config.mjs", runtime: "node" }] },
    { version: 1, entries: [{ path: "config.mjs", runtime: "node", exports: [] }] },
  ]) {
    writeModule(root, "packages/shared/plugin-exports.json", JSON.stringify(manifest));
    assert.throws(() => readSharedModuleGraph(root), /plugin-exports/);
  }
  writeModule(root, "packages/shared/plugin-exports.json", "{");
  assert.throws(() => readSharedModuleGraph(root), /cannot read plugin exports/);
});

it("rejects undeclared production files and missing dependencies", t => {
  const root = moduleProject(t);
  writeModule(root, "packages/shared/orphan.mjs");
  assert.throws(() => readSharedModuleGraph(root), /orphan production module/);
  unlinkSync(join(root, "packages/shared/orphan.mjs"));
  writeModule(root, "packages/shared/config.mjs", 'export { value } from "./missing.mjs";\n');
  assert.throws(() => readSharedModuleGraph(root), /config.mjs -> missing.mjs/);
});

it("refuses external, application, test and computed dependencies from shared source", t => {
  const root = moduleProject(t);
  const cases = [
    'import "zod";', 'import "../app-core/rules.mjs";', 'import "../../src/server/private.mjs";',
    'import "@harness/shared/config.mjs";', 'import "./config.test.mjs";', 'import "./config.d.mts";',
    'const name = "config"; export const load = () => import("./" + name + ".mjs");',
    'const module = require("./config.mjs");', 'import "node:crypto";', 'import "crypto";',
  ];
  for (const source of cases) {
    writeModule(root, "packages/shared/config.mjs", source);
    assert.throws(() => readSharedModuleGraph(root), /dependency|forbidden|universal/);
  }
});

it("permits Node builtins only in node closures and does not let an earlier node visit mask a universal path", t => {
  const root = moduleProject(t, [{ path: "a-node.mjs", runtime: "node" }]);
  writeModule(root, "packages/shared/a-node.mjs", 'export { value } from "./helper.mjs";');
  writeModule(root, "packages/shared/helper.mjs", 'import { createHash } from "node:crypto"; export const value = createHash;');
  assert.equal(readSharedModuleGraph(root).modules.size, 2);
  writeModule(root, "packages/shared/z-web.mjs", 'export { value } from "./helper.mjs";');
  writeExports(root, [{ path: "a-node.mjs", runtime: "node" }, { path: "z-web.mjs", runtime: "universal" }]);
  assert.throws(() => readSharedModuleGraph(root), /z-web.mjs -> helper.mjs/);
  writeModule(root, "packages/shared/z-web.mjs", 'export { value } from "./a-node.mjs";');
  assert.throws(() => readSharedModuleGraph(root), /universal entry reaches a node entry/);
});

it("terminates shared cycles and reads a fresh source snapshot for a later call", t => {
  const root = moduleProject(t);
  writeModule(root, "packages/shared/config.mjs", 'import "./helper.mjs"; export const value = 1;');
  writeModule(root, "packages/shared/helper.mjs", 'import "./config.mjs"; export const helper = true;');
  const first = readSharedModuleGraph(root);
  assert.equal(first.modules.size, 2);
  writeModule(root, "packages/shared/helper.mjs", 'import "./config.mjs"; export const helper = false;');
  const second = readSharedModuleGraph(root);
  assert.notDeepEqual(first.modules.get("helper.mjs").bytes, second.modules.get("helper.mjs").bytes);
});

it("rejects invalid JavaScript and TypeScript syntax in an mjs runtime module", t => {
  const root = moduleProject(t);
  for (const source of ['export const =;', 'export const value: number = 1;']) {
    writeModule(root, "packages/shared/config.mjs", source);
    assert.throws(() => readSharedModuleGraph(root), /invalid module syntax/);
  }
});

it("refuses shared source hardlinks before returning a distribution graph", t => {
  const root = moduleProject(t);
  writeModule(root, "outside.mjs");
  unlinkSync(join(root, "packages/shared/config.mjs"));
  linkSync(join(root, "outside.mjs"), join(root, "packages/shared/config.mjs"));
  assert.throws(() => readSharedModuleGraph(root), /hardlink/);
});

it("refuses a shared directory link to source outside the shared root", t => {
  const root = moduleProject(t);
  writeModule(root, "outside/helper.mjs");
  symlinkSync(join(root, "outside"), join(root, "packages/shared/linked"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => readSharedModuleGraph(root), /link refused/);
});

it("retains empty imports, empty reexports and default values beside named types as runtime edges", t => {
  for (const source of ['import {} from "node:crypto";', 'export {} from "node:crypto";']) {
    const root = moduleProject(t);
    writeModule(root, "packages/shared/config.mjs", source);
    assert.throws(() => readSharedModuleGraph(root), /universal entry reaches node:crypto/);
  }
  const parsed = readModuleReferences("fixture.ts", 'import value, { type Shape } from "./runtime.mjs"; import type {} from "./types.mjs";');
  assert.deepEqual(parsed.references.map(edge => [edge.specifier, edge.runtime]), [["./runtime.mjs", true], ["./types.mjs", false]]);
  assert.deepEqual(parsed.references[0].bindings.map(binding => [binding.imported, binding.typeOnly]), [["default", false], ["Shape", true]]);
});
