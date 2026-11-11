import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { format } from "node:util";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("./maintain-github-connections.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const summary = { attemptsDeleted: 2, deliveriesDeleted: 3, connectionsExpired: 1, credentialsRotated: 0, cleanupComplete: true, cleanupBatches: 4 };
const usage = "Usage: npm run github:maintenance -- --apply [--rotate]";
const workFailure = "GitHub repository maintenance failed. Check database and vault configuration.";
const cleanupFailure = "GitHub repository maintenance database cleanup failed.";

async function run(args: string[], options: { databaseUrl?: string | null; workError?: Error; disconnectError?: Error } = {}) {
  const stdout: string[] = [], stderr: string[] = [], calls: boolean[] = [];
  const databaseUrl = options.databaseUrl === undefined ? "postgresql://unused-test-double" : options.databaseUrl;
  const process = { argv: ["node", "maintain-github-connections.ts", ...args], env: databaseUrl ? { DATABASE_URL: databaseUrl } : {}, exitCode: 0 };
  let disconnects = 0;
  const dependencies: Record<string, unknown> = {
    "dotenv/config": {},
    "../src/server/github/api.server": {
      maintainGitHubConnections: async (rotate: boolean) => {
        calls.push(rotate);
        if (options.workError) throw options.workError;
        return summary;
      },
    },
    "../src/server/db": {
      prisma: { $disconnect: async () => {
        disconnects++;
        if (options.disconnectError) throw options.disconnectError;
      } },
    },
  };

  await runInNewContext(code, {
    exports: {}, process,
    console: { log: (...values: unknown[]) => stdout.push(format(...values)), error: (...values: unknown[]) => stderr.push(format(...values)) },
    require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return { stdout, stderr, calls, disconnects, exitCode: process.exitCode };
}

it("reports usage and performs no maintenance when apply is missing or arguments are unknown", async () => {
  for (const args of [[], ["--rotate"], ["--apply", "--unknown"]]) {
    const result = await run(args);
    assert.deepEqual(result, { stdout: [], stderr: [usage], calls: [], disconnects: 1, exitCode: 1 });
  }
});

it("identifies missing database configuration before running maintenance", async () => {
  const result = await run(["--apply"], { databaseUrl: null });
  assert.deepEqual(result, { stdout: [], stderr: ["DATABASE_URL is required for GitHub repository maintenance."], calls: [], disconnects: 1, exitCode: 1 });
});

for (const rotate of [false, true]) {
  it(`preserves the JSON summary and rotation=${rotate} on success`, async () => {
    const result = await run(rotate ? ["--apply", "--rotate"] : ["--apply"]);
    assert.deepEqual(result, { stdout: [JSON.stringify(summary)], stderr: [], calls: [rotate], disconnects: 1, exitCode: 0 });
  });
}

it("reports maintenance failure without leaking the error or retrying the operation", async () => {
  const result = await run(["--apply"], { workError: new Error("private-token-canary") });
  assert.deepEqual(result, { stdout: [], stderr: [workFailure], calls: [false], disconnects: 1, exitCode: 1 });
});

it("handles disconnect failure after successful maintenance without leaking the error", async () => {
  const result = await run(["--apply"], { disconnectError: new Error("private-database-canary") });
  assert.deepEqual(result, { stdout: [JSON.stringify(summary)], stderr: [cleanupFailure], calls: [false], disconnects: 1, exitCode: 1 });
});

it("retains the maintenance failure when disconnect also fails", async () => {
  const result = await run(["--apply"], { workError: new Error("private-token-canary"), disconnectError: new Error("private-database-canary") });
  assert.deepEqual(result, { stdout: [], stderr: [workFailure, cleanupFailure], calls: [false], disconnects: 1, exitCode: 1 });
});
