import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, type TestContext } from "node:test";
import { readActionRegistry, resolveActionId } from "./fixtures/action-manifest";

const sourcePath = "src/fsd/features/connection/api/actions.server.ts";
const selection = { sourcePath, exportName: "disconnectRepository", runtime: "node" as const };
const worker = { moduleId: 42, async: true };
const action = (overrides = {}) => ({ filename: sourcePath, exportedName: selection.exportName, workers: { "app/projects/page": worker }, ...overrides });

function manifest(t: TestContext, value: unknown): string {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "stagekeeper-manifest-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "manifest.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

it("preserves runtime and ID, normalizes full paths, and allows multiple workers on one action", t => {
  const file = manifest(t, { node: { nodeId: action({ filename: "C:\\repo\\" + sourcePath.replaceAll("/", "\\"), workers: { first: worker, second: { moduleId: "other", async: false } } }) }, edge: { edgeId: action() } });
  const entries = readActionRegistry(file);
  assert.equal(resolveActionId(entries, selection), "nodeId");
  assert.equal(resolveActionId(entries, { ...selection, runtime: "edge" }), "edgeId");
  assert.equal(entries[0].filename, "C:/repo/" + sourcePath);
  assert.deepEqual(entries[0].workers, { first: worker, second: { moduleId: "other", async: false } });
});

it("rejects missing or ambiguous selections without runtime or generated-name fallback", t => {
  for (const node of [
    {},
    { a: action(), b: action() },
    { a: action({ exportedName: "$$RSC_SERVER_ACTION_0" }) },
    { a: action({ filename: "prefix" + sourcePath }) },
    { a: action({ filename: "other/" + sourcePath }) },
    { a: action({ filename: "src/other/actions.server.ts" }) },
    { a: action({ workers: {} }) },
  ]) {
    const entries = readActionRegistry(manifest(t, { node, edge: { edgeId: action() } }));
    assert.throws(() => resolveActionId(entries, selection));
  }
});

it("rejects malformed registries, entries and workers before selection", t => {
  for (const value of [
    null, { node: {}, edge: [] }, { node: [], edge: {} },
    ...[null, [], action({ filename: 1 }), action({ exportedName: false }), action({ workers: [] }),
      action({ workers: { first: null } }), action({ workers: { first: { moduleId: {}, async: true } } }),
      action({ workers: { first: { moduleId: 1, async: "true" } } })].map(entry => ({ node: { a: entry }, edge: {} })),
  ]) assert.throws(() => readActionRegistry(manifest(t, value)));
});

it("rereads changed manifests and selects named exports regardless of declaration order", t => {
  const file = manifest(t, { node: { first: action(), second: action({ exportedName: "reconnectRepository" }) }, edge: {} });
  assert.equal(resolveActionId(readActionRegistry(file), selection), "first");
  writeFileSync(file, JSON.stringify({ node: { newSecond: action({ exportedName: "reconnectRepository" }), newFirst: action() }, edge: {} }));
  assert.equal(resolveActionId(readActionRegistry(file), selection), "newFirst");
  assert.equal(resolveActionId(readActionRegistry(file), { ...selection, exportName: "reconnectRepository" }), "newSecond");
  writeFileSync(file, "{");
  assert.throws(() => readActionRegistry(file));
});
