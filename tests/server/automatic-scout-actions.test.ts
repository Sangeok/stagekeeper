import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { failure, success } from "../../src/fsd/shared/api/result";
import { projectPath } from "../../src/fsd/shared/routes/project";
import type { saveAutomaticScout } from "../../src/fsd/features/edit-pipeline/api/automatic-scout.server";

it("saves scouting through the authenticated owner scope on every plan and refreshes the project layout only on success", async () => {
  const source = readFileSync("src/fsd/features/edit-pipeline/api/automatic-scout.server.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const outcome of ["saved", "read-only", "refused"] as const) {
    const writes: unknown[] = []; const paths: unknown[] = []; const db = {};
    const exported = {} as { saveAutomaticScout: typeof saveAutomaticScout };
    const deps: Record<string, unknown> = {
      "next/cache": { revalidatePath: (...args: unknown[]) => paths.push(args) },
      "@/fsd/shared/api/result": { success, failure }, "@/fsd/shared/routes/project": { projectPath },
      "@/server/auth/guard": { requireProjectWrite: async (slug: string) => {
        assert.equal(slug, "mathgic");
        return outcome === "read-only" ? { ok: false, reason: "Not selected" } : { ok: true, userId: "owner", projectId: "project" };
      } },
      "@/server/db": { prisma: db },
      "@/server/automatic-scout": { setAutomaticScout: async (client: unknown, input: unknown) => {
        assert.equal(client, db); writes.push(input);
        return outcome === "refused" ? { ok: false, reason: "Project not found." } : { ok: true, item: false };
      } },
    };
    runInNewContext(code, { exports: exported, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
    const result = await exported.saveAutomaticScout("mathgic", false);
    assert.deepEqual(result, outcome === "saved" ? success(false) : failure(outcome === "read-only" ? "Not selected" : "Project not found."));
    assert.equal(writes.length, outcome === "read-only" ? 0 : 1);
    if (writes.length) assert.equal(JSON.stringify(writes[0]), JSON.stringify({ projectId: "project", userId: "owner", enabled: false }));
    assert.deepEqual(paths, outcome === "saved" ? [["/p/mathgic", "layout"]] : []);
  }
});
