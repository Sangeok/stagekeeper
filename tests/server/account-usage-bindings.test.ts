import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import ts from "typescript";
import type { AccountUsageSnapshot } from "../../src/server/account-usage-query";

function loadPage(options: { userId?: string; authFailure?: boolean; headerFailure?: boolean; snapshotFailure?: boolean }) {
  const calls: string[] = [], diagnostics: unknown[] = [];
  const require = createRequire(import.meta.url);
  const imports: Record<string, unknown> = {
    "@/fsd/pages/billing": { BillingPage: () => null }, "@/fsd/widgets/app-header": { AppHeader: () => null },
    "@/server/auth/guard": { requireUser: async () => { if (options.authFailure) throw new Error("Login redirect"); return { userId: options.userId ?? "first" }; } },
    "@/fsd/widgets/app-header/index.server": { loadHeaderUser: async () => { if (options.headerFailure) throw new Error("Header unavailable"); return { login: "fixture", plan: "pro" }; } },
    "@/server/account-usage": { accountUsage: async (userId: string): Promise<AccountUsageSnapshot> => {
      calls.push(userId); if (options.snapshotFailure) throw new Error("Private storage details");
      return { plan: "free", usage: { kind: "limited", percent: userId === "first" ? 95 : 25, resetAt: null } };
    } },
  };
  const exported: { default?: () => Promise<ReactElement<{ children: ReactElement[] }>> } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/app/(app)/billing/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports: exported, console: { error: (...args: unknown[]) => diagnostics.push(args) },
    require: (name: string) => Object.hasOwn(imports, name) ? imports[name] : require(name),
  });
  assert.ok(exported.default); return { page: exported.default, calls, diagnostics };
}

it("billing binds the current session and uses one snapshot plan for header, matrix and percentage", async () => {
  for (const userId of ["first", "second"]) {
    const f = loadPage({ userId }); const children = (await f.page()).props.children;
    assert.deepEqual(f.calls, [userId]);
    assert.equal((children[0].props as { plan: string }).plan, "free");
    const props = children[1].props as AccountUsageSnapshot;
    assert.equal(props.plan, "free"); assert.ok(props.usage.kind === "limited"); assert.equal(props.usage.percent, userId === "first" ? 95 : 25);
  }
});

it("snapshot failure preserves the loaded plan and shows unavailable without swallowing auth or header failure", async () => {
  const f = loadPage({ snapshotFailure: true }); const children = (await f.page()).props.children;
  const props = children[1].props as AccountUsageSnapshot;
  assert.equal(props.plan, "pro"); assert.equal(props.usage.kind, "unavailable");
  assert.deepEqual(f.diagnostics, [["Could not read account usage"]]);
  for (const options of [{ authFailure: true }, { headerFailure: true }]) {
    const guarded = loadPage(options); await assert.rejects(guarded.page); assert.deepEqual(guarded.calls, []); assert.deepEqual(guarded.diagnostics, []);
  }
});
