import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toInboxItems, gateCardKey } from "./inbox-item";

const repo = { owner: "o", repo: "r", branch: "main" };
const at = (iso: string) => new Date(iso);

it("Inbox plan destinations retain raw reserved path/ref data without query or fragment", () => {
  const path = "docs/#?% 한글.md";
  const [item] = toInboxItems([boardRow({ planPath: path, planCommit: "commit/#?%" })], { ...repo, branch: "feature/branch" });
  assert.ok(item?.planUrl);
  const url = new URL(item.planUrl);
  assert.equal(url.hash, ""); assert.equal(url.search, "");
  assert.equal(url.pathname.split("/").map(decodeURIComponent).join("/"), `/o/r/blob/commit/#?%/${path}`);
});

it("card identity distinguishes entries and pipeline runs even when clocks are equal", () => {
  const [item] = toInboxItems([boardRow({})], repo);
  const bound = { ...item, format: "slots-v1", gateEntry: { runId: "run", entryId: "entry" } };
  assert.equal(gateCardKey(bound), gateCardKey({ ...bound, updatedAt: "changed" }));
  assert.notEqual(gateCardKey(bound), gateCardKey({ ...bound, gateEntry: { runId: "run", entryId: "next" } }));
  assert.notEqual(gateCardKey(bound), gateCardKey({ ...bound, gateEntry: { runId: "new-run", entryId: "entry" } }));
  assert.notEqual(gateCardKey(item), gateCardKey({ ...item, updatedAt: "changed" }));
});

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
  backlogItem: { type: null, key: "FEAT-01", title: "t", area: "src" },
  events: [] as { at: Date; from: string | null; to: string | null; actor: string }[],
  run: { node: "before-implement", closedAt: null } as { node: string; closedAt: Date | null } | null,
  ...overrides,
});

describe("toInboxItems", () => {
  it("statusSince reads the real transition, not a newer same-status event", () => {
    const [item] = toInboxItems([boardRow({
      events: [
        { at: at("2026-08-31T10:00:00Z"), from: "in_review", to: "in_review" , actor: "agent" },
        { at: at("2026-08-30T09:00:00Z"), from: "planning", to: "in_review" , actor: "agent" },
      ],
    })], repo);
    assert.ok(item);
    assert.equal(item.statusSince, "2026-08-30T09:00:00.000Z");
  });

  it("heldFrom skips same-status events and reads the real hold transition", () => {
    const [item] = toInboxItems([boardRow({
      status: "on_hold",
      events: [
        { at: at("2026-08-31T10:00:00Z"), from: "on_hold", to: "on_hold" , actor: "agent" },
        { at: at("2026-08-30T09:00:00Z"), from: "implementing", to: "on_hold" , actor: "agent" },
      ],
    })], repo);
    assert.ok(item);
    assert.equal(item.heldFrom, "implementing");
    assert.equal(item.heldBy, "agent");
    assert.equal(item.statusSince, "2026-08-30T09:00:00.000Z");
  });

  it("heldBy reads the hold transition's actor, and is null when no hold is in the events", () => {
    const [byOwner] = toInboxItems([boardRow({
      status: "on_hold",
      events: [{ at: at("2026-08-30T09:00:00Z"), from: "in_review", to: "on_hold", actor: "human" }],
    })], repo);
    assert.equal(byOwner?.heldBy, "human");
    const [unknown] = toInboxItems([boardRow({ status: "on_hold", events: [] })], repo);
    assert.equal(unknown?.heldBy, null);
    const [open] = toInboxItems([boardRow({
      status: "in_review",
      run: { node: "before-implement", closedAt: null },
      events: [{ at: at("2026-08-30T09:00:00Z"), from: "on_hold", to: "in_review", actor: "human" }],
    })], repo);
    assert.equal(open?.heldBy, null);
  });

  it("names who put it on the board — pm, or you when it came from the Backlog tab", () => {
    const byAgent = toInboxItems([boardRow({
      status: "proposed",
      run: { node: "before-plan", closedAt: null },
      events: [{ at: at("2026-08-30T00:00:00Z"), from: null, to: "proposed", actor: "agent" }],
    })], repo)[0];
    assert.equal(byAgent?.proposedBy, "pm");

    const byOwner = toInboxItems([boardRow({
      status: "proposed",
      run: { node: "before-plan", closedAt: null },
      events: [{ at: at("2026-08-30T00:00:00Z"), from: null, to: "proposed", actor: "human" }],
    })], repo)[0];
    assert.equal(byOwner?.proposedBy, "you", "웹에서 올린 항목을 pm이 올렸다고 말하면 안 된다");

    assert.equal(toInboxItems([boardRow({ events: [] })], repo)[0]?.proposedBy, "pm");
  });

  it("planUrl opens the recorded commit, not the branch — that commit is what `before-implement` approves", () => {
    const [item] = toInboxItems([boardRow({ planPath: "docs/plans/FEAT-01.md", planCommit: "b72a941" })], repo);
    assert.ok(item);
    assert.equal(item.planUrl, "https://github.com/o/r/blob/b72a941/docs/plans/FEAT-01.md");
  });

  it("falls back to updatedAt when no transition is in the window", () => {
    const [item] = toInboxItems([boardRow({ events: [] })], repo);
    assert.ok(item);
    assert.equal(item.statusSince, "2026-08-31T12:00:00.000Z");
  });
});
