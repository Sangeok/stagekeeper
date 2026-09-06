import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { diffPluginLib, syncPluginLib } from "./plugin-lib.mjs";

const temporaryProjects = [];

function project() {
  const root = mkdtempSync(join(tmpdir(), "stagekeeper-plugin-lib-"));
  temporaryProjects.push(root);
  return root;
}

function write(root, path, source = "export {};\n") {
  const target = join(root, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
}

afterEach(() => {
  for (const root of temporaryProjects.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("plugin-lib", () => {
  it("reports nothing when every core module has an identical copy", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "packages/core/config.test.mjs", "test only\n");
    write(root, "plugin/lib/config.mjs", "export const a = 1;\n");

    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: [] });
  });

  it("reports a changed or missing copy as drift", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "packages/core/vars.mjs", "export const v = 1;\n");
    write(root, "plugin/lib/config.mjs", "export const a = 2;\n");

    assert.deepEqual(diffPluginLib(root).drift, ["config.mjs", "vars.mjs"]);
  });

  it("reports a copy whose source is gone as orphan", () => {
    const root = project();
    write(root, "packages/core/config.mjs");
    write(root, "plugin/lib/config.mjs");
    write(root, "plugin/lib/removed.mjs");

    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: ["removed.mjs"] });
  });

  it("ignores test files and non-mjs files on both sides", () => {
    const root = project();
    write(root, "packages/core/config.mjs");
    write(root, "packages/core/config.test.mjs");
    write(root, "plugin/lib/config.mjs");
    write(root, "plugin/lib/.gitkeep", "");

    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: [] });
  });

  it("sync copies drift, removes orphans, and is a no-op when run again", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "plugin/lib/config.mjs", "export const a = 0;\n");
    write(root, "plugin/lib/removed.mjs");

    assert.deepEqual(syncPluginLib(root), { drift: ["config.mjs"], orphan: ["removed.mjs"] });
    assert.equal(existsSync(join(root, "plugin/lib/removed.mjs")), false);
    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: [] });
    assert.deepEqual(syncPluginLib(root), { drift: [], orphan: [] });
  });

  it("refuses to run when packages/core is missing (wrong working directory)", () => {
    const root = project();
    write(root, "plugin/lib/config.mjs");

    assert.throws(() => diffPluginLib(root), /packages\/core not found/);
    assert.throws(() => syncPluginLib(root), /packages\/core not found/);
    assert.equal(existsSync(join(root, "plugin/lib/config.mjs")), true);
  });
});
