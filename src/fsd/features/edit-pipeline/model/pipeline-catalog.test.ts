import assert from "node:assert/strict";
import { it } from "node:test";
import { catalogEntries, filterPipelines } from "./pipeline-catalog";
import type { PipelineSnapshot } from "./rail-state";

const pipelines: PipelineSnapshot[] = [
  { id: "checks", name: "Verify implementation", isDefault: false, definition: { steps: ["impl-verify", "qa"], gates: [] }, saved: null, runnable: null },
  { id: "dev", name: "Development", isDefault: true, definition: { steps: ["plan", "implement", "pipeline:checks", "accept"], gates: [] }, saved: null, runnable: null },
];

it("browses all pipelines without a query and discovers nested steps by their display names", () => {
  const entries = catalogEntries(pipelines);
  assert.deepEqual(filterPipelines(entries, "  ").map(entry => entry.name), ["Development", "Verify implementation"]);
  assert.equal(entries[0].summary, "Plan → Implement → Implementation check → QA · +1 more");
  assert.equal(entries[0].steps.length, 5);
  assert.deepEqual(filterPipelines(entries, "QA develop").map(entry => entry.id), ["dev"]);
  assert.deepEqual(filterPipelines(entries, "IMPLEMENTATION CHECK").map(entry => entry.id), ["dev", "checks"]);
  assert.deepEqual(filterPipelines(entries, "unknown"), []);
});

it("keeps an invalid reference discoverable by pipeline name", () => {
  const entries = catalogEntries([{ ...pipelines[0], definition: { steps: ["pipeline:missing"], gates: [] } }]);
  assert.equal(entries[0].summary, "Steps unavailable");
  assert.equal(filterPipelines(entries, "verify").length, 1);
});
