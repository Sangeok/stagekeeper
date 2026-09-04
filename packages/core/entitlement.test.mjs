import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PLAN, LIMITS, PLANS, REPORT_AGENTS, activeProjectIds, allowsAgent, capError, capReason, historyCutoff, isPlan, limitsFor, withinLimit } from "./entitlement.mjs";

const DAY = 86_400_000;

describe("entitlement", () => {
  it("plans are free < pro < max and the default is free", () => {
    assert.deepEqual(PLANS, ["free", "pro", "max"]);
    assert.equal(DEFAULT_PLAN, "free");
    assert.equal(isPlan("free"), true);
    assert.equal(isPlan("enterprise"), false);
    assert.throws(() => limitsFor("enterprise"), /unknown plan: enterprise/);
  });

  it("free gets pm + feature-scout only; pro and max get all four report agents", () => {
    assert.deepEqual(LIMITS.free.agents, ["pm", "feature-scout"]);
    assert.deepEqual(LIMITS.pro.agents, REPORT_AGENTS);
    assert.deepEqual(LIMITS.max.agents, REPORT_AGENTS);
    assert.deepEqual(REPORT_AGENTS, ["pm", "plan-verifier", "doc-auditor", "feature-scout"]);
  });

  describe("withinLimit", () => {
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
  });

  describe("activeProjectIds", () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const projects = [
      { id: "c", createdAt: new Date(t0.getTime() + 2 * DAY) },
      { id: "a", createdAt: t0 },
      { id: "b", createdAt: new Date(t0.getTime() + DAY) },
    ];

    it("free keeps the oldest one regardless of input order", () => {
      assert.deepEqual(activeProjectIds(projects, "free"), new Set(["a"]));
    });

    it("pro and max keep everything under the cap", () => {
      assert.deepEqual(activeProjectIds(projects, "pro"), new Set(["a", "b", "c"]));
      assert.deepEqual(activeProjectIds(projects, "max"), new Set(["a", "b", "c"]));
    });

    it("pro locks the sixth and later", () => {
      const seven = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, createdAt: new Date(t0.getTime() + i * DAY) }));
      assert.deepEqual(activeProjectIds(seven, "pro"), new Set(["p0", "p1", "p2", "p3", "p4"]));
    });

    it("ties on createdAt break by id", () => {
      const tied = [
        { id: "z", createdAt: t0 },
        { id: "m", createdAt: t0 },
      ];
      assert.deepEqual(activeProjectIds(tied, "free"), new Set(["m"]));
    });

    it("does not mutate the input", () => {
      const copy = [...projects];
      activeProjectIds(projects, "free");
      assert.deepEqual(projects, copy);
    });
  });

  describe("allowsAgent", () => {
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
  });

  describe("capReason", () => {
    it("names the axis, the plan, and the limit — one sentence every wall reuses", () => {
      assert.equal(capReason("free", "projects"), "project cap reached on the free plan (1)");
      assert.equal(capReason("free", "workspaces"), "workspace cap reached on the free plan (1)");
      assert.equal(capReason("free", "backlog"), "backlog cap reached on the free plan (10)");
      assert.equal(capReason("pro", "projects"), "project cap reached on the pro plan (5)");
    });

    it("rejects an unknown axis", () => {
      assert.throws(() => capReason("free", "agents"), /unknown axis/);
    });
  });

  describe("historyCutoff", () => {
    const now = new Date("2026-09-03T12:00:00Z");

    it("free: exactly 30 days back", () => {
      assert.deepEqual(historyCutoff("free", now), new Date("2026-08-04T12:00:00Z"));
    });

    it("pro and max: no window", () => {
      assert.equal(historyCutoff("pro", now), null);
      assert.equal(historyCutoff("max", now), null);
    });
  });
});

describe("capError", () => {
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
});
