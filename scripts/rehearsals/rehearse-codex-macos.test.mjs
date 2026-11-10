import assert from "node:assert/strict";
import { it } from "node:test";
import path from "node:path";
import { countResidentModelStarts, parseMacosRehearsalArguments } from "./rehearse-codex-macos.mjs";

const required = ["--package", path.resolve("package"), "--templates", path.resolve("templates"), "--work", path.resolve("evidence"), "--browser-cli", path.resolve("browser/cli.js")];

it("counts actual resident model starts without counting message text and refuses damaged evidence", () => {
  const events = [{ event: "model-start", generation: 1 }, { event: "model-message", text: JSON.stringify({ event: "model-start" }) }, { event: "model-settled" }, { generation: 2, event: "model-start" }];
  const log = events.map(event => `2026-11-10T00:00:00Z ${JSON.stringify(event)}`).join("\n");
  assert.equal(countResidentModelStarts(log), 2);
  assert.equal(countResidentModelStarts("Runner started\n"), 0);
  assert.throws(() => countResidentModelStarts(log + '\n2026-11-10T00:01:00Z {"event":'));
});

it("requires an explicit model-run decision and absolute isolated artifact inputs", () => {
  assert.throws(() => parseMacosRehearsalArguments(required), /run-models/);
  assert.throws(() => parseMacosRehearsalArguments([...required, "--run-models", "--work", path.resolve("other")]), /Invalid/);
  assert.throws(() => parseMacosRehearsalArguments(["--run-models", "--package", "relative"]), /absolute/);
  const result = parseMacosRehearsalArguments([...required, "--run-models", "--idle-minutes", "110"]);
  assert.equal(result.idleMinutes, 110);
  assert.equal(result.packageRoot, path.resolve("package"));
});

it("does not accept unbounded, negative or fractional idle observations", () => {
  for (const minutes of ["-1", "0.5", "121", "NaN", "Infinity"]) assert.throws(() => parseMacosRehearsalArguments([...required, "--run-models", "--idle-minutes", minutes]), /idle-minutes/);
});
