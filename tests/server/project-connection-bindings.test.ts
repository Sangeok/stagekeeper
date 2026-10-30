import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { it } from "node:test";
import ts from "typescript";
import { AGENT_TOOL_NAMES, type ToolDeps } from "../../src/server/mcp/tools";
import { registerTools } from "../../src/server/mcp/api";
import { OWNER_TOOL_NAMES, type OwnerToolDeps } from "../../src/server/mcp/owner-tools";
import { registerOwnerTools } from "../../src/server/mcp/api";
import type { McpServer } from "@modelcontextprotocol/server";
import { DISCONNECTED_REASON } from "../../src/server/projects/access-query";
import { registerRepositoryProject, REPO_SEGMENT } from "../../src/server/projects/api";
import { Prisma } from "../../src/generated/prisma/client";
import { loadModule } from "./fixtures/load-module";

const adapterPath = "src/fsd/features/manage-project-connection/api/manage-project-connection.server.ts";
const read = (path: string) => readFileSync(path, "utf8");
const directive = (node: ts.Statement | undefined, value: string) => !!node && ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === value;

it("exposes exactly two inline session mutations and keeps the ordinary loader behind server-only", () => {
  const source = read(adapterPath); const ast = ts.createSourceFile(adapterPath, source, ts.ScriptTarget.Latest, true);
  assert.ok(!ast.statements.some((node) => directive(node, "use server")));
  assert.ok(ast.statements.some((node) => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "server-only"));
  const functions = ast.statements.filter(ts.isFunctionDeclaration);
  const actions = functions.filter((node) => directive(node.body?.statements[0], "use server"));
  assert.deepEqual(actions.map((node) => node.name?.text).sort(), ["disconnectRepository", "reconnectRepository"]);
  const loader = functions.find((node) => node.name?.text === "loadProjectConnection"); assert.ok(loader);
  assert.ok(!directive(loader.body?.statements[0], "use server"));
  for (const action of actions) {
    const body = action.body!.getText(ast);
    const authentication = body.indexOf("await requireUser()");
    const validation = body.indexOf("inputSchema.safeParse(input)");
    assert.ok(authentication >= 0);
    assert.ok(validation > authentication);
    assert.match(body, /targetProjectId: parsed\.data\.targetProjectId, expectedVersion: parsed\.data\.expectedVersion, userId/);
    assert.doesNotMatch(body, /input\.userId|parsed\.data\.userId|authorization|Bearer/);
    assert.match(body, /revalidatePath\(projectsPath\(\)\)/);
    assert.match(body, /revalidatePath\(PROJECT_LAYOUT_REVALIDATE_PATH, "layout"\)/);
  }
  assert.ok(ast.statements.some(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
    && node.moduleSpecifier.text === "../model/project-connection-input"
    && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
    && node.importClause.namedBindings.elements.some(element => element.name.text === "inputSchema" && !element.isTypeOnly)));
  assert.ok(!ast.statements.some(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === "inputSchema")));
  assert.match(read("src/fsd/features/manage-project-connection/model/project-connection-input.ts"), /expectedVersion: z\.number\(\)\.int\(\)\.min\(0\)\.max\(Number\.MAX_SAFE_INTEGER\)/);
  assert.ok(!read("src/fsd/features/manage-project-connection/index.ts").includes("loadProjectConnection"));
  const tokens = read("src/fsd/features/manage-token/api/manage-token.server.ts");
  assert.match(tokens, /await issueProjectToken\(\{ projectId, userId, label, expiresAt \}\)/);
  assert.match(tokens, /await issueProjectOwnerToken\(\{ projectId, userId, label, expiresAt \}\)/);
  assert.doesNotMatch(tokens, /projectToken\.create|ownerToken\.create|newToken/);
});

type ConnectionActions = Pick<typeof import("../../src/fsd/features/manage-project-connection/index.server"), "disconnectRepository" | "reconnectRepository">;
type ConnectionCommand = typeof import("../../src/server/projects/api.server").disconnectProject;

function connectionActions(authenticate: () => Promise<{ userId: string }>, result: Awaited<ReturnType<ConnectionCommand>> = { status: "success", changed: true, version: 4 }) {
  const calls: { operation: string; input: Parameters<ConnectionCommand>[0] }[] = [];
  const refreshes: unknown[][] = [];
  const command = (operation: string) => async (input: Parameters<ConnectionCommand>[0]) => { calls.push({ operation, input }); return result; };
  const actions = loadModule<ConnectionActions>(adapterPath, {
    "@/server/auth/guard": { requireUser: authenticate },
    "@/server/projects/api.server": { disconnectProject: command("disconnect"), reconnectProject: command("reconnect") },
    "next/cache": { revalidatePath: (...args: unknown[]) => { refreshes.push(args); } },
  });
  return { actions, calls, refreshes };
}

for (const name of ["disconnectRepository", "reconnectRepository"] as const) {
  it(`${name} rejects unauthenticated valid and malformed requests before mutations or revalidation`, async () => {
    const denied = new Error("session denied");
    let authentications = 0;
    const f = connectionActions(async () => { authentications++; throw denied; });

    for (const input of [{ targetProjectId: "p", expectedVersion: 3 }, null]) {
      await assert.rejects(f.actions[name](input as Parameters<ConnectionActions[typeof name]>[0]), error => error === denied);
    }

    assert.equal(authentications, 2);
    assert.equal(f.calls.length, 0);
    assert.equal(f.refreshes.length, 0);
  });

  it(`${name} uses the session owner and revalidates only a successful command`, async () => {
    const input = { targetProjectId: "p", expectedVersion: 3, userId: "forged" };
    for (const result of [{ status: "error", code: "not-found", reason: "Project not found." }, { status: "stale", currentVersion: 4 }, { status: "success", changed: true, version: 4 }] as const) {
      const f = connectionActions(async () => ({ userId: "trusted-owner" }), result);

      assert.equal((await f.actions[name](input)).status, result.status);

      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].operation, name === "disconnectRepository" ? "disconnect" : "reconnect");
      assert.equal(f.calls[0].input.userId, "trusted-owner");
      assert.equal(f.calls[0].input.targetProjectId, "p");
      assert.equal(f.calls[0].input.expectedVersion, 3);
      assert.deepEqual(f.refreshes, result.status === "success" ? [["/projects"], ["/(app)/p/[slug]", "layout"]] : []);
    }
  });
}

it("keeps every owner detail GET guarded and the app header connected-only", () => {
  for (const leaf of ["page.tsx", "inbox/page.tsx", "backlog/page.tsx", "items/[key]/page.tsx", "pipeline/page.tsx", "history/page.tsx", "tokens/page.tsx"]) {
    const source = read(`src/app/(app)/p/[slug]/${leaf}`);
    assert.match(source, /await requireProjectOwner\(slug\)/, leaf);
    assert.doesNotMatch(source, /requireProjectWrite|disconnectProject|reconnectProject|\.create\(|\.update\(/, leaf);
  }
  assert.match(read("src/fsd/widgets/app-header/api/app-header.server.ts"), /disconnectedAt: null/);
  assert.match(read("src/app/(app)/p/[slug]/layout.tsx"), /access\.code === "disconnected"/);
  assert.match(read("src/app/(app)/p/[slug]/inbox/page.tsx"), /readOnlyLabel=\{inboxReadOnlyLabel\(access\)\}/);
  const history = read("src/app/(app)/p/[slug]/history/page.tsx");
  assert.doesNotMatch(history, /disconnectedAt|available: true/);
});

it("all 14 agent tools and the owner tool stop before any domain dependency when disconnected", async () => {
  type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ isError?: boolean; content: unknown[] }>;
  const agent: Record<string, Handler> = {}; const owner: Record<string, Handler> = {}; let calls = 0;
  const capture = (handlers: Record<string, Handler>) => ({ registerTool: (name: string, _metadata: unknown, handler: Handler) => { handlers[name] = handler; } }) as unknown as McpServer;
  const access = async () => ({ plan: "pro" as const, available: false as const, code: "disconnected" as const, reason: DISCONNECTED_REASON });
  const domain = () => { calls++; throw new Error("disconnected domain read/write"); };
  registerTools(capture(agent), new Proxy({ access, projectFor: async () => "p" }, { get: (target, key) => key in target ? target[key as keyof typeof target] : domain }) as unknown as ToolDeps);
  registerOwnerTools(capture(owner), { access, owner: async () => true, gate: domain, requestLimit: domain } as OwnerToolDeps);
  assert.deepEqual(Object.keys(agent).sort(), [...AGENT_TOOL_NAMES].sort()); assert.deepEqual(Object.keys(owner), [...OWNER_TOOL_NAMES]);
  const ctx = { http: { authInfo: { extra: { projectId: "p", userId: "u", tokenId: "t" } } } };
  for (const handler of [...Object.values(agent), ...Object.values(owner)]) {
    const result = await handler({ project: "p", key: "K-1", workspaces: [], agent: "dev" }, ctx);
    assert.equal(result.isError, true); assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify({ error: DISCONNECTED_REASON }) }]);
  }
  assert.equal(calls, 0);
});

it("retries one real Prisma slug violation in legacy/driver metadata and propagates exhaustion or unrelated constraints", async () => {
  const source = read("src/server/rest/project-registration.ts");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const require = createRequire(import.meta.url);
  const collision = (meta: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError("unique constraint", { code: "P2002", clientVersion: "7.10.0", meta });
  for (const [meta, failures, expectedCalls, succeeds] of [
    [{ target: ["slug"] }, 1, 2, true],
    [{ driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: "Project_slug_key" } } } }, 1, 2, true],
    [{ driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: "Project_slug_key" } } } }, 2, 2, false],
    [{ driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: "User_githubId_key" } } } }, 1, 1, false],
  ] as const) {
    let calls = 0;
    const exported: { registerProject?: (header: string, body: unknown) => Promise<unknown> } = {};
    const deps: Record<string, unknown> = {
      "server-only": {}, "@/server/tokens/api.server": { recordTokenUsage: async () => {} },
      "@/server/projects/api": { registerRepositoryProject, REPO_SEGMENT },
      "@/server/db": { prisma: { $transaction: async () => { if (++calls <= failures) throw collision(meta); return { status: "created", projectId: "p", slug: "stored" }; },
        project: { findUnique: async () => ({ repoOwner: "owner", repo: "repo", branch: "main", name: "stored", slug: "stored", disconnectedAt: null }) } } },
      "@/server/usage/api.server": { limitAccountRequest: async () => null }, "./scope": { resolveUserScope: async () => ({ ok: true, userId: "trusted" }) },
    };
    runInNewContext(code, { exports: exported, JSON, require: (name: string) => name in deps ? deps[name] : require(name) });
    assert.ok(exported.registerProject);
    const result = exported.registerProject("Bearer test", { owner: "owner", repo: "repo" });
    if (succeeds) assert.equal((await result as { ok: boolean }).ok, true);
    else await assert.rejects(result, (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
    assert.equal(calls, expectedCalls);
  }
});

if (process.env.RDC_CHECK_ACTION_MANIFEST === "true") {
  it("the fresh build manifest registers exactly the two inline mutations and no remote loader", () => {
    const manifest = JSON.parse(read(".next/server/server-reference-manifest.json")) as Record<string, Record<string, { filename?: string; exportedName?: string }>>;
    const entries = [...Object.values(manifest.node ?? {}), ...Object.values(manifest.edge ?? {})].filter((entry) => entry.filename?.replaceAll("\\", "/").endsWith(adapterPath));
    assert.equal(entries.length, 2);
    assert.ok(entries.every((entry) => entry.exportedName?.startsWith("$$RSC_SERVER_ACTION_")));
    assert.equal(new Set(entries.map((entry) => entry.exportedName)).size, 2);
  });
}
