import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { notFound, redirect } from "next/navigation";
import ts from "typescript";
import { defaultGraph } from "@harness/core/pipeline/pipeline.mjs";
import type * as TokenActions from "@/fsd/features/manage-token/index.server";
import type * as BacklogActions from "@/fsd/features/edit-backlog/index.server";
import type * as PipelineActions from "@/fsd/features/edit-pipeline/index.server";
import type * as ReviewActions from "@/fsd/features/review-gate/index.server";
import type * as ProposeActions from "@/fsd/features/propose-item/index.server";
import * as results from "@/fsd/shared/api/result";
import * as routes from "@/fsd/shared/routes/project";
import { loadModule } from "./fixtures/load-module";
import { assertActions, manifestEntries } from "./fixtures/action-manifest";

const guardPath = "src/server/auth/guard.ts";
const tokenPath = "src/fsd/features/manage-token/api/manage-token.server.ts";
const backlogPath = "src/fsd/features/edit-backlog/api/edit-backlog.server.ts";
const pipelinePath = "src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts";
const scoutPath = "src/fsd/features/edit-pipeline/api/automatic-scout.server.ts";
const reviewPath = "src/fsd/features/review-gate/api/review-gate.server.ts";
const proposePath = "src/fsd/features/propose-item/api/propose-item.server.ts";
const malformedSlugs: unknown[] = [undefined, null, 3, [], {}, { not: "mine" }, "", " \n "];
const timestamp = new Date(0).toISOString();

type ActionName = keyof typeof TokenActions | keyof typeof BacklogActions | keyof typeof PipelineActions
  | keyof typeof ReviewActions | keyof typeof ProposeActions;
type ActionCase = { file: string; name: ActionName; args: () => unknown[]; paths: unknown[][]; result: unknown };
const tokenPaths = [["/p/mine/tokens"]];
const backlogPaths = [["/p/mine/backlog"]];
const reviewPaths = [["/p/mine"], ["/p/mine/inbox"], ["/p/mine/items/KEY"]];

function backlogForm() {
  const form = new FormData();
  for (const [name, value] of Object.entries({ title: "Title", source: "Evidence", area: "src", type: "fix", typeBefore: "fix" })) form.set(name, value);
  return form;
}

const actions: ActionCase[] = [
  { file: tokenPath, name: "issueToken", args: () => ["name"], paths: tokenPaths, result: results.success({ token: "fixture-token" }) },
  { file: tokenPath, name: "issueOwnerToken", args: () => ["name"], paths: tokenPaths, result: results.success({ token: "fixture-token" }) },
  { file: tokenPath, name: "revokeToken", args: () => ["token"], paths: tokenPaths, result: undefined },
  { file: tokenPath, name: "revokeOwnerToken", args: () => ["token"], paths: tokenPaths, result: undefined },
  { file: tokenPath, name: "renameToken", args: () => ["token", "name"], paths: tokenPaths, result: results.success(null) },
  { file: tokenPath, name: "renameOwnerToken", args: () => ["token", "name"], paths: tokenPaths, result: results.success(null) },
  { file: backlogPath, name: "addBacklogItem", args: () => [{ status: "idle" }, backlogForm()], paths: backlogPaths, result: { status: "saved" } },
  { file: backlogPath, name: "updateBacklogItem", args: () => ["KEY", { status: "idle" }, backlogForm()], paths: backlogPaths, result: { status: "saved" } },
  { file: backlogPath, name: "removeBacklogItem", args: () => ["KEY"], paths: backlogPaths, result: { status: "saved" } },
  { file: pipelinePath, name: "savePipeline", args: () => [{ pipelineId: "default", definition: { steps: defaultGraph("pro").nodes, gates: defaultGraph("pro").gates }, expectedVersion: 0 }], paths: [[routes.PROJECT_LAYOUT_REVALIDATE_PATH, "layout"]], result: { status: "success", pipelineId: "default", version: 1 } },
  { file: scoutPath, name: "saveAutomaticScout", args: () => [true], paths: [["/p/mine", "layout"]], result: results.success(true) },
  { file: reviewPath, name: "retryAcceptance", args: () => [{ key: "KEY", expectedUpdatedAt: timestamp }], paths: reviewPaths, result: results.success() },
  { file: reviewPath, name: "humanTransition", args: () => [{ key: "KEY", to: "on_hold", result: "", expectedUpdatedAt: timestamp }], paths: reviewPaths, result: results.success() },
  { file: reviewPath, name: "approveGate", args: () => [{ key: "KEY", gate: "before-implement", expectedUpdatedAt: timestamp }], paths: reviewPaths, result: results.success() },
  { file: reviewPath, name: "discardItem", args: () => ["KEY", timestamp], paths: reviewPaths.slice(0, 2), result: results.success() },
  { file: proposePath, name: "proposeItem", args: () => [{ key: "KEY", agent: "dev", reason: "Evidence", pipelineId: "default" }], paths: [[routes.PROJECT_LAYOUT_REVALIDATE_PATH, "layout"]], result: results.success() },
];

type GuardOptions = {
  session?: "owner" | "guest";
  project?: "owned" | "foreign" | "missing";
  access?: "available" | "not-selected" | "disconnected";
  fault?: "auth" | "project" | "access";
  service?: "success" | "refused";
};

function guardFixture(options: GuardOptions = {}) {
  const events: string[] = [];
  const queries: { where: { ownerUserId: string; slug: unknown }; select: { id: boolean } }[] = [];
  const mutations: { name: string; args: unknown[] }[] = [];
  const revalidated: unknown[][] = [];
  const exception = new Error("fixture failure");
  const reason = options.access === "disconnected" ? "Disconnected" : "Not selected";
  const step = (name: string) => { events.push(name); if (name === options.fault) throw exception; };
  const mutation = (name: string, result: unknown = { ok: true, item: null }) => async (...args: unknown[]) => {
    mutations.push({ name, args });
    return options.service === "refused" ? { ok: false, reason } : result;
  };
  const prisma = {
    project: { findFirst: async (query: (typeof queries)[number]) => {
      step("project"); queries.push(query);
      return options.project === "foreign" || options.project === "missing" ? null : { id: "owned-project" };
    } },
    projectToken: { updateMany: mutation("revokeToken", { count: 1 }) },
    ownerToken: { updateMany: mutation("revokeOwnerToken", { count: 1 }) },
  };
  const entitlement = {
    projectAccess: async (projectId: string) => {
      step("access"); assert.equal(projectId, "owned-project");
      return { available: options.access === undefined || options.access === "available", reason };
    },
    planForProject: async () => "pro",
  };
  const guards = loadModule<typeof import("@/server/auth/guard")>(guardPath, {
    "next/navigation": { notFound, redirect }, "@/server/db": { prisma }, "@/server/projects/api.server": entitlement,
    "./index": { auth: async () => { step("auth"); return options.session === "guest" ? null : { user: { id: "viewer" } }; } },
  });
  const dependencies: Record<string, unknown> = {
    "@/server/auth/guard": guards,
    "next/cache": { revalidatePath: (...args: unknown[]) => revalidated.push(args) },
    "@/server/db": { prisma }, "@/server/projects/api.server": entitlement,
    "@/fsd/shared/api/result": results, "@/fsd/shared/routes/project": routes,
    "@/server/tokens/api.server": {
      issueProjectToken: mutation("issueToken", { ok: true, item: { token: "fixture-token" } }),
      issueProjectOwnerToken: mutation("issueOwnerToken", { ok: true, item: { token: "fixture-token" } }),
    },
    "@/server/tokens/api": { renameProjectToken: mutation("rename") },
    "@/server/pipeline/api.server": Object.fromEntries(["addBacklog", "updateBacklog", "removeBacklog", "retryAcceptance", "transition", "gate", "discard", "propose"].map(name => [name, mutation(name)])),
    "@/server/pipeline/api": { ...({ savePipelineDefinition: mutation("savePipeline", { status: "success", pipelineId: "default", version: 1 }) }), ...({ setAutomaticScout: mutation("saveAutomaticScout", { ok: true, item: true }) }) },

  };
  return { guards, dependencies, events, queries, mutations, revalidated, exception, reason };
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && error.digest === "NEXT_HTTP_ERROR_FALLBACK;404";
}

function isLoginRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
    && error.digest.startsWith("NEXT_REDIRECT;") && error.digest.includes(";/login;");
}

function assertNoMutation(fixture: ReturnType<typeof guardFixture>) {
  assert.deepEqual(fixture.mutations, []);
  assert.deepEqual(fixture.revalidated, []);
}

function callAction(target: ActionCase, fixture: ReturnType<typeof guardFixture>, slug: unknown) {
  const loaded = loadModule<Record<ActionName, (...args: unknown[]) => Promise<unknown>>>(target.file, fixture.dependencies);
  return loaded[target.name](slug, ...target.args());
}

it("rejects malformed project slugs before project lookup", async () => {
  for (const name of ["requireProjectOwner", "requireProjectWrite"] as const) {
    for (const raw of malformedSlugs) {
      const fixture = guardFixture();
      await assert.rejects(fixture.guards[name](raw as string), isNotFound);
      assert.deepEqual(fixture.events, ["auth"]);
      assert.deepEqual(fixture.queries, []);
    }
  }
});

it("authenticates before slug validation and preserves the exact owner-scoped selector", async () => {
  for (const name of ["requireProjectOwner", "requireProjectWrite"] as const) {
    for (const raw of [...malformedSlugs, "mine"]) {
      const fixture = guardFixture({ session: "guest" });
      await assert.rejects(fixture.guards[name](raw as string), isLoginRedirect);
      assert.deepEqual(fixture.events, ["auth"]);
    }
    for (const slug of ["mine", " mine "]) {
      const fixture = guardFixture();
      await fixture.guards[name](slug);
      assert.deepEqual(JSON.parse(JSON.stringify(fixture.queries)), [{ where: { ownerUserId: "viewer", slug }, select: { id: true } }]);
    }
  }
});

it("keeps owner reads available while write guards reject unavailable projects", async () => {
  for (const access of ["not-selected", "disconnected"] as const) {
    const fixture = guardFixture({ access });
    assert.deepEqual(JSON.parse(JSON.stringify(await fixture.guards.requireProjectOwner("mine"))), { userId: "viewer", projectId: "owned-project" });
    assert.deepEqual(fixture.events, ["auth", "project"]);
    assert.deepEqual(JSON.parse(JSON.stringify(await fixture.guards.requireProjectWrite("mine"))), { ok: false, reason: fixture.reason });
  }
});

it("preserves auth, lookup and availability exceptions without subsequent work", async () => {
  for (const name of ["requireProjectOwner", "requireProjectWrite"] as const) {
    for (const fault of ["auth", "project", "access"] as const) {
      if (name === "requireProjectOwner" && fault === "access") continue;
      const fixture = guardFixture({ fault });
      await assert.rejects(fixture.guards[name]("mine"), error => error === fixture.exception);
      assert.deepEqual(fixture.events, fault === "auth" ? ["auth"] : fault === "project" ? ["auth", "project"] : ["auth", "project", "access"]);
      assertNoMutation(fixture);
    }
  }
});

for (const target of actions) {
  it(`${target.name} rejects malformed slugs through its existing precheck or the real guard`, async () => {
    for (const slug of malformedSlugs) {
      const fixture = guardFixture();
      const response = callAction(target, fixture, slug);
      const prechecked = (target.file === reviewPath || target.file === proposePath) && (typeof slug !== "string" || slug.length === 0);
      if (prechecked) {
        const message = target.file === proposePath ? "Couldn't put it on the board. Try again." : "The board changed. Refresh and try again.";
        assert.deepEqual(await response, results.failure(message));
      } else await assert.rejects(response, isNotFound);
      assert.deepEqual(fixture.events, prechecked ? [] : ["auth"]);
      assert.deepEqual(fixture.queries, []);
      assertNoMutation(fixture);
    }
  });

  it(`${target.name} stops guests and non-owners before mutations and cache invalidation`, async () => {
    for (const options of [{ session: "guest" }, { project: "foreign" }, { project: "missing" }] as const) {
      const fixture = guardFixture(options);
      await assert.rejects(callAction(target, fixture, "mine"), "session" in options ? isLoginRedirect : isNotFound);
      assert.deepEqual(fixture.events, "session" in options ? ["auth"] : ["auth", "project"]);
      assertNoMutation(fixture);
    }
  });

  it(`${target.name} retains its successful result, trusted scope and exact revalidation paths`, async () => {
    const fixture = guardFixture();
    const result = await callAction(target, fixture, "mine");
    assert.deepEqual(structuredClone(result), target.result);
    assert.deepEqual(fixture.revalidated, target.paths);
    assert.equal(fixture.mutations.length, 1);
    const args = fixture.mutations[0].args;
    if (target.file === tokenPath) {
      if (target.name.startsWith("revoke")) {
        const expected = target.name === "revokeOwnerToken" ? { id: "token", projectId: "owned-project", userId: "viewer" } : { id: "token", projectId: "owned-project" };
        assert.deepEqual(JSON.parse(JSON.stringify((args[0] as { where: unknown }).where)), expected);
      } else {
        const input = args[target.name.startsWith("rename") ? 1 : 0] as { projectId: string; userId: string };
        assert.equal(input.projectId, "owned-project"); assert.equal(input.userId, "viewer");
      }
    } else if (target.file === pipelinePath || target.file === scoutPath) {
      const input = args[1] as { projectId: string; userId: string };
      assert.equal(input.projectId, "owned-project"); assert.equal(input.userId, "viewer");
    } else assert.equal(args[0], "owned-project");
  });

  it(`${target.name} preserves its unavailable-project policy`, async () => {
    for (const access of ["not-selected", "disconnected"] as const) {
      const ownerMutation = target.file === tokenPath;
      const revoke = target.name.startsWith("revoke");
      const fixture = guardFixture({ access, service: ownerMutation && !revoke ? "refused" : "success" });
      const response = await callAction(target, fixture, "mine");
      if (revoke) {
        assert.equal(response, undefined); assert.equal(fixture.mutations.length, 1);
        assert.deepEqual(fixture.revalidated, tokenPaths);
      } else {
        const expected = target.file === backlogPath ? { status: "error", error: fixture.reason }
          : target.file === pipelinePath ? { status: "error", reason: fixture.reason } : results.failure(fixture.reason);
        assert.deepEqual(JSON.parse(JSON.stringify(response)), expected);
        assert.equal(fixture.mutations.length, ownerMutation ? 1 : 0);
        assert.deepEqual(fixture.revalidated, []);
      }
      assert.equal(fixture.events.includes("access"), !ownerMutation);
    }
  });
}

const routeFiles = ["layout.tsx", "page.tsx", "backlog/page.tsx", "history/page.tsx", "inbox/page.tsx", "items/[key]/page.tsx", "pipeline/page.tsx", "tokens/page.tsx"];
for (const leaf of routeFiles) {
  it(`${leaf} awaits the real owner guard before loading protected content`, async () => {
    const file = `src/app/(app)/p/[slug]/${leaf}`;
    const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const scenario of ["malformed", "guest", "foreign", "missing"] as const) {
      const fixture = guardFixture(scenario === "guest" ? { session: "guest" } : scenario === "foreign" || scenario === "missing" ? { project: scenario } : {});
      const dependencies: Record<string, unknown> = {};
      const unexpected = () => assert.fail(`protected content ran before authorization: ${leaf}`);
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.importClause?.isTypeOnly) continue;
        dependencies[node.moduleSpecifier.text] = new Proxy({}, { get: () => unexpected });
      }
      dependencies["@/server/auth/guard"] = fixture.guards;
      const route = loadModule<{ default: (input: unknown) => Promise<unknown> }>(file, dependencies);
      await assert.rejects(route.default({ params: Promise.resolve({ slug: scenario === "malformed" ? { not: "mine" } : "mine", key: "KEY" }), searchParams: Promise.resolve({}), children: null }), scenario === "guest" ? isLoginRedirect : isNotFound);
      assert.deepEqual(fixture.events, scenario === "foreign" || scenario === "missing" ? ["auth", "project"] : ["auth"]);
      assertNoMutation(fixture);
    }
  });
}

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") it("fresh build keeps every guarded Action registered and the guard private", () => {
  for (const file of new Set(actions.map(target => target.file))) assertActions(file, actions.filter(target => target.file === file).map(target => target.name));
  assert.equal(manifestEntries().filter(entry => entry.filename?.replaceAll("\\", "/").endsWith(guardPath)).length, 0);
});
