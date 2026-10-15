import assert from "node:assert/strict";
import { it } from "node:test";
import { beginPipelineSave, createPipelineDraft, discardPipelineDraft, editPipelineDraft, finishPipelineSave, isPipelineDirty, receivePipelineSnapshot } from "./pipeline-draft-state";
import type { Graph } from "./rail-state";

const original: Graph = { nodes: ["propose", "plan", "implement", "accept"], gates: ["before-plan"] };
const draft: Graph = { nodes: ["plan", "implement", "accept"], gates: ["before-plan"] };
const remote: Graph = { ...original, gates: ["before-implement"] };
const initial = (version = 3) => createPipelineDraft({ graph: original, version });

it("adopts newer snapshots only when clean and ignores equal or older persisted versions", () => {
  const start = initial();
  assert.equal(receivePipelineSnapshot(start, { graph: { ...original }, version: 3 }), start);
  const next = receivePipelineSnapshot(start, { graph: remote, version: 4 });
  assert.deepEqual(next.graph, remote);
  assert.equal(next.baseline.version, 4);
  assert.equal(isPipelineDirty(next), false);
  assert.equal(receivePipelineSnapshot(next, { graph: original, version: 3 }), next);
  assert.equal(receivePipelineSnapshot(next, { graph: original, version: 4 }), next);
});

it("retains the draft and its CAS baseline when another writer advances the server", () => {
  const edited = editPipelineDraft(initial(), draft);
  const next = receivePipelineSnapshot(edited, { graph: remote, version: 4 });
  assert.deepEqual(next.graph, draft);
  assert.equal(next.baseline.version, 3);
  assert.equal(next.latest.version, 4);
  assert.equal(next.request.status, "stale");
  assert.equal(beginPipelineSave(next), next);
  assert.equal(discardPipelineDraft(next), next);
});

it("handles changed version-zero defaults without erasing edits or fabricating a persisted version", () => {
  const next = receivePipelineSnapshot(initial(0), { graph: remote, version: 0 });
  assert.deepEqual(next.graph, remote);
  const edited = receivePipelineSnapshot(editPipelineDraft(initial(0), draft), { graph: remote, version: 0 });
  assert.deepEqual(edited.graph, draft);
  assert.equal(edited.baseline.version, 0);
  assert.equal(edited.request.status, "idle");
  assert.deepEqual(discardPipelineDraft(edited).graph, remote);
  assert.deepEqual(editPipelineDraft(edited, original).graph, remote);
});

it("captures one immutable request and blocks editing/discard while it is pending", () => {
  const source = { nodes: [...draft.nodes], gates: [...draft.gates] };
  const saving = beginPipelineSave(editPipelineDraft(initial(), source));
  source.nodes.push("scout");
  assert.equal(saving.request.status, "saving");
  if (saving.request.status !== "saving") assert.fail("save not started");
  assert.deepEqual(saving.request.submitted, { graph: draft, expectedVersion: 3 });
  assert.equal(beginPipelineSave(saving), saving);
  assert.equal(editPipelineDraft(saving, remote), saving);
  assert.equal(discardPipelineDraft(saving), saving);
});

it("keeps a pending draft through revalidation and settles its own success before adopting later work", () => {
  const saving = beginPipelineSave(editPipelineDraft(initial(), draft));
  for (const version of [3, 4, 5]) {
    const refreshed = receivePipelineSnapshot(saving, { graph: remote, version });
    assert.equal(refreshed.request.status, "saving");
    assert.deepEqual(refreshed.graph, draft);
    const finished = finishPipelineSave(refreshed, { status: "success", version: 4 });
    assert.equal(finished.request.status, "idle");
    assert.equal(isPipelineDirty(finished), false);
    assert.equal(finished.baseline.version, Math.max(4, version));
    assert.deepEqual(finished.graph, version > 4 ? remote : draft);
    assert.equal(receivePipelineSnapshot(finished, { graph: original, version: 3 }), finished);
  }
});

it("allows a rejected save to retry unless revalidation has already exposed a conflict", () => {
  const saving = beginPipelineSave(editPipelineDraft(initial(), draft));
  const refused = finishPipelineSave(saving, { status: "error", reason: "Refused" });
  assert.equal(refused.request.status, "idle");
  assert.deepEqual(refused.graph, draft);
  assert.equal(beginPipelineSave(refused).request.status, "saving");
  const raced = receivePipelineSnapshot(saving, { graph: remote, version: 4 });
  assert.equal(finishPipelineSave(raced, { status: "error", reason: "Refused" }).request.status, "stale");
});

for (const status of ["stale", "unknown"] as const) {
  it(`keeps ${status} recovery even when the graph looks clean or a later snapshot arrives`, () => {
    const saving = beginPipelineSave(editPipelineDraft(initial(), draft));
    const failed = finishPipelineSave(saving, { status });
    const cleanLooking = editPipelineDraft(failed, original);
    assert.equal(isPipelineDirty(cleanLooking), false);
    const next = receivePipelineSnapshot(cleanLooking, { graph: remote, version: 4 });
    assert.deepEqual(next.graph, original);
    assert.equal(next.baseline.version, 3);
    assert.equal(next.request.status, status);
    assert.equal(beginPipelineSave(next), next);
    assert.equal(discardPipelineDraft(next), next);
  });
}

it("ignores outcomes without an owned pending request and copies initial input", () => {
  const source = { nodes: [...original.nodes], gates: [...original.gates] };
  const state = createPipelineDraft({ graph: source, version: 3 });
  source.nodes.length = 0;
  assert.deepEqual(state.graph, original);
  assert.equal(finishPipelineSave(state, { status: "success", version: 99 }), state);
  assert.equal(beginPipelineSave(state), state);
});
