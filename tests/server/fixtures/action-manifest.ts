import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { posix } from "node:path";

type Runtime = "node" | "edge";
type Worker = { moduleId: string | number; async: boolean };
export type ActionEntry = {
  id: string;
  runtime: Runtime;
  filename?: string;
  exportedName?: string;
  workers: Record<string, Worker>;
};
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const normalize = (value: string) => posix.normalize(value.replaceAll("\\", "/"));

export function readActionRegistry(manifestPath: string): ActionEntry[] {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.ok(record(manifest) && record(manifest.node) && record(manifest.edge), "fresh node/edge registries required");
  const entries: ActionEntry[] = [];
  for (const runtime of ["node", "edge"] as const) {
    const registry: unknown = manifest[runtime];
    assert.ok(record(registry), "invalid action registry");
    for (const [id, entry] of Object.entries(registry)) {
      assert.ok(id && record(entry) && record(entry.workers), "invalid action entry");
      assert.ok(entry.filename === undefined || typeof entry.filename === "string" && entry.filename.length > 0, "invalid action filename");
      assert.ok(entry.exportedName === undefined || typeof entry.exportedName === "string" && entry.exportedName.length > 0, "invalid action export");
      const workers: Record<string, Worker> = {};
      for (const [name, worker] of Object.entries(entry.workers)) {
        assert.ok(name && record(worker), "invalid action worker");
        assert.ok(typeof worker.moduleId === "string" && worker.moduleId.length > 0 || typeof worker.moduleId === "number" && Number.isFinite(worker.moduleId), "invalid action worker module");
        assert.ok(typeof worker.async === "boolean", "invalid action worker async flag");
        workers[name] = { moduleId: worker.moduleId, async: worker.async };
      }
      entries.push({ id, runtime, filename: typeof entry.filename === "string" ? normalize(entry.filename) : undefined, exportedName: entry.exportedName, workers });
    }
  }
  return entries;
}

export function resolveActionId(entries: ActionEntry[], selection: { sourcePath: string; exportName: string; runtime: Runtime }): string {
  const sourcePath = normalize(selection.sourcePath);
  assert.ok(!posix.isAbsolute(sourcePath) && !sourcePath.startsWith("../") && sourcePath !== "." && !/^[A-Za-z]:/.test(sourcePath), "repository-relative source path required");
  const matches = entries.filter(entry => entry.runtime === selection.runtime && entry.exportedName === selection.exportName
    && (entry.filename === sourcePath || entry.filename !== undefined && (posix.isAbsolute(entry.filename) || /^[A-Za-z]:\//.test(entry.filename)) && entry.filename.endsWith("/" + sourcePath)));
  assert.equal(matches.length, 1, `Unique action registration required: ${selection.runtime}:${sourcePath}:${selection.exportName}`);
  assert.ok(Object.keys(matches[0].workers).length > 0, "Action workers required");
  return matches[0].id;
}

export function manifestEntries(): { filename?: string; exportedName?: string; workers: object }[] {
  return readActionRegistry(".next/server/server-reference-manifest.json");
}

export function assertActions(path: string, exports: string[]): void {
  const entries = manifestEntries().filter(entry => entry.filename?.endsWith(path.replaceAll("\\", "/")));
  for (const name of exports) assert.ok(entries.some(entry => entry.exportedName === name), `${path}:${name} registered`);
}
