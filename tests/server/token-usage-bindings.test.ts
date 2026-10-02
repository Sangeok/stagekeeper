import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { newToken } from "@harness/core/token.mjs";
import * as auth from "../../src/server/mcp/auth";
import * as templatesQuery from "../../src/server/templates-query";
import * as identityQuery from "../../src/server/project-identity-query";
import * as runbookQuery from "../../src/server/runbook-query";
import * as restScope from "../../src/server/rest-scope";
import * as usageQuery from "../../src/server/token-usage-query";
import * as access from "../../src/server/project-access-query";
import { Prisma } from "../../src/generated/prisma/client";

type Handler = (request: Request) => Promise<Response>;
type Verifier = ReturnType<typeof auth.makeVerifyToken>;
const plainObject = (value: unknown) => JSON.parse(JSON.stringify(value));

function fixture(options: { revoked?: boolean; unknown?: boolean; unavailable?: boolean; recordFailure?: boolean; lookupFailure?: boolean } = {}) {
  const require = createRequire(import.meta.url);
  const usage: { kind: string; args: unknown }[] = [];
  const reads: unknown[] = [];
  const tokens = { agent: newToken(), owner: newToken("owner"), user: newToken("user") };
  const delegate = (kind: keyof typeof tokens) => ({
    findUnique: async (args: { where: { hash: string }; select: unknown }) => {
      reads.push(args); if (options.lookupFailure) throw new Error("credential lookup failed");
      if (options.unknown || args.where.hash !== tokens[kind].hash) return null;
      return { id: `${kind}-id`, projectId: "p", userId: "u", revokedAt: options.revoked ? new Date() : null };
    },
    updateMany: async (args: unknown) => { usage.push({ kind, args: plainObject(args) }); if (options.recordFailure) throw new Error("private storage error"); return { count: 1 }; },
  });
  const prisma = {
    projectToken: delegate("agent"), ownerToken: delegate("owner"), userToken: delegate("user"),
    project: {
      findFirst: async ({ where }: { where: { slug: string; ownerUserId: string } }) => where.slug === "mine" && where.ownerUserId === "u" ? { id: "p" } : null,
      findUnique: async () => ({ repoOwner: "owner", repo: "repo", branch: "main", name: "Project", slug: "mine", disconnectedAt: null }),
      update: async () => ({}),
    }, template: { findMany: async () => [{ path: "CLAUDE.md", body: "test runbook" }] },
  };
  const common: Record<string, unknown> = {
    "server-only": {}, "@/server/db": { prisma }, "./db": { prisma },
    "./token-usage-query": usageQuery, "./auth": auth, "./rest-scope": restScope,
    "./templates-query": templatesQuery, "./project-identity-query": identityQuery, "./runbook-query": runbookQuery,
    "@/generated/prisma/client": { Prisma }, "@/server/project-access-query": access,
    "@/server/entitlement": { projectAccess: async () => options.unavailable ? { available: false, reason: "not selected" } : { available: true, plan: "pro" } },
    "@/server/project-availability-service": { withAvailabilityTransaction: async (_db: unknown, work: (tx: unknown) => Promise<unknown>) => work({}) },
    "./project-registration-query": { registerProjectResultIn: async () => ({ status: "existing", projectId: "p", slug: "mine" }) },
    "@/server/agents/next": {}, "@/server/agents/runs": { createNextDeps: () => ({}) },
    "@/server/pipeline/board": { createBoardService: () => ({}) }, "@/server/pipeline/run": {}, "@/server/pipeline/run-rules": {},
    "./project-query": {}, "./project-sync-query": {}, "./views": {}, "./owner-gate": { createOwnerGate: () => async () => ({}) },
    "@/server/mcp/tools": {}, "@/server/mcp/owner-tools": {},
    "@/fsd/shared/routes/project": { projectPath: (slug: string) => `/p/${slug}` },
    "mcp-handler": {
      createMcpHandler: () => async () => Response.json({ ok: true }),
      withMcpAuth: (_handler: Handler, verify: Verifier, config: { required: boolean }) => {
        assert.equal(config.required, true);
        return async (request: Request) => {
          const info = await verify(request, request.headers.get("authorization")?.slice(7));
          return Response.json(info ? { scopes: info.scopes, clientId: info.clientId, extra: info.extra } : { error: "unauthorized" }, { status: info ? 200 : 401 });
        };
      },
    },
  };
  function load<T>(path: string): T {
    const exported = {};
    runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports: exported, Request, Response, URL, Date, console,
      require: (name: string) => {
        if (Object.hasOwn(common, name)) return common[name];
        if (name.startsWith("@harness/core/")) return require(resolve("packages/core", name.slice("@harness/core/".length)));
        if (name.startsWith(".")) return require(resolve(path, "..", name));
        return require(name);
      },
    });
    return exported as T; // The VM is the same boundary as the repository's binding tests.
  }
  const binder = load<{ recordTokenUsage: usageQuery.TokenUsageRecorder }>("src/server/token-usage.ts");
  common["./token-usage"] = common["../token-usage"] = binder;
  common["@/server/user-scope-query"] = common["./user-scope-query"] = load("src/server/user-scope-query.ts");
  common["@/server/runbook"] = load("src/server/runbook.ts");
  common["@/server/templates"] = load("src/server/templates.ts");
  common["@/server/project-identity"] = load("src/server/project-identity.ts");
  common["@/server/project-registration"] = load("src/server/project-registration.ts");
  common["@/server/mcp/deps"] = load("src/server/mcp/deps.ts");
  common["@/server/mcp/owner-deps"] = load("src/server/mcp/owner-deps.ts");
  return { load, tokens, usage, reads };
}

it("all six production API compositions record actual credential IDs and preserve response contracts", async () => {
  const f = fixture();
  for (const [path, kinds] of [["mcp", ["agent", "user"]], ["mcp/owner", ["owner"]]] as const) {
    const route = f.load<{ GET: Handler; POST: Handler }>(`src/app/api/${path}/route.ts`);
    assert.equal(route.GET, route.POST);
    for (const kind of kinds) for (const method of ["GET", "POST"] as const) {
      const response = await route[method](new Request(`http://example.test/api/${path}`, { method, headers: { authorization: `Bearer ${f.tokens[kind].plain}` } }));
      assert.equal(response.status, 200); assert.equal(f.usage.at(-1)?.kind, kind);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ["scopes", "clientId", "extra"]);
      assert.deepEqual(body.scopes, [kind === "owner" ? "owner" : "agent"]);
      assert.equal(body.clientId, kind === "user" ? "user-id" : "p");
      assert.deepEqual(body.extra, kind === "owner" ? { projectId: "p", userId: "u", ownerTokenId: "owner-id" } : kind === "user" ? { userId: "u", tokenId: "user-id" } : { projectId: "p", tokenId: "agent-id" });
    }
  }
  for (const [path, method, keys] of [["templates", "GET", ["templates", "entitlement"]], ["project", "GET", ["project"]], ["runbook", "POST", ["ok"]], ["projects", "POST", ["project"]]] as const) {
    const route = f.load<Record<"GET" | "POST", Handler>>(`src/app/api/${path}/route.ts`);
    for (const kind of path === "projects" ? ["user"] as const : ["agent", "user"] as const) {
      const before = f.usage.length;
      const response = await route[method](new Request(`http://example.test/api/${path}?project=mine`, {
        method, headers: { authorization: `Bearer ${f.tokens[kind].plain}` },
        ...(method === "POST" ? { body: JSON.stringify({ project: "mine", version: "a".repeat(12), owner: "owner", repo: "repo" }) } : {}),
      }));
      assert.equal(response.status, 200, path); assert.deepEqual(Object.keys(await response.json()), [...keys]);
      assert.equal(f.usage.length, before + 1); assert.equal(f.usage.at(-1)?.kind, kind);
      assert.equal((f.usage.at(-1)?.args as { where: { id: string } }).where.id, `${kind}-id`);
    }
  }
  for (const read of f.reads) assert.equal((read as { select: { id: boolean } }).select.id, true);
});

it("REST routes record valid credentials before 401/403/body errors and never record invalid ones", async () => {
  for (const options of [{}, { recordFailure: true }, { unavailable: true }]) {
    const f = fixture(options); const original = console.warn;
    try {
      console.warn = () => { throw new Error("diagnostics failed"); };
      for (const [path, method] of [["templates", "GET"], ["project", "GET"], ["runbook", "POST"], ["projects", "POST"]] as const) {
        const route = f.load<Record<"GET" | "POST", Handler>>(`src/app/api/${path}/route.ts`);
        for (const project of [null, "foreign", "mine"]) {
          const before = f.usage.length;
          const url = `http://example.test/api/${path}${project ? `?project=${project}` : ""}`;
          const response = await route[method](new Request(url, { method, headers: { authorization: `Bearer ${f.tokens.user.plain}` }, ...(method === "POST" ? { body: path === "runbook" && project ? JSON.stringify({ project, version: "invalid" }) : "invalid-json" } : {}) }));
          assert.equal(f.usage.length, before + 1, path);
          assert.deepEqual(Object.keys(await response.json()), response.status === 200 ? path === "templates" ? ["templates", "entitlement"] : ["project"] : ["error"]);
          assert.equal(response.status, path === "projects" ? 400 : project === null ? 401 : project === "foreign" || options.unavailable ? 403 : path === "runbook" ? 400 : 200);
        }
      }
    } finally { console.warn = original; }
  }
  for (const options of [{ revoked: true }, { unknown: true }]) {
    const f = fixture(options);
    for (const [path, method] of [["templates", "GET"], ["project", "GET"], ["runbook", "POST"], ["projects", "POST"], ["mcp", "GET"], ["mcp/owner", "POST"]] as const) {
      const route = f.load<Record<"GET" | "POST", Handler>>(`src/app/api/${path}/route.ts`);
      for (const header of [null, "Bearer malformed", `Bearer ${f.tokens.agent.plain}`, `Bearer ${f.tokens.owner.plain}`, `Bearer ${f.tokens.user.plain}`]) {
        const response = await route[method](new Request(`http://example.test/api/${path}?project=mine`, { method, headers: header ? { authorization: header } : {}, ...(method === "POST" ? { body: "{}" } : {}) }));
        assert.equal(response.status, 401);
      }
    }
    assert.equal(f.usage.length, 0);
  }
  const f = fixture({ lookupFailure: true });
  const route = f.load<{ GET: Handler }>("src/app/api/templates/route.ts");
  await assert.rejects(route.GET(new Request("http://example.test/api/templates", { headers: { authorization: `Bearer ${f.tokens.agent.plain}` } })), /credential lookup failed/);
  assert.equal(f.usage.length, 0);
});
