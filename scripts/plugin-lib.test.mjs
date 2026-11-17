import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs, { existsSync, linkSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { diffPluginLib, syncPluginLib, validatePluginModulesForPackaging } from "./plugin-lib.mjs";
import { moduleProject, treeSnapshot, writeExports, writeModule } from "./lib/testing/shared-module-fixture.mjs";

const script = fileURLToPath(new URL("./plugin-lib.mjs", import.meta.url));
const cli = (root, args = []) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", windowsHide: true });

it("rejects unsupported arguments and keeps help independent of the project", t => {
  const root = moduleProject(t);
  writeModule(root, "plugin/lib/config.mjs", "old\n");
  writeModule(root, "plugin/lib/orphan.mjs", "orphan\n");
  const before = treeSnapshot(join(root, "plugin"));
  for (const args of [["--chek"], ["--check", "unexpected"], ["--help", "--check"]]) {
    const result = cli(root, args);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Usage:/);
    assert.deepEqual(treeSnapshot(join(root, "plugin")), before);
  }
  rmSync(join(root, "packages"), { recursive: true });
  const help = cli(root, ["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);
  assert.deepEqual(treeSnapshot(join(root, "plugin")), before);
});

it("keeps check read-only and reports missing, changed and orphaned files", t => {
  const root = moduleProject(t, [{ path: "a.mjs", runtime: "universal" }, { path: "nested/b.mjs", runtime: "universal" }]);
  writeModule(root, "plugin/lib/a.mjs", "old\n");
  writeModule(root, "plugin/lib/nested/retired.mjs", "old\n");
  const before = treeSnapshot(join(root, "plugin"));
  assert.deepEqual(diffPluginLib(root), { drift: ["a.mjs", "nested/b.mjs"], orphan: ["nested/retired.mjs"] });
  const checked = cli(root, ["--check"]);
  assert.equal(checked.status, 1, checked.stderr);
  assert.match(checked.stdout, /drift: plugin\/lib\/nested\/b.mjs/);
  assert.match(checked.stdout, /orphan: plugin\/lib\/nested\/retired.mjs/);
  assert.deepEqual(treeSnapshot(join(root, "plugin")), before);
});

it("builds a complete lib from source alone and preserves relative imports and bytes", async t => {
  const root = moduleProject(t, [{ path: "templates/public.mjs", runtime: "universal" }]);
  const helper = Buffer.from('export const value = "한글";\r\n');
  writeModule(root, "packages/shared/plans/internal.mjs", helper);
  writeModule(root, "packages/shared/templates/public.mjs", 'export { value } from "../plans/internal.mjs";\n');
  writeModule(root, "packages/shared/templates/public.test.mjs", "test-only");
  writeModule(root, "packages/shared/templates/public.d.mts", "export declare const value: string;\n");
  writeModule(root, "packages/shared/README.md", "developer metadata\n");
  assert.equal(existsSync(join(root, "plugin/lib")), false);
  assert.deepEqual(syncPluginLib(root), { drift: ["plans/internal.mjs", "templates/public.mjs"], orphan: [] });
  assert.deepEqual(readFileSync(join(root, "plugin/lib/plans/internal.mjs")), helper);
  assert.equal((await import(pathToFileURL(join(root, "plugin/lib/templates/public.mjs")).href)).value, "한글");
  for (const file of ["templates/public.test.mjs", "templates/public.d.mts", "README.md", "plugin-exports.json"]) assert.equal(existsSync(join(root, "plugin/lib", file)), false, file);
});

it("synchronizes only drift and owned orphans and is a no-op on the next run", t => {
  const root = moduleProject(t);
  writeModule(root, "plugin/lib/config.mjs", "old\n");
  writeModule(root, "plugin/lib/obsolete/retired.mjs", "old\n");
  writeModule(root, "plugin/lib/obsolete/.gitkeep", "keep\n");
  writeModule(root, "plugin/runtime/owned.mjs", "export const local = true;\n");
  const runtime = treeSnapshot(join(root, "plugin/runtime"));
  assert.deepEqual(syncPluginLib(root), { drift: ["config.mjs"], orphan: ["obsolete/retired.mjs"] });
  assert.equal(readFileSync(join(root, "plugin/lib/obsolete/.gitkeep"), "utf8"), "keep\n");
  const once = treeSnapshot(join(root, "plugin"));
  assert.deepEqual(syncPluginLib(root), { drift: [], orphan: [] });
  assert.deepEqual(treeSnapshot(join(root, "plugin")), once);
  assert.deepEqual(treeSnapshot(join(root, "plugin/runtime")), runtime);
  assert.equal(cli(root, ["--check"]).status, 0);
});

it("leaves lib bytes and paths unchanged when only app policies or server files change", t => {
  const root = moduleProject(t);
  syncPluginLib(root);
  const before = treeSnapshot(join(root, "plugin/lib"));
  writeModule(root, "packages/app-core/project.mjs", 'export const limit = 3;\n');
  writeModule(root, "src/server/policy.ts", 'export const limit = 4;\n');
  assert.deepEqual(syncPluginLib(root), { drift: [], orphan: [] });
  assert.deepEqual(treeSnapshot(join(root, "plugin/lib")), before);
});

it("removes a retired entry only after validating the remaining source graph", t => {
  const root = moduleProject(t, [{ path: "a.mjs", runtime: "universal" }, { path: "b.mjs", runtime: "universal" }]);
  syncPluginLib(root);
  writeExports(root, [{ path: "a.mjs", runtime: "universal" }]);
  const before = treeSnapshot(join(root, "plugin/lib"));
  assert.throws(() => syncPluginLib(root), /orphan production module/);
  assert.deepEqual(treeSnapshot(join(root, "plugin/lib")), before);
  rmSync(join(root, "packages/shared/b.mjs"));
  assert.deepEqual(syncPluginLib(root), { drift: [], orphan: ["b.mjs"] });
});

it("refuses malformed source or consumers before changing drift and orphan copies", t => {
  const cases = [
    root => writeModule(root, "packages/shared/plugin-exports.json", "{"),
    root => rmSync(join(root, "packages/shared/config.mjs")),
    root => writeModule(root, "packages/shared/config.mjs", 'import "./missing.mjs";'),
    root => writeModule(root, "packages/shared/config.mjs", 'import "node:crypto";'),
    root => writeModule(root, "packages/shared/config.mjs", 'export const load = name => import(name);'),
    root => writeModule(root, "packages/shared/orphan.mjs"),
    root => { writeModule(root, "packages/shared/config.mjs", 'export { value } from "./private.mjs";'); writeModule(root, "packages/shared/private.mjs"); writeModule(root, "plugin/bin/leak.mjs", 'export { value } from "../lib/private.mjs";'); },
  ];
  for (const change of cases) {
    const root = moduleProject(t);
    writeModule(root, "plugin/lib/config.mjs", "retained\n");
    writeModule(root, "plugin/lib/orphan.mjs", "retained orphan\n");
    change(root);
    const before = treeSnapshot(join(root, "plugin"));
    assert.throws(() => syncPluginLib(root));
    assert.deepEqual(treeSnapshot(join(root, "plugin")), before);
  }
});

it("refuses an escaping manifest without touching the existing lib or outside sentinel", t => {
  const root = moduleProject(t);
  writeModule(root, "outside.mjs", "outside\n");
  writeModule(root, "plugin/lib/config.mjs", "retained\n");
  const outside = treeSnapshot(join(root, "outside.mjs")), before = treeSnapshot(join(root, "plugin"));
  writeExports(root, [{ path: "../../outside.mjs", runtime: "universal" }]);
  assert.throws(() => syncPluginLib(root), /invalid entry/);
  assert.deepEqual(treeSnapshot(join(root, "plugin")), before);
  assert.deepEqual(treeSnapshot(join(root, "outside.mjs")), outside);
});

it("refuses destination directory links and file hardlinks without writing through them", t => {
  const linked = moduleProject(t, [{ path: "nested/value.mjs", runtime: "universal" }]);
  writeModule(linked, "outside/value.mjs", "sentinel\n");
  mkdirSync(join(linked, "plugin/lib"), { recursive: true });
  symlinkSync(join(linked, "outside"), join(linked, "plugin/lib/nested"), process.platform === "win32" ? "junction" : "dir");
  const outside = treeSnapshot(join(linked, "outside"));
  assert.throws(() => syncPluginLib(linked), /symbolic link or junction/);
  assert.deepEqual(treeSnapshot(join(linked, "outside")), outside);
  const hardlinked = moduleProject(t);
  writeModule(hardlinked, "outside.mjs", "sentinel\n");
  mkdirSync(join(hardlinked, "plugin/lib"), { recursive: true });
  linkSync(join(hardlinked, "outside.mjs"), join(hardlinked, "plugin/lib/config.mjs"));
  const hardlinkBefore = treeSnapshot(join(hardlinked, "outside.mjs"));
  assert.throws(() => syncPluginLib(hardlinked), /single-link file/);
  assert.deepEqual(treeSnapshot(join(hardlinked, "outside.mjs")), hardlinkBefore);
});

it("reports a partial write as failure and recovers with a fresh check and retry", t => {
  const root = moduleProject(t, [{ path: "a.mjs", runtime: "universal" }, { path: "b.mjs", runtime: "universal" }]);
  for (const file of ["a.mjs", "b.mjs", "retired.mjs"]) writeModule(root, "plugin/lib/" + file, "old\n");
  const write = fs.writeFileSync;
  t.mock.method(fs, "writeFileSync", (file, ...args) => {
    if (String(file) === join(root, "plugin/lib/b.mjs")) throw new Error("controlled interrupted write");
    return write(file, ...args);
  });
  syncBuiltinESMExports();
  try { assert.throws(() => syncPluginLib(root), /interrupted write/); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  assert.equal(readFileSync(join(root, "plugin/lib/a.mjs"), "utf8"), "export const value = 1;\n");
  assert.equal(readFileSync(join(root, "plugin/lib/b.mjs"), "utf8"), "old\n");
  assert.equal(existsSync(join(root, "plugin/lib/retired.mjs")), true);
  const check = cli(root, ["--check"]);
  assert.equal(check.status, 1, check.stderr);
  assert.match(check.stdout, /drift: plugin\/lib\/b.mjs/);
  assert.equal(cli(root).status, 0);
  assert.deepEqual(diffPluginLib(root), { drift: [], orphan: [] });
});

it("validates lib and owned plugin modules against the same tracked payload", t => {
  const root = moduleProject(t);
  writeModule(root, "plugin/runtime/qa/config.mjs", 'export { value } from "../../lib/config.mjs";');
  syncPluginLib(root);
  const files = ["plugin/lib/config.mjs", "plugin/runtime/qa/config.mjs"];
  const before = treeSnapshot(join(root, "plugin"));
  const result = validatePluginModulesForPackaging(root, files);
  assert.deepEqual([...result.libModules.keys()], ["plugin/lib/config.mjs"]);
  assert.deepEqual([...result.pluginModules.keys()], ["plugin/runtime/qa/config.mjs"]);
  for (const selected of [files.slice(1), files.slice(0, 1), [...files, "plugin/runtime/deleted.mjs"], [...files, "plugin/lib/config.d.mts"], [...files, "plugin/runtime/helper.d.mts"]]) assert.throws(() => validatePluginModulesForPackaging(root, selected), /payload/);
  assert.deepEqual(treeSnapshot(join(root, "plugin")), before);
  writeModule(root, "plugin/lib/config.mjs", "wrong\n");
  assert.throws(() => validatePluginModulesForPackaging(root, files), /not synchronized/);
});
