import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import type { maintainGitHubConnections } from "../../src/server/github/api.server";
import { loadModule } from "./fixtures/load-module";

const routePath = "src/app/api/cron/github-maintenance/route.ts";
const secret = "test-cron-secret-".repeat(4);
const summary = { attemptsDeleted: 2, deliveriesDeleted: 1, connectionsExpired: 3, credentialsRotated: 0, cleanupComplete: true, cleanupBatches: 4 };

function route(cronSecret: string | undefined, maintain: typeof maintainGitHubConnections): typeof import("../../src/app/api/cron/github-maintenance/route") {
  return loadModule(routePath, { "@/server/github/api.server": { maintainGitHubConnections: maintain } }, {
    process: { env: { CRON_SECRET: cronSecret } }, Buffer, Response,
  });
}

it("rejects missing, weak or incorrect cron authentication without running maintenance", async () => {
  let calls = 0;
  const maintain = async () => { calls++; return summary; };
  const cases = [
    { configured: undefined, authorization: "Bearer undefined", status: 503 },
    { configured: "", authorization: "Bearer ", status: 503 },
    { configured: "short", authorization: "Bearer short", status: 503 },
    { configured: secret, authorization: "", status: 401 },
    { configured: secret, authorization: `Bearer ${"x".repeat(secret.length)}`, status: 401 },
    { configured: secret, authorization: secret, status: 401 },
  ];
  for (const input of cases) {
    const response = await route(input.configured, maintain).GET(new Request("https://stagekeeper.test/api/cron/github-maintenance", {
      headers: { authorization: input.authorization },
    }));
    assert.equal(response.status, input.status);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(calls, 0);
});

it("runs authenticated cleanup without key rotation and returns an uncached summary", async () => {
  const calls: boolean[] = [];
  const handler = route(secret, async rotate => { calls.push(rotate); return summary; });
  const response = await handler.GET(new Request("https://stagekeeper.test/api/cron/github-maintenance?rotate=true", {
    headers: { authorization: `Bearer ${secret}` },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), summary);
  assert.deepEqual(calls, [false]);
});

it("reports a failed run without exposing database errors or secrets", async () => {
  const handler = route(secret, async () => { throw new Error(`database-credential ${secret}`); });
  const response = await handler.GET(new Request("https://stagekeeper.test/api/cron/github-maintenance", {
    headers: { authorization: `Bearer ${secret}` },
  }));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "GitHub repository maintenance failed." });
});

it("reports unfinished cleanup without retrying it inside the HTTP request", async t => {
  const warning = t.mock.method(console, "warn", () => undefined);
  let calls = 0;
  const unfinished = { ...summary, cleanupComplete: false };
  const handler = route(secret, async () => { calls++; return unfinished; });
  const response = await handler.GET(new Request("https://stagekeeper.test/api/cron/github-maintenance", {
    headers: { authorization: `Bearer ${secret}` },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), unfinished);
  assert.equal(calls, 1);
  assert.equal(warning.mock.callCount(), 1);
  assert.deepEqual(Array.from(warning.mock.calls[0].arguments), ["GitHub repository cleanup has remaining work.", unfinished]);
});

it("schedules the maintenance route once a day within its execution limit", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const job = config.crons.find(entry => `src/app${entry.path}/route.ts` === routePath);
  assert.equal(job?.schedule, "0 18 * * *");
  const handler = route(secret, async () => summary);
  assert.equal(handler.runtime, "nodejs");
  const secondsBetweenRuns = 24 * 60 * 60;
  assert.ok(handler.maxDuration > 0 && handler.maxDuration < secondsBetweenRuns);
});
