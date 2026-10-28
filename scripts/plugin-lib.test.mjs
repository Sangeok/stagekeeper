import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { diffPluginLib, syncPluginLib } from "./plugin-lib.mjs";

const temporaryProjects = [];

function project() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-plugin-lib-"));
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
  it("rejects unsupported arguments before changing drifted or orphaned copies", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "plugin/lib/config.mjs", "export const a = 0;\n");
    write(root, "plugin/lib/orphan.mjs", "export const old = true;\n");
    for (const args of [["--chek"], ["--check", "unexpected"], ["--help", "--check"]]) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL("./plugin-lib.mjs", import.meta.url)), ...args], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Usage:/);
      assert.equal(readFileSync(join(root, "plugin/lib/config.mjs"), "utf8"), "export const a = 0;\n");
      assert.equal(existsSync(join(root, "plugin/lib/orphan.mjs")), true);
    }
  });

  it("prints help without requiring a project or writing plugin copies", () => {
    const root = project();
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./plugin-lib.mjs", import.meta.url)), "--help"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
    assert.equal(existsSync(join(root, "plugin")), false);
  });

  it("keeps check read-only and reports failure until the normal CLI synchronizes copies", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "plugin/lib/config.mjs", "export const a = 0;\n");
    const script = fileURLToPath(new URL("./plugin-lib.mjs", import.meta.url));
    const check = spawnSync(process.execPath, [script, "--check"], { cwd: root, encoding: "utf8" });
    assert.equal(check.status, 1, check.stderr);
    assert.equal(readFileSync(join(root, "plugin/lib/config.mjs"), "utf8"), "export const a = 0;\n");
    const sync = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(sync.status, 0, sync.stderr);
    assert.equal(readFileSync(join(root, "plugin/lib/config.mjs"), "utf8"), "export const a = 1;\n");
    assert.equal(spawnSync(process.execPath, [script, "--check"], { cwd: root }).status, 0);
  });

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

  it("reports nested drift and orphans using their complete relative paths", () => {
    const root = project();
    write(root, "packages/core/plans/limits.mjs", "export const limit = 20;\n");
    write(root, "packages/core/templates/render.mjs");
    write(root, "plugin/lib/plans/limits.mjs", "export const limit = 10;\n");
    write(root, "plugin/lib/templates/retired.mjs");

    assert.deepEqual(diffPluginLib(root), {
      drift: ["plans/limits.mjs", "templates/render.mjs"],
      orphan: ["templates/retired.mjs"],
    });
  });

  it("preserves nested imports and same-named modules when replacing a flat copy", async () => {
    const root = project();
    write(root, "packages/core/plans/rules.mjs", "export const limit = 20;\n");
    write(root, "packages/core/templates/rules.mjs", 'import { limit } from "../plans/rules.mjs";\nexport const allowed = limit > 0;\n');
    write(root, "packages/core/templates/rules.test.mjs", "test only\n");
    write(root, "packages/core/templates/rules.d.mts", "export declare const allowed: boolean;\n");
    write(root, "packages/core/README.md", "module map\n");
    write(root, "plugin/lib/rules.mjs");
    write(root, "plugin/lib/obsolete/nested/rules.mjs");
    write(root, "plugin/lib/obsolete/.gitkeep", "");

    assert.deepEqual(syncPluginLib(root), {
      drift: ["plans/rules.mjs", "templates/rules.mjs"],
      orphan: ["obsolete/nested/rules.mjs", "rules.mjs"],
    });
    const copied = await import(pathToFileURL(join(root, "plugin/lib/templates/rules.mjs")).href);
    assert.equal(copied.allowed, true);
    for (const file of ["rules.mjs", "obsolete/nested/rules.mjs", "templates/rules.test.mjs", "templates/rules.d.mts", "README.md"]) {
      assert.equal(existsSync(join(root, "plugin/lib", file)), false, file);
    }
    assert.equal(existsSync(join(root, "plugin/lib/obsolete/.gitkeep")), true);
    assert.deepEqual(syncPluginLib(root), { drift: [], orphan: [] });
  });
});
