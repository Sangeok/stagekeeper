import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { success, failure } from "../../src/fsd/shared/api/result";
import * as routes from "../../src/fsd/shared/routes/project";
import type { approveGate as ApproveGate } from "../../src/fsd/features/review-gate/api/review-gate.server";
import type { retryAcceptance as RetryAcceptance } from "../../src/fsd/features/review-gate/api/review-gate.server";

it("retry checks access/date first, revalidates three paths only after success and propagates uncertain commits", async () => {
  const code = ts.transpileModule(readFileSync("src/fsd/features/review-gate/api/review-gate.server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const require = createRequire(import.meta.url);
  for (const outcome of ["success", "refused", "invalid-date", "unavailable", "foreign", "guest", "precommit", "commit-unknown", "revalidate-failure"] as const) {
    const revalidated: string[] = []; let writes = 0; const original = new Error(outcome);
    const exports = {} as { retryAcceptance: typeof RetryAcceptance };
    const deps: Record<string, unknown> = {
      "next/cache": { revalidatePath: (path: string) => { if (outcome === "revalidate-failure") throw original; revalidated.push(path); } },
      "@/fsd/shared/api/result": { success, failure }, "@/fsd/shared/routes/project": routes,
      "@/server/auth/guard": { requireProjectWrite: async () => {
        if (outcome === "foreign" || outcome === "guest") throw original;
        return outcome === "unavailable" ? { ok: false, reason: "locked" } : { ok: true, userId: "owner", projectId: "p" };
      } },
      "@/server/pipeline/board": { retryAcceptance: async (projectId: string, input: { key: string; userId: string; expectedUpdatedAt: Date }) => {
        writes++; assert.equal(projectId, "p"); assert.equal(input.userId, "owner"); assert.equal(input.expectedUpdatedAt.getTime(), 0);
        if (outcome === "refused") return { ok: false, reason: "stale" };
        if (outcome === "precommit" || outcome === "commit-unknown") throw original;
        return { ok: true, item: null };
      } },
    };
    runInNewContext(code, { exports, Date, require: (name: string) => Object.hasOwn(deps, name) ? deps[name] : require(name) });
    const result = exports.retryAcceptance("sample", { key: "KEY", expectedUpdatedAt: outcome === "invalid-date" ? "invalid" : new Date(0).toISOString() });
    if (["foreign", "guest", "precommit", "commit-unknown", "revalidate-failure"].includes(outcome)) await assert.rejects(result, error => error === original);
    else if (outcome === "success") assert.deepEqual(await result, success());
    else assert.equal((await result).success, false);
    assert.equal(writes, ["invalid-date", "unavailable", "foreign", "guest"].includes(outcome) ? 0 : 1);
    assert.deepEqual(revalidated, outcome === "success" ? ["/p/sample", "/p/sample/inbox", "/p/sample/items/KEY"] : []);
  }
});

it("web approval revalidates exactly three paths only after confirmed success, and never reads advice", async () => {
  const code = ts.transpileModule(readFileSync("src/fsd/features/review-gate/api/review-gate.server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const require = createRequire(import.meta.url);
  for (const outcome of ["success", "refused", "precommit", "commit-unknown", "revalidate-failure"] as const) {
    const revalidated: string[] = []; let writes = 0; let advice = 0; const original = new Error(outcome);
    const exported = {} as { approveGate: typeof ApproveGate };
    const deps: Record<string, unknown> = {
      "next/cache": { revalidatePath: (path: string) => { if (outcome === "revalidate-failure") throw original; revalidated.push(path); } },
      "@/fsd/shared/api/result": { success, failure }, "@/fsd/shared/routes/project": routes,
      "@/server/auth/guard": { requireProjectWrite: async () => ({ ok: true, userId: "owner", projectId: "p" }) },
      "@/server/pipeline/board": { gate: async () => { writes++; if (outcome === "refused") return { ok: false, reason: "stale" };
        if (outcome === "precommit" || outcome === "commit-unknown") throw original;
        return { ok: true, item: { id: "written" } }; }, nextFor: () => { advice++; throw new Error("web must not read advice"); } },
    };
    runInNewContext(code, { exports: exported, Date, require: (name: string) => Object.hasOwn(deps, name) ? deps[name] : require(name) });
    const result = exported.approveGate("sample", { key: "KEY", gate: "before-accept", expectedUpdatedAt: new Date(0).toISOString() });
    if (outcome === "success") assert.deepEqual(await result, success());
    else if (outcome === "refused") assert.deepEqual(await result, failure("The board changed. Refresh and try again."));
    else await assert.rejects(result, error => error === original);
    assert.equal(writes, 1); assert.equal(advice, 0);
    assert.deepEqual(revalidated, outcome === "success" ? ["/p/sample", "/p/sample/inbox", "/p/sample/items/KEY"] : []);
  }
});
