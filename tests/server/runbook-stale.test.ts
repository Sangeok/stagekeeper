import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runbookVersion } from "../../packages/core/runbook.mjs";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { runbookStale } from "../../src/server/runbook";

// 판정 표(docs/proposals/active/init-any-branch.md C-3): 세션이 넘긴 판이 있으면 그것으로만, 없거나 모양이
// 틀리면 마지막 init이 보고한 저장값으로. 넘겨받은 판은 저장하지 않는다 — 이 가짜 DB에는 쓰기 메서드가 없다.
const CURRENT = "# {{project.name}} — pipeline runbook\ncurrent\n";
const OLDER = "# {{project.name}} — pipeline runbook\nolder\n";

function fakeDb(stored: string | null) {
  const reads: string[] = [];
  const db = {
    template: { findMany: async () => { reads.push("template"); return [{ body: CURRENT }]; } },
    project: { findUnique: async () => { reads.push("project"); return { runbookVersion: stored }; } },
  } as unknown as PrismaClient;
  return { db, reads };
}

describe("runbookStale", () => {
  it("judges the version the session passes, not the one the last init reported", async () => {
    // 저장값은 최신(다른 브랜치에서 init) — 그래도 이 checkout의 판이 옛것이면 낡았다고 답한다.
    const { db, reads } = fakeDb(runbookVersion(CURRENT));
    assert.equal(await runbookStale("p1", db, runbookVersion(OLDER)), true);
    // 반대로 저장값이 옛것이어도 이 checkout이 최신이면 거짓 경보를 내지 않는다.
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
