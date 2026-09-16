import assert from "node:assert/strict";
import { it } from "node:test";
import { createBoardService } from "../../../src/server/pipeline/board";
import { afterBoardRead, cleanup, connections, failingEvent, fixture, ordered, type Fixture } from "./support";

const human = (f: Fixture, expectedUpdatedAt: Date) =>
  ({ actor: "human" as const, actorRef: f.userId, channel: "web" as const, expectedUpdatedAt });

// 승패를 고정해 양방향을 모두 돌린다 — 어느 연결이 이기든 진 쪽은 stale이고 아무것도 쓰지 않아야 한다.
for (const winner of [0, 1]) {
  it(`competing plan submissions: connection ${winner} claims the board version and the other writes nothing`, async () => {
    const { all, disconnect } = connections();
    const [a] = all;
    let userId: string | undefined;
    try {
      const f = await fixture(a, { status: "in_review" });
      userId = f.userId;
      const race = ordered();
      const first = createBoardService(afterBoardRead(all[winner], race.winner))
        .submitPlan(f.projectId, { key: f.key, path: "win.md", commit: "win" }, "winner");
      const second = createBoardService(afterBoardRead(all[1 - winner], race.loser))
        .submitPlan(f.projectId, { key: f.key, path: "lose.md", commit: "lose" }, "loser");

      assert.equal((await first).ok, true);
      race.finish();
      assert.deepEqual(await second, { ok: false, reason: "stale" });

      const row = await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
      assert.equal(row.planPath, "win.md");
      assert.equal(row.planCommit, "win");
      // 같은 ms 안의 갱신이다 — 쓰기가 계산한 prev+1이지 @updatedAt의 현재 시각이 아니다.
      assert.equal(row.updatedAt.getTime(), f.updatedAt.getTime() + 1);
      assert.equal(await a.transitionEvent.count({ where: { boardItemId: f.boardItemId } }), 1);
    } finally {
      await cleanup(a, userId);
      await disconnect();
    }
  });
}

it("the updatedAt a screen read before another write is stale for transition, discard, and gate alike", async () => {
  const { all: [a], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(a, { status: "in_review" });
    userId = f.userId;
    const board = createBoardService(a);
    const screenToken = f.updatedAt; // 화면이 그린 시점의 값
    assert.equal((await board.submitPlan(f.projectId, { key: f.key, path: "p.md", commit: "c" }, "dev")).ok, true);
    const moved = await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });

    // 사람 경로 셋 모두 화면이 보낸 토큰으로 CAS한다(review-gate.server.ts가 넘기는 값과 같은 모양).
    assert.deepEqual(await board.transition(f.projectId, { key: f.key, to: "planning", result: "bounce" }, human(f, screenToken)), { ok: false, reason: "stale" });
    assert.deepEqual(await board.discard(f.projectId, { key: f.key, userId: f.userId, expectedUpdatedAt: screenToken }), { ok: false, reason: "stale" });
    assert.deepEqual(await board.gate(f.projectId, { key: f.key, gate: "before-implement" }, human(f, screenToken)), { ok: false, reason: "stale" });

    // 세 번의 거부가 남긴 것이 없어야 한다: 상태·폐기·토큰 그대로, 이벤트는 plan 하나뿐.
    assert.deepEqual(await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } }), moved);
    assert.equal(await a.transitionEvent.count({ where: { boardItemId: f.boardItemId } }), 1);

    // 옮겨간 토큰으로 다시 부르면 통과한다 — 잠긴 것이 아니라 낡았을 뿐이다.
    assert.equal((await board.gate(f.projectId, { key: f.key, gate: "before-implement" }, human(f, moved.updatedAt))).ok, true);
    assert.equal((await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).status, "implementing");
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});

it("an event write failure rolls back the board claim in the same transaction", async () => {
  const { all: [a], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(a, { status: "in_review" });
    userId = f.userId;
    const before = await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    await assert.rejects(
      createBoardService(failingEvent(a, "event failure")).submitPlan(f.projectId, { key: f.key, path: "bad.md", commit: "bad" }, "dev"),
      /event failure/,
    );
    assert.deepEqual(await a.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } }), before);
    assert.equal(await a.transitionEvent.count({ where: { boardItemId: f.boardItemId } }), 0);
  } finally {
    await cleanup(a, userId);
    await disconnect();
  }
});
