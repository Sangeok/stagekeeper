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
import * as schemas from "../../src/fsd/features/review-gate/model/review-gate-input";
import { loadModule } from "./fixtures/load-module";
import type { ActionResult } from "../../src/fsd/shared/api/result";

type TransportAction = (...args: unknown[]) => Promise<ActionResult<void>>;
const reviewFile = "src/fsd/features/review-gate/api/review-gate.server.ts";
const timestamp = "1970-01-01T00:00:00.000Z";
const reviewError = "The board changed. Refresh and try again.";
const actions = [
  { name: "retryAcceptance", service: "retryAcceptance", file: reviewFile, input: { key: "KEY", expectedUpdatedAt: timestamp } },
  { name: "humanTransition", service: "transition", file: reviewFile, input: { key: "KEY", to: "on_hold", result: "", expectedUpdatedAt: timestamp } },
  { name: "approveGate", service: "gate", file: reviewFile, input: { key: "KEY", gate: "before-implement", gateEntry: { runId: "run", entryId: "entry" }, expectedUpdatedAt: timestamp } },
  { name: "discardItem", service: "discard", file: reviewFile, input: { key: "KEY", expectedUpdatedAt: timestamp } },
  { name: "proposeItem", service: "propose", file: "src/fsd/features/propose-item/api/propose-item.server.ts", input: { key: "KEY", agent: "dev", reason: " owner " } },
];

for (const target of actions) {
  const args = (slug: unknown, input: unknown): unknown[] => target.name === "discardItem"
    ? [slug, (input as { key?: unknown } | null)?.key, (input as { expectedUpdatedAt?: unknown } | null)?.expectedUpdatedAt] : [slug, input];
  const error = target.name === "proposeItem" ? "Couldn't put it on the board. Try again." : reviewError;
  const setup = (outcome = "success") => {
    let guards = 0; let writes = 0; let revalidations = 0;
    const exception = new Error(outcome);
    const serviceArgs: unknown[][] = [];
    const loaded = loadModule<Record<string, TransportAction>>(target.file, {
      "next/cache": { revalidatePath: () => { revalidations++; if (outcome === "revalidation") throw exception; } },
      "@/fsd/shared/api/result": { success, failure }, "@/fsd/shared/routes/project": routes,
      "@/server/auth/guard": { requireProjectWrite: async () => {
        guards++;
        if (outcome === "guest" || outcome === "foreign") throw exception;
        return outcome === "read-only" ? { ok: false, reason: "locked" } : { ok: true, projectId: "owned", userId: "owner" };
      } },
      "@/server/pipeline/board": { [target.service]: async (...values: unknown[]) => {
        writes++; serviceArgs.push(values);
        if (outcome === "precommit" || outcome === "commit-unknown") throw exception;
        return outcome === "stale" || outcome === "business" ? { ok: false, reason: outcome } : { ok: true, item: null };
      } },
    });
    return { call: loaded[target.name], exception, serviceArgs, counts: () => ({ guards, writes, revalidations }) };
  };
  it(`${target.name} rejects malformed slug/payload without a service or revalidation call`, async () => {
    for (const slug of [null, undefined, 0, {}, [], ""]) {
      const fixture = setup();
      assert.deepEqual(await fixture.call(...args(slug, target.input)), failure(error));
      assert.deepEqual(fixture.counts(), { guards: 0, writes: 0, revalidations: 0 });
    }
    const bad: unknown[] = [null, [], {}, { ...target.input, key: undefined }, { ...target.input, key: "" }, { ...target.input, key: 1 }, { ...target.input, key: {} }];
    if ("expectedUpdatedAt" in target.input) for (const value of [null, undefined, 0, {}, "invalid", ""]) bad.push({ ...target.input, expectedUpdatedAt: value });
    if (target.name === "humanTransition") for (const value of [null, 1, {}]) bad.push({ ...target.input, result: value });
    if (target.name === "approveGate") for (const value of [null, [], {}, { runId: 1, entryId: "entry" }, { runId: "run", entryId: null }]) bad.push({ ...target.input, gateEntry: value });
    if (target.name === "proposeItem") for (const value of [null, undefined, 1, {}]) bad.push({ ...target.input, agent: value }, { ...target.input, reason: value });
    for (const input of bad) {
      const fixture = setup();
      assert.deepEqual(await fixture.call(...args("sample", input)), failure(error));
      assert.deepEqual(fixture.counts(), { guards: 1, writes: 0, revalidations: 0 });
    }
  });
  it(`${target.name} preserves auth priority, business/CAS results and exact exception identity`, async () => {
    for (const outcome of ["guest", "foreign", "read-only", "success", "stale", "business", "precommit", "commit-unknown", "revalidation"]) {
      const fixture = setup(outcome);
      const input = ["guest", "foreign", "read-only"].includes(outcome) ? null : { ...target.input, actor: "forged", actorRef: "foreign", userId: "foreign", projectId: "foreign" };
      const result = fixture.call(...args("sample", input));
      if (["guest", "foreign", "precommit", "commit-unknown", "revalidation"].includes(outcome)) await assert.rejects(result, caught => caught === fixture.exception);
      else assert.deepEqual(await result, outcome === "success" ? success() : failure(outcome === "read-only" ? "locked" : outcome === "stale" && target.name !== "proposeItem" ? reviewError : outcome));
      assert.deepEqual(fixture.counts(), { guards: 1, writes: ["guest", "foreign", "read-only"].includes(outcome) ? 0 : 1, revalidations: outcome === "success" ? target.name === "discardItem" ? 2 : 3 : outcome === "revalidation" ? 1 : 0 });
      for (const values of fixture.serviceArgs) {
        assert.equal(values[0], "owned");
        const submitted = values[1] as Record<string, unknown>;
        assert.equal(submitted.key, "KEY");
        for (const name of ["actor", "actorRef", "projectId"]) assert.equal(submitted[name], undefined);
        if (target.name === "retryAcceptance" || target.name === "discardItem") assert.equal(submitted.userId, "owner");
        else { const caller = values[2] as Record<string, unknown>; assert.equal(caller.actorRef, "owner"); assert.equal(caller.actor, "human"); }
      }
    }
  });
  if (target.name === "humanTransition") it("hold, resume and reopen reach the unchanged service with the original command", async () => {
    for (const to of ["on_hold", "planning", "implementing"]) {
      const fixture = setup();
      await fixture.call(...args("sample", { ...target.input, to }));
      assert.equal((fixture.serviceArgs[0][1] as { to: string }).to, to);
    }
  });
  if (target.name === "approveGate") it("missing or mismatched gate entries remain service decisions after shape validation", async () => {
    for (const gateEntry of [undefined, { runId: "different", entryId: "different" }]) {
      const fixture = setup("business");
      assert.deepEqual(await fixture.call(...args("sample", { ...target.input, gateEntry })), failure("business"));
      assert.equal(fixture.counts().writes, 1);
    }
  });
}

it("retry checks access/date first, revalidates three paths only after success and propagates uncertain commits", async () => {
  const code = ts.transpileModule(readFileSync("src/fsd/features/review-gate/api/review-gate.server.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const require = createRequire(import.meta.url);
  for (const outcome of ["success", "refused", "invalid-date", "unavailable", "foreign", "guest", "precommit", "commit-unknown", "revalidate-failure"] as const) {
    const revalidated: string[] = []; let writes = 0; const original = new Error(outcome);
    const exports = {} as { retryAcceptance: typeof RetryAcceptance };
    const deps: Record<string, unknown> = {
      "../model/review-gate-input": schemas,
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
      "../model/review-gate-input": schemas,
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
