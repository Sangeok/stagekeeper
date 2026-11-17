import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runbookVersion } from "../../packages/shared/templates/runbook.mjs";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { runbookStale } from "../../src/server/templates/api";

const CURRENT = "# {{project.name}} — pipeline runbook\ncurrent\n";
const OLDER = "# {{project.name}} — pipeline runbook\nolder\n";

function fakeDb(stored: string | null, bodies: string[] = [CURRENT]) {
  const reads: string[] = [];
  const db = {
    template: { findMany: async () => { reads.push("template"); return bodies.map(body => ({ body })); } },
    project: { findUnique: async () => { reads.push("project"); return { runbookVersion: stored }; } },
  } as unknown as PrismaClient;
  return { db, reads };
}

describe("runbookStale", () => {
  it("judges the version the session passes, not the one the last init reported", async () => {
    const { db, reads } = fakeDb(runbookVersion(CURRENT));
    assert.equal(await runbookStale("p1", db, runbookVersion(OLDER)), true);
    assert.equal(await runbookStale("p1", fakeDb(runbookVersion(OLDER)).db, runbookVersion(CURRENT)), false);
    assert.deepEqual(reads, ["template"], "a passed version never reads the stored one");
  });

  it("falls back to the stored version when the session passes none", async () => {
    assert.equal(await runbookStale("p1", fakeDb(runbookVersion(CURRENT)).db), false);
    assert.equal(await runbookStale("p1", fakeDb(runbookVersion(OLDER)).db), true);
    assert.equal(await runbookStale("p1", fakeDb(null).db), true);
  });

  it("ignores a malformed version and falls back to the stored one", async () => {
    for (const bad of ["", "not-a-version", runbookVersion(CURRENT).toUpperCase(), `${runbookVersion(CURRENT)}0`]) {
      const { db, reads } = fakeDb(runbookVersion(OLDER));
      assert.equal(await runbookStale("p1", db, bad), true, bad);
      assert.deepEqual(reads, ["template", "project"], bad);
    }
  });
});

function staleWithBodies(stored: string | null, bodies: string[]): Promise<boolean> {
  return runbookStale("p1", fakeDb(stored, bodies).db);
}

const BODY = "# {{project.name}} — pipeline runbook\n\nAsk pipeline_next.\n";

const OTHER = "# {{project.name}} — 파이프라인 런북\n\npipeline_next에 물어라.\n";

it("matching any current language's body is current", async () => {
    assert.equal(await staleWithBodies(runbookVersion(BODY), [BODY, OTHER]), false);
    assert.equal(await staleWithBodies(runbookVersion(OTHER), [BODY, OTHER]), false);
  });

it("a version no current body produces is stale", async () => {
    assert.equal(await staleWithBodies(runbookVersion("older body\n"), [BODY, OTHER]), true);
  });

it("never reported counts as stale", async () => {
    assert.equal(await staleWithBodies(null, [BODY]), true);
  });

it("no current body at all is stale, whatever was stored", async () => {
    assert.equal(await staleWithBodies(runbookVersion(BODY), []), true);
    assert.equal(await staleWithBodies(null, []), true);
  });
