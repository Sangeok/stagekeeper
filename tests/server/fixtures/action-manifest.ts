import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function manifestEntries(): { filename?: string; exportedName?: string; workers: object }[] {
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  assert.ok(manifest.node && manifest.edge && !Array.isArray(manifest.node) && !Array.isArray(manifest.edge), "fresh node/edge registries required");
  const entries = [...Object.values(manifest.node), ...Object.values(manifest.edge)];
  for (const entry of entries) {
    assert.ok(typeof entry === "object" && entry !== null && "workers" in entry && entry.workers !== null && typeof entry.workers === "object" && !Array.isArray(entry.workers));
    for (const worker of Object.values(entry.workers)) {
      assert.ok(typeof worker === "object" && worker !== null && "moduleId" in worker && "async" in worker);
      assert.ok(typeof worker.moduleId === "string" || typeof worker.moduleId === "number");
      assert.equal(typeof worker.async, "boolean");
    }
  }
  return entries as { filename?: string; exportedName?: string; workers: object }[];
}

export function assertActions(path: string, exports: string[]): void {
  const entries = manifestEntries().filter(entry => entry.filename?.replaceAll("\\", "/").endsWith(path));
  for (const name of exports) assert.ok(entries.some(entry => entry.exportedName === name), `${path}:${name} registered`);
}
