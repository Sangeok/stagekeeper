import { it } from "node:test";

import assert from "node:assert/strict";

import { DEFAULT_PLAN, LIMITS, PLANS, REPORT_AGENTS, RESIDENT_RUNNER_PLAN_GATE, capReason, isPlan, limitsFor, withinLimit } from "./limits.mjs";

it("plans are free < pro < max and the default is free", () => {
    assert.deepEqual(PLANS, ["free", "pro", "max"]);
    assert.equal(DEFAULT_PLAN, "free");
    assert.equal(isPlan("free"), true);
    assert.equal(isPlan("enterprise"), false);
    assert.throws(() => limitsFor("enterprise"), /unknown plan: enterprise/);
  });

it("free includes discovery and assignment with legacy aliases; pro and max include all report agents", () => {
    assert.deepEqual(LIMITS.free.agents, ["pm", "feature-scout", "work-assigner", "work-discoverer"]);
    assert.deepEqual(LIMITS.pro.agents, REPORT_AGENTS);
    assert.deepEqual(LIMITS.max.agents, REPORT_AGENTS);
    assert.deepEqual(REPORT_AGENTS, ["pm", "work-assigner", "work-discoverer", "plan-verifier", "doc-auditor", "feature-scout", "qa-verifier", "impl-verifier"]);
  });

it("free: 1 project, 1 workspace, 10 backlog — boundary inclusive", () => {
      assert.equal(withinLimit("free", "projects", 0), true);
      assert.equal(withinLimit("free", "projects", 1), true);
      assert.equal(withinLimit("free", "projects", 2), false);
      assert.equal(withinLimit("free", "workspaces", 1), true);
      assert.equal(withinLimit("free", "workspaces", 2), false);
      assert.equal(withinLimit("free", "backlog", 10), true);
      assert.equal(withinLimit("free", "backlog", 11), false);
    });

it("pro: 5 projects, 10 workspaces, unlimited backlog", () => {
      assert.equal(withinLimit("pro", "projects", 5), true);
      assert.equal(withinLimit("pro", "projects", 6), false);
      assert.equal(withinLimit("pro", "workspaces", 10), true);
      assert.equal(withinLimit("pro", "workspaces", 11), false);
      assert.equal(withinLimit("pro", "backlog", 100_000), true);
    });

it("max: unlimited on every axis", () => {
      assert.equal(withinLimit("max", "projects", 100_000), true);
      assert.equal(withinLimit("max", "workspaces", 100_000), true);
      assert.equal(withinLimit("max", "backlog", 100_000), true);
    });

it("rejects an unknown axis", () => {
      assert.throws(() => withinLimit("free", "members", 1), /unknown axis: members/);
    });

it("names the axis, the plan, and the limit — one sentence every wall reuses", () => {
      assert.equal(capReason("free", "projects"), "project cap reached on the free plan (1)");
      assert.equal(capReason("free", "workspaces"), "workspace cap reached on the free plan (1)");
      assert.equal(capReason("free", "backlog"), "backlog cap reached on the free plan (10)");
      assert.equal(capReason("pro", "projects"), "project cap reached on the pro plan (5)");
    });

it("rejects an unknown axis", () => {
      assert.throws(() => capReason("free", "agents"), /unknown axis/);
    });

it("only Pro and Max may edit the graph", () => {
    assert.equal(LIMITS.free.pipelineEdit, false);
    assert.equal(LIMITS.pro.pipelineEdit, true);
    assert.equal(LIMITS.max.pipelineEdit, true);
  });

it("dispatches is a capped axis on free and pro, unlimited on max", () => {
    assert.equal(withinLimit("free", "dispatches", 20), true);
    assert.equal(withinLimit("free", "dispatches", 21), false);
    assert.equal(withinLimit("pro", "dispatches", 100), true);
    assert.equal(withinLimit("pro", "dispatches", 101), false);
    assert.equal(withinLimit("max", "dispatches", 10_000), true);
  });

it("the refusal sentence comes from capReason, like every other axis", () => {
    assert.equal(capReason("free", "dispatches"), "dispatch cap reached on the free plan (20)");
  });

it("opens the background runner on Pro and Max only", () => {
    assert.equal(LIMITS.free.residentRunner, false);
    assert.equal(LIMITS.pro.residentRunner, true);
    assert.equal(LIMITS.max.residentRunner, true);
  });

it("names the session watch as the Free alternative", () => {
    assert.equal(RESIDENT_RUNNER_PLAN_GATE, "The background runner opens on Pro. Use /harness:watch in a Claude Code session for now.");
  });
