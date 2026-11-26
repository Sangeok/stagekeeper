import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

type ClientManifest = { path: string; modules: string[] };
type ManifestScope = { globalThis: { __RSC_MANIFEST?: Record<string, { clientModules: Record<string, unknown> }> } };

function manifestPaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return manifestPaths(path);
    return entry.name === "page_client-reference-manifest.js" ? [path] : [];
  });
}

export function readClientManifests(): ClientManifest[] {
  return manifestPaths(".next/server/app").map((path) => {
    const scope: ManifestScope = { globalThis: {} };
    runInNewContext(readFileSync(path, "utf8"), scope);
    assert.ok(scope.globalThis.__RSC_MANIFEST);
    const modules = Object.values(scope.globalThis.__RSC_MANIFEST).flatMap((manifest) => {
      assert.ok(manifest.clientModules && typeof manifest.clientModules === "object");
      return Object.keys(manifest.clientModules);
    });
    return { path, modules };
  });
}
