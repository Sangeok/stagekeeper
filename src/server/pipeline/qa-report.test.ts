import assert from "node:assert/strict";

import { it } from "node:test";

import { parseQaReport } from "./qa-report";

const config = { environment: "test", baseUrl: "http://127.0.0.1:3000", mcpUrl: "http://127.0.0.1:8931/mcp", scenariosPath: "docs/qa/scenarios.md" };

const report = { verdict: "pass", targetCommit: "a".repeat(40), baseUrl: config.baseUrl, scenarios: [{ id: "save", status: "pass", expected: "saved after reload", actual: "saved after reload", evidence: ["snapshot at /settings; request 200"] }] };

it("an empty, partial, failed or unrun result cannot become a QA pass", () => {
  assert.deepEqual(parseQaReport(report), report);
  for (const change of [{ scenarios: [] }, { targetCommit: "HEAD" }, { scenarios: [{ ...report.scenarios[0], evidence: [] }] }, { scenarios: [{ ...report.scenarios[0], status: "blocked" }] }]) assert.throws(() => parseQaReport({ ...report, ...change }));
  assert.equal(parseQaReport({ ...report, verdict: "blocked", baseUrl: null, scenarios: [{ ...report.scenarios[0], status: "blocked", actual: "No test environment configured" }] }).baseUrl, null);
  assert.throws(() => parseQaReport({ ...report, baseUrl: null }));
});
