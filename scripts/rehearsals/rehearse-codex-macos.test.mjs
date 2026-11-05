import assert from "node:assert/strict";
import { it } from "node:test";
import path from "node:path";
import { parseMacosRehearsalArguments } from "./rehearse-codex-macos.mjs";

const required = ["--package", path.resolve("package"), "--templates", path.resolve("templates"), "--work", path.resolve("evidence"), "--browser-cli", path.resolve("browser/cli.js")];

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
