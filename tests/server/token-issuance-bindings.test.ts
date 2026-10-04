import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { ReactElement } from "react";
import { hashToken } from "@harness/core/token.mjs";
import * as result from "../../src/fsd/shared/api/result";
import * as registration from "../../src/server/project-registration-query";
import * as availability from "../../src/server/project-availability-service";
import * as management from "../../src/server/token-management-query";
import { Prisma } from "../../src/generated/prisma/client";

const plainObject = (value: unknown) => JSON.parse(JSON.stringify(value));
function loader(imports: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  return <T>(path: string): T => {
    const exported = {};
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports: exported, Date, FormData, console,
      require: (name: string) => {
        if (Object.hasOwn(imports, name)) return imports[name];
        if (name.startsWith("@harness/core/")) return require(resolve("packages/core", name.slice("@harness/core/".length)));
        if (name.startsWith(".")) return require(resolve(path, "..", name));
        return require(name);
      },
    });
    return exported as T;
  };
}

it("actual user issuance and revocation preserve session scope, name defaults and hash-only storage", async () => {
  const rows: Record<string, unknown>[] = []; const revoked: unknown[] = []; const refreshed: string[] = [];
  let guards = 0;
  const load = loader({
    "next/cache": { revalidatePath: (path: string) => refreshed.push(path) },
    "@/server/auth/guard": { requireUser: async () => { guards++; return { userId: "u" }; } },
    "@/server/db": { prisma: { userToken: { create: async ({ data }: { data: Record<string, unknown> }) => rows.push(data), updateMany: async (args: unknown) => revoked.push(plainObject(args)) } } },
    "@/fsd/shared/api/result": result, "@/fsd/shared/routes/user-tokens": { userTokensPath: () => "/settings/tokens" },
    "@/server/token-management-query": management,
  });
  const action = load<typeof import("../../src/fsd/features/manage-user-token/api/manage-user-token.server")>("src/fsd/features/manage-user-token/api/manage-user-token.server.ts");
  for (const label of [" laptop ", "laptop", "  "]) {
    const response = await action.issueUserToken(label); assert.ok(response.success);
    const row = rows.at(-1)!; assert.equal(row.userId, "u"); assert.equal(row.hash, hashToken(response.data.token));
    assert.equal(row.label, label.trim() || "token"); assert.ok(row.usageTrackingStartedAt instanceof Date);
    assert.equal(row.expiresAt, null); assert.equal("lastUsedAt" in row, false); assert.equal(JSON.stringify(row).includes(response.data.token), false);
  }
  assert.equal(rows.length, 3); assert.equal(revoked.length, 0);
  await action.revokeUserToken("old");
  assert.deepEqual((revoked[0] as { where: unknown }).where, { id: "old", userId: "u" });
  assert.equal(guards, 4); assert.deepEqual(refreshed, Array(4).fill("/settings/tokens"));
});

it("actual web project action passes a tracked nested token only for a newly created project", async () => {
  for (const existing of [false, true]) {
    const creates: Prisma.ProjectCreateArgs[] = [];
    const transaction = {
      $queryRaw: async () => [],
      user: { findUniqueOrThrow: async () => ({ login: "owner", projectAvailabilityVersion: 0, subscription: null }), updateMany: async () => ({ count: 1 }) },
      projectAvailabilityEvent: { create: async () => ({}) },
      project: {
        findMany: async () => existing ? [{ id: "old", slug: "mine", ownerUserId: "u", repoOwner: "owner", repo: "repo", available: true, disconnectedAt: null }] : [],
        create: async (args: Prisma.ProjectCreateArgs) => { creates.push(args); return { id: "p" }; },
      },
    } as unknown as Prisma.TransactionClient;
    const prisma = { $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(transaction) };
    const load = loader({
      "@/server/auth/guard": { requireUser: async () => ({ userId: "u" }) }, "@/server/db": { prisma },
      "@/generated/prisma/client": { Prisma }, "@/server/project-registration-query": registration,
      "@/server/project-availability-service": availability,
    });
    const action = load<typeof import("../../src/fsd/features/create-project/api/create-project.server")>("src/fsd/features/create-project/api/create-project.server.ts");
    const form = new FormData(); for (const [key, value] of Object.entries({ slug: "mine", owner: "owner", repo: "repo" })) form.set(key, value);
    const response = await action.createProject({ status: "idle" }, form);
    assert.equal(response.status, existing ? "existing" : "created"); assert.equal(creates.length, existing ? 0 : 1);
    if (response.status === "created") {
      const token = creates[0].data.tokens?.create; assert.ok(token && !Array.isArray(token));
      assert.ok(token.usageTrackingStartedAt instanceof Date); assert.equal(token.hash, hashToken(response.token));
      assert.equal("lastUsedAt" in token, false); assert.equal(JSON.stringify(creates).includes(response.token), false);
    }
  }
});

it("actual web list routes enforce original scopes and pass usage fields without usage writes", async () => {
  const queries: { kind: string; args: unknown }[] = []; const guards: string[] = [];
  const token = { id: "t", label: "laptop", createdAt: new Date(), revokedAt: null, expiresAt: null, lastUsedAt: new Date(), usageTrackingStartedAt: null };
  const delegate = (kind: string) => ({ findMany: async (args: unknown) => { queries.push({ kind, args: plainObject(args) }); return [token]; }, updateMany: async () => { assert.fail("web list must not write usage"); } });
  const PageComponent = () => null;
  const noop = async () => { assert.fail("list rendering must not invoke a mutation"); };
  const load = loader({
    "@/server/db": { prisma: { projectToken: delegate("agent"), ownerToken: delegate("owner"), userToken: delegate("user") } },
    "@/server/auth/guard": { requireProjectOwner: async (slug: string) => { guards.push(slug); return { projectId: "p", userId: "u" }; }, requireUser: async () => { guards.push("user"); return { userId: "u" }; } },
    "@/server/entitlement": { projectAccess: async () => ({ available: true, plan: "pro" }) },
    "@/server/public-url": { mcpUrl: () => "http://example.test/api/mcp", ownerMcpUrl: () => "http://example.test/api/mcp/owner" },
    "@/fsd/pages/project-tokens/index.server": { ProjectTokensPage: PageComponent }, "@/fsd/pages/user-tokens/index.server": { UserTokensPage: PageComponent },
    "@/fsd/features/manage-token/index.server": { issueToken: noop, issueOwnerToken: noop, revokeToken: noop, revokeOwnerToken: noop, renameToken: noop, renameOwnerToken: noop },
    "@/fsd/features/manage-user-token/index.server": { issueUserToken: noop, revokeUserToken: noop, renameUserToken: noop },
    "@/fsd/widgets/app-header": { AppHeader: () => null }, "@/fsd/widgets/app-header/index.server": { loadHeaderUser: async () => ({ login: "owner", plan: "pro" }) },
  });
  const projectPage = load<{ default: (input: { params: Promise<{ slug: string }> }) => Promise<ReactElement> }>("src/app/(app)/p/[slug]/tokens/page.tsx");
  const project = await projectPage.default({ params: Promise.resolve({ slug: "mine" }) });
  assert.equal((project.props as { tokens: unknown[] }).tokens[0], token);
  assert.equal((project.props as { ownerTokens: unknown[] }).ownerTokens[0], token);
  const userPage = load<{ default: () => Promise<ReactElement> }>("src/app/(app)/settings/tokens/page.tsx");
  const element = await userPage.default();
  const children = (element.props as { children: ReactElement[] }).children;
  assert.equal((children[1].props as { tokens: unknown[] }).tokens[0], token);
  assert.deepEqual(guards, ["mine", "user"]);
  for (const [index, kind, where] of [[0, "agent", { projectId: "p" }], [1, "owner", { projectId: "p", userId: "u" }], [2, "user", { userId: "u" }]] as const) {
    assert.deepEqual(queries[index], { kind, args: { where, select: { id: true, label: true, createdAt: true, revokedAt: true, expiresAt: true, lastUsedAt: true, usageTrackingStartedAt: true }, orderBy: { createdAt: "desc" } } });
  }
});
