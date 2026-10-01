import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as slugRules from "../../src/server/project-slug-rule";
import * as access from "../../src/server/project-access-query";
import { Prisma } from "../../src/generated/prisma/client";
import type { registerProject as RegisterProject } from "../../src/server/project-registration";
import type { POST as ProjectsPost } from "../../src/app/api/projects/route";

function registrationFixture(authenticated = true) {
  let transactions = 0; let writes = 0; let receivedSlug: unknown;
  const require = createRequire(import.meta.url);
  const exported = {} as { registerProject: typeof RegisterProject };
  const deps: Record<string, unknown> = {
    "server-only": {}, "@/generated/prisma/client": { Prisma }, "@/server/project-access-query": access,
    "./project-slug-rule": slugRules, "./user-scope-query": {},
    "./rest-scope": { resolveUserScope: async () => authenticated ? { ok: true, userId: "owner" } : { ok: false, status: 401, reason: "unauthenticated" } },
    "@/server/project-availability-service": { withAvailabilityTransaction: async (_db: unknown, work: (tx: unknown) => Promise<unknown>) => { transactions++; return work({}); } },
    "./project-registration-query": { registerProjectResultIn: async (_tx: unknown, input: { slug?: string }) => { writes++; receivedSlug = input.slug; return { status: "created", projectId: "p" }; } },
    "@/server/db": { prisma: { project: { findUnique: async () => ({ repoOwner: "owner", repo: "repo", branch: "release/1.0", name: "Stored", slug: "stored", disconnectedAt: null }) } } },
  };
  const load = (path: string, exports: object, imports: Record<string, unknown>) => runInNewContext(
    ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Response, require: (name: string) => Object.hasOwn(imports, name) ? imports[name] : require(name) });
  load("src/server/project-registration.ts", exported, deps);
  const route = {} as { POST: typeof ProjectsPost };
  load("src/app/api/projects/route.ts", route, { "@/server/project-registration": exported, "@/fsd/shared/routes/project": { projectPath: (slug: string) => `/p/${slug}` } });
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
