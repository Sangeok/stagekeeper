// same-status 증거 이벤트(validation·plan·report)가 창에 끼어도 상태 줄과 재개 버튼이 흔들리지 않는 것을 고정한다.
// 쿼리(latestBoardWithEvents)가 note 없는 전이만 주지만, 모델 자신도 같은 가드를 갖는다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toInboxItems } from "./inbox-item";

const repo = { owner: "o", repo: "r", branch: "main" };
const at = (iso: string) => new Date(iso);

const boardRow = (overrides: object) => ({
  status: "in_review",
  agent: "dev",
  reason: "evidence",
  results: [],
  validation: null,
  planPath: null,
  planCommit: null,
  proposedOn: at("2026-08-30T00:00:00Z"),
  updatedAt: at("2026-08-31T12:00:00Z"),
  backlogItem: { key: "FEAT-01", title: "t", area: "src" },
  events: [] as { at: Date; from: string | null; to: string | null }[],
  ...overrides,
});

describe("toInboxItems", () => {
  it("statusSince reads the real transition, not a newer same-status event", () => {
    const [item] = toInboxItems([boardRow({
      events: [ // 최신순(desc) — 쿼리와 같은 순서. 첫 행은 plan 재제출·validation류의 same-status 이벤트.
        { at: at("2026-08-31T10:00:00Z"), from: "in_review", to: "in_review" },
        { at: at("2026-08-30T09:00:00Z"), from: "planning", to: "in_review" },
      ],
    })], repo);
    assert.ok(item);
    assert.equal(item.statusSince, "2026-08-30T09:00:00.000Z");
  });

  it("heldFrom skips same-status events and reads the real hold transition", () => {
    const [item] = toInboxItems([boardRow({
      status: "on_hold",
      events: [
        { at: at("2026-08-31T10:00:00Z"), from: "on_hold", to: "on_hold" },
        { at: at("2026-08-30T09:00:00Z"), from: "implementing", to: "on_hold" },
      ],
    })], repo);
    assert.ok(item);
    assert.equal(item.heldFrom, "implementing"); // 주 Resume 버튼이 여기서 정해진다
    assert.equal(item.statusSince, "2026-08-30T09:00:00.000Z");
  });

  it("falls back to updatedAt when no transition is in the window", () => {
    const [item] = toInboxItems([boardRow({ events: [] })], repo);
    assert.ok(item);
    assert.equal(item.statusSince, "2026-08-31T12:00:00.000Z");
  });
});
