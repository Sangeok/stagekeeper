import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as slugRules from "../../src/server/projects/slug-rule";
import * as access from "../../src/server/projects/access-query";
import { AvailabilityConflict } from "../../src/server/projects/api";
import { Prisma } from "../../src/generated/prisma/client";
import type { registerProject as RegisterProject } from "../../src/server/rest/api.server";
import type { POST as ProjectsPost } from "../../src/app/api/projects/route";

function registrationFixture(authenticated = true, options: { command?: object; row?: unknown; error?: Error } = {}) {
  let transactions = 0; let writes = 0; let receivedSlug: unknown;
  const require = createRequire(import.meta.url);
  const exported = {} as { registerProject: typeof RegisterProject };
  const deps: Record<string, unknown> = {
    "server-only": {}, "@/server/tokens/api.server": { recordTokenUsage: async () => {} }, "@/generated/prisma/client": { Prisma },
    "./access-query": access,
    "@/server/usage/api.server": { limitAccountRequest: async () => null }, "./scope": { resolveUserScope: async () => authenticated ? { ok: true, userId: "owner" } : { ok: false, status: 401, reason: "unauthenticated" } },
    "./availability-service": { AvailabilityConflict, withAvailabilityTransaction: async (_db: unknown, work: (tx: unknown) => Promise<unknown>) => { transactions++; if (options.error) throw options.error; return work({}); } },
    "./registration-command": { registerProjectResultIn: async (_tx: unknown, input: { slug?: string }) => { writes++; receivedSlug = input.slug; return options.command ?? { status: "created", projectId: "p" }; } },
    "@/server/db": { prisma: { project: { findUnique: async () => Object.hasOwn(options, "row") ? options.row : ({ repoOwner: "owner", repo: "repo", branch: "release/1.0", name: "Stored", slug: "stored", disconnectedAt: null }) } } },
  };
  const load = (path: string, exports: object, imports: Record<string, unknown>) => runInNewContext(
    ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Response, require: (name: string) => Object.hasOwn(imports, name) ? imports[name] : require(name) });
  const service = {};
  load("src/server/projects/registration-service.ts", service, deps);
  deps["@/server/projects/api"] = { ...slugRules, ...service };
  load("src/server/rest/project-registration.ts", exported, deps);
  const route = {} as { POST: typeof ProjectsPost };
  load("src/app/api/projects/route.ts", route, { "@/server/rest/api.server": exported, "@/fsd/shared/routes/project": { projectPath: (slug: string) => `/p/${slug}` } });
  return { exported, route, counters: () => ({ transactions, writes, receivedSlug }) };
}

it("invalid explicit slugs reject through the actual POST body before any transaction or write", async () => {
  for (const slug of ["new", "a/b", "Ab", "a", "a".repeat(41), "a b"]) {
    const f = registrationFixture();
    const response = await f.route.POST(new Request("https://example.test/api/projects", { method: "POST", body: JSON.stringify({ owner: "owner", repo: "repo", slug }) }));
    assert.equal(response.status, 400); assert.deepEqual(Object.keys(await response.json()), ["error"]);
    assert.deepEqual(f.counters(), { transactions: 0, writes: 0, receivedSlug: undefined });
  }
});

it("actual POST maps service failures and the committed disconnected slug to the original HTTP body", async () => {
  for (const [options, status, body] of [
    [{ command: { status: "capped", reason: "cap" } }, 403, { error: "cap" }],
    [{ command: { status: "integrity", reason: "integrity" } }, 409, { error: "integrity" }],
    [{ row: null }, 409, { error: "the project vanished while registering — try again" }],
    [{ row: { slug: "committed", disconnectedAt: new Date() } }, 409, { error: access.DISCONNECTED_REASON, reconnectPath: "/p/committed" }],
    [{ error: new access.ProjectIntegrityError() }, 409, { error: new access.ProjectIntegrityError().message }],
    [{ error: new AvailabilityConflict() }, 409, { error: new AvailabilityConflict().message }],
  ] as const) {
    const f = registrationFixture(true, options);
    const response = await f.route.POST(new Request("https://example.test/api/projects", { method: "POST", body: JSON.stringify({ owner: "owner", repo: "repo" }) }));
    assert.equal(response.status, status); assert.deepEqual(await response.json(), body);
  }
});

it("keeps optional normalization, trimmed 2/40-character slugs, slash branches and auth precedence", async () => {
  for (const slug of [undefined, null, "", "  ", 42, {}, " ab ", "a".repeat(40)]) {
    const f = registrationFixture();
    const response = await f.route.POST(new Request("https://example.test/api/projects", { method: "POST", body: JSON.stringify({ owner: "owner", repo: "repo", branch: "release/1.0", slug }) }));
    assert.equal(response.status, 201); assert.equal((await response.json()).project.branch, "release/1.0");
    assert.equal(f.counters().receivedSlug, typeof slug === "string" && slug.trim() !== "" ? slug.trim() : undefined);
  }
  const f = registrationFixture(false);
  assert.equal((await f.exported.registerProject(null, { owner: "owner", repo: "repo", slug: "new" })).ok, false);
  const response = await f.route.POST(new Request("https://example.test/api/projects", { method: "POST", body: '{"slug":"new"}' }));
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: "unauthenticated" });
  assert.equal(f.counters().transactions, 0);
});
