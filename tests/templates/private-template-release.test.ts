import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { it } from "node:test";
import { promisify } from "node:util";
import { readTemplateSources } from "../../scripts/templates/template-seed-query";
import { splitTemplate, validateTemplateRelease } from "../../src/server/templates/api";
import { agentNext } from "../../src/server/agents/api";
import { parseHarnessConfig } from "../../packages/core/configuration/harness-config.mjs";
import { buildWorkspaceVars } from "../../packages/core/templates/vars.mjs";
import { findRule } from "../../packages/core/pipeline/transitions.mjs";
import type { NextInput } from "../../src/server/agents/contracts";
import { installationFor, releaseDeliverable } from "../../packages/core/templates/release-manifest.mjs";
import { readInstalledTemplate } from "../../plugin/runtime/template-installation.mjs";
import { claudeFixtureExecutable } from "../plugin/template-fixture.mjs";

it("the pinned private corpus validates and installs through HTTP for each client, plan and complete language", { skip: !process.env.HARNESS_RELEASE_SOURCE, timeout: 60000 }, async t => {
  const rows = readTemplateSources(process.env.HARNESS_RELEASE_SOURCE!);
  const prepared = validateTemplateRelease(rows, { kind: "git", repository: "Sangeok/harness-templates", commit: process.env.HARNESS_RELEASE_COMMIT ?? "a".repeat(40) });
  const cli = claudeFixtureExecutable();
  const verifier = mkdtempSync(path.join(realpathSync(tmpdir()), "private-template-verifier-"));
  t.after(() => rmSync(verifier, { recursive: true, force: true }));
  writeFileSync(path.join(verifier, "SKILL.md"), "---\nname: reconciling-proposals-with-codebase\n---\nRead [gates](./gates.md).\n");
  writeFileSync(path.join(verifier, "gates.md"), "Fixture only: INV-1 INV-2 INV-3 INV-4 INV-5 INV-6 INV-7\n");
  for (const client of ["claude", "codex"] as const) for (const plan of ["free", "pro", "max"] as const) for (const language of prepared.manifest.languages) {
    const root = mkdtempSync(path.join(realpathSync(tmpdir()), "private-template-http-"));
    const installation = installationFor({ releaseId: prepared.releaseIdentity, rows, language, plan, client, contractHash: prepared.contractHash });
    const bundle = releaseDeliverable(rows.filter(row => row.lang === language), plan, client);
    const config = { version: 1, language, project: { owner: "fixture", repo: "fixture", branch: "main", slug: "fixture" }, workspaces: [{ id: "app", path: ".", agent: "app-dev", verify: ["npm test"] }] };
    writeFileSync(path.join(root, "harness.json"), JSON.stringify(config));
    let reports = 0;
    const server = createServer(async (request, response) => {
      try {
        if (request.method === "POST") {
          let body = ""; for await (const chunk of request) body += chunk;
          assert.deepEqual(JSON.parse(body).installation, installation); reports++;
          assert.equal(JSON.parse(readFileSync(path.join(root, "harness.lock.json"), "utf8")).clients[client].state, "pending");
          response.end('{"ok":true}'); return;
        }
        const url = new URL(request.url!, "http://localhost");
        assert.equal(url.searchParams.get("templateProtocol"), "template-release-v1");
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ ...bundle, templateContract: prepared.manifest.contract,
          templateRelease: { id: installation.releaseId, schemaVersion: 1, protocol: installation.protocol, language, clientSurfaceHash: installation.clientSurfaceHash } }));
      } catch { response.statusCode = 500; response.end('{"error":"contract fixture failed"}'); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const env: NodeJS.ProcessEnv = { ...process.env, HARNESS_TOKEN: "hs_" + "x".repeat(43), HARNESS_CLAUDE_CLI: cli, HARNESS_VERIFIER_SKILL_DIR: verifier };
      delete env.HARNESS_TEMPLATES_DIR;
      await promisify(execFile)(process.execPath, ["plugin/bin/harness-init.mjs", "--root", root, "--client", client, "--server", `http://127.0.0.1:${address.port}`], { env, timeout: 30000 });
      assert.deepEqual(readInstalledTemplate(root, client).installation, installation);
      assert.equal(reports, 1);
      const role = readFileSync(path.join(root, client === "claude" ? ".claude/agents/app-dev.md" : ".codex/agents/app-dev.toml"), "utf8");
      assert.doesNotMatch(role, /^## step:\S/m); assert.match(role, /Template installation contract/);
    } catch { assert.fail(`Private source installation failed for ${client}/${plan}/${language}; private output withheld`); }
    finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true }); }
  }
});

it("private step graphs retain handoff, interruption and verifier verdict routing through the actual engine", { skip: !process.env.HARNESS_RELEASE_SOURCE }, async () => {
  try {
    const rows = readTemplateSources(process.env.HARNESS_RELEASE_SOURCE!);
    const config = parseHarnessConfig({ version: 1, project: { owner: "fixture", repo: "fixture", branch: "main", slug: "fixture" }, workspaces: [{ id: "app", path: ".", agent: "app-dev", verify: ["npm test"] }] });
    type Deps = Parameters<typeof agentNext>[0];
    for (const row of rows.filter(row => row.path.startsWith("agents/"))) {
      const parsed = splitTemplate(row.body);
      const visit = (id: string, ancestors: string[]) => {
        if (id === "done") return;
        assert.ok(!ancestors.includes(id));
        const step = parsed.steps.find(step => step.id === id); assert.ok(step);
        for (const next of [...step.next, step.onBlocked, step.onFailed].filter((id): id is string => !!id)) visit(next, [...ancestors, id]);
      };
      for (const step of parsed.steps) visit(step.id, []);
    }
    const scenarios = [
      { role: "dev", status: "planning", outcomes: ["handoff"], expected: ["plan", "plan"] },
      { role: "dev", status: "implementing", outcomes: ["blocked"], expected: ["implement", "hold"] },
      { role: "dev", status: "implementing", outcomes: ["ok", "failed"], expected: ["implement", "verify", "hold"] },
      ...["qa-verifier", "impl-verifier"].flatMap(role => [
        { role, status: "done", outcomes: ["ok", "ok", "ok"], expected: ["start", "verify", "report", "done"] },
        { role, status: "done", outcomes: ["blocked", "ok"], expected: ["start", "blocked-report", "done"] },
        { role, status: "done", outcomes: ["ok", "failed", "ok"], expected: ["start", "verify", "failed-report", "done"] },
        { role, status: "done", outcomes: ["ok", "blocked", "ok"], expected: ["start", "verify", "blocked-report", "done"] },
      ]),
    ];
    for (const language of [...new Set(rows.map(row => row.lang))]) for (const client of ["claude", "codex"] as const) for (const scenario of scenarios) {
      const agent = scenario.role === "dev" ? "app-dev" : scenario.role;
      let run: { id: string; stepId: string; revision: number; closedAt: Date | null } | null = null;
      const records: { stepId: string; outcome: string }[] = [];
      const deps: Deps = {
        access: async () => ({ available: true, plan: "max" }), roster: async () => ["app-dev"],
        template: async () => rows.find(row => row.lang === language && row.path === `agents/${scenario.role}.md`)?.body ?? null,
        vars: async () => buildWorkspaceVars(config, config.workspaces[0], client), usageCap: async () => null,
        openRun: async () => run?.closedAt ? null : run, createRun: async (_scope, _agent, _key, stepId) => ({ ok: true, item: run = { id: "role", stepId, revision: 0, closedAt: null } }),
        boardStatus: async () => scenario.status, itemAgent: async () => "app-dev", openCount: async () => 1,
        verifyOk: async () => records.some(row => row.stepId === "verify" && row.outcome === "ok"), runByReceipt: async () => run,
        closeRun: async () => { if (run) run.closedAt = new Date(); },
        commitOutcome: async ({ receipt, outcome, destination }) => {
          if (!run || run.revision !== receipt.revision || run.stepId !== receipt.stepId || run.closedAt) return { kind: "stale" };
          records.push({ stepId: receipt.stepId, outcome }); run.revision++;
          if (destination.kind === "step") run.stepId = destination.stepId;
          if (destination.kind === "done") run.closedAt = new Date();
          return { kind: "accepted", run: { ...run }, refused: 0 };
        },
      };
      let receipt: NextInput["receipt"];
      for (const [index, outcome] of [undefined, ...scenario.outcomes].entries()) {
        const result = await agentNext(deps, { projectId: "fixture", tokenId: "fixture" }, { agent, key: "A", client, receipt, outcome: outcome as NextInput["outcome"] });
        assert.ok(result.ok);
        assert.equal(result.item.done ? "done" : result.item.step, scenario.expected[index]);
        if (!result.item.done) receipt = result.item.receipt;
        if (outcome === "handoff") {
          const count = records.length;
          const resumed = await agentNext(deps, { projectId: "fixture", tokenId: "fixture" }, { agent, key: "A", client });
          assert.ok(resumed.ok && !resumed.item.done); assert.deepEqual(resumed.item.receipt, receipt); assert.equal(records.length, count);
        }
      }
    }
  } catch { assert.fail("Private template graph or execution contract failed; private details withheld"); }
});

it("the private corpus bounds the mutation check and ends non-converging plan verification with a hold the state machine allows", { skip: !process.env.HARNESS_RELEASE_SOURCE }, () => {
  const rows = readTemplateSources(process.env.HARNESS_RELEASE_SOURCE!);
  const english = (file: string) => {
    const row = rows.find(entry => entry.lang === "en" && entry.path === file);
    assert.ok(row, file);
    return row.body;
  };
  const mutation = english("docs/plans/verification-paths.md").split("\n").find(line => line.startsWith("| 5 | Mutation check |"));
  assert.ok(mutation);
  assert.match(mutation, /one error per behavior the item's Source or the plan states/);
  assert.match(mutation, /A surviving mutant of a stated behavior is a hole in the spec/);
  assert.match(mutation, /recorded as a note, not a defect/);
  assert.doesNotMatch(mutation, /A surviving mutant is a hole in the spec/);
  for (const runbook of ["CLAUDE.runbook.md", "CODEX.runbook.md"]) {
    const text = english(runbook);
    const start = text.indexOf("### Plan verification stop rule"), end = text.indexOf("### The five acceptance checks");
    assert.ok(start >= 0 && end > start, runbook);
    const section = text.slice(start, end);
    assert.match(section, /three passes in a row report\s+defects/, runbook);
    assert.match(section, /mcp__harness__board_transition\(\{ project, key, to: "on_hold", result \}\)/, runbook);
    assert.match(section, /no gate there to approve/, runbook);
    assert.doesNotMatch(text, /tell the owner to approve in the Inbox if they want to override/, runbook);
  }
  const hold = findRule("agent", "in_review", "on_hold");
  assert.equal(hold?.kind, "hold");
  assert.equal(hold?.requiresResult, true);
});

it("the private corpus has Claude Code invoke the verifier the plugin includes by its harness: name", { skip: !process.env.HARNESS_RELEASE_SOURCE }, () => {
  const rows = readTemplateSources(process.env.HARNESS_RELEASE_SOURCE!);
  const english = (file: string) => {
    const row = rows.find(entry => entry.lang === "en" && entry.path === file);
    assert.ok(row, file);
    return row.body;
  };
  const runbook = english("CLAUDE.runbook.md");
  assert.match(runbook, /harness:reconciling-proposals-with-codebase/);
  assert.doesNotMatch(runbook, /(?<!harness:)reconciling-proposals-with-codebase/);
  const verify = splitTemplate(english("agents/plan-verifier.md")).steps.find(step => step.id === "verify");
  assert.ok(verify);
  assert.match(verify.body, /harness:reconciling-proposals-with-codebase/);
});
