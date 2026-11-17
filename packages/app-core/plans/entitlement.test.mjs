import { it } from "node:test";

import assert from "node:assert/strict";

import { REPORT_AGENTS, capReason } from "../../shared/plans/limits.mjs";
import { allowsAgent, allowsSessionApprovals, capError, historyCutoff } from "./entitlement.mjs";

const now = new Date("2026-09-03T12:00:00Z");

it("free: pm, feature-scout, and the first workspace dev only", () => {
      const roster = ["backend-dev", "frontend-dev"];
      assert.equal(allowsAgent("free", "pm", roster), true);
      assert.equal(allowsAgent("free", "feature-scout", roster), true);
      assert.equal(allowsAgent("free", "backend-dev", roster), true);
      assert.equal(allowsAgent("free", "frontend-dev", roster), false);
      assert.equal(allowsAgent("free", "plan-verifier", roster), false);
      assert.equal(allowsAgent("free", "doc-auditor", roster), false);
      assert.equal(allowsAgent("free", "stranger", roster), false);
    });

it("pro: all four report agents and up to ten devs", () => {
      const roster = Array.from({ length: 11 }, (_, i) => `dev${i}`);
      for (const agent of REPORT_AGENTS) assert.equal(allowsAgent("pro", agent, roster), true);
      assert.equal(allowsAgent("pro", "dev9", roster), true);
      assert.equal(allowsAgent("pro", "dev10", roster), false);
    });

it("max: everything on the roster", () => {
      const roster = Array.from({ length: 50 }, (_, i) => `dev${i}`);
      assert.equal(allowsAgent("max", "dev49", roster), true);
      assert.equal(allowsAgent("max", "stranger", roster), false);
    });

it("free: exactly 30 days back", () => {
      assert.deepEqual(historyCutoff("free", now), new Date("2026-08-04T12:00:00Z"));
    });

it("pro and max: no window", () => {
      assert.equal(historyCutoff("pro", now), null);
      assert.equal(historyCutoff("max", now), null);
    });

it("free: the first project is fine, the second is not", () => {
    assert.equal(capError("free", "projects", 0), null);
    assert.match(capError("free", "projects", 1), /project cap reached on the free plan \(1\)\. Upgrade the plan to add more\./);
  });

it("free backlog stops at 10", () => {
    assert.equal(capError("free", "backlog", 9), null);
    assert.match(capError("free", "backlog", 10), /backlog cap reached on the free plan \(10\)/);
  });

it("pro and max leave the unlimited axes open", () => {
    assert.equal(capError("pro", "backlog", 10_000), null);
    assert.equal(capError("max", "projects", 10_000), null);
    assert.match(capError("pro", "projects", 5), /project cap reached on the pro plan \(5\)/);
  });

it("shares its wording with capReason", () => {
    assert.ok(capError("free", "workspaces", 1).startsWith(capReason("free", "workspaces")));
  });

it("session approvals: free is web only, pro and max may approve from a session", () => {
    assert.equal(allowsSessionApprovals("free"), false);
    assert.equal(allowsSessionApprovals("pro"), true);
    assert.equal(allowsSessionApprovals("max"), true);
  });
