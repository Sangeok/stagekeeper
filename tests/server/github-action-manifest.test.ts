import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { assertActions, manifestEntries } from "./fixtures/action-manifest";

it("registers only the creation Action and all eight repository routes in a fresh build", { skip: process.env.GITHUB_CHECK_ACTION_MANIFEST !== "true" }, () => {
  assertActions("src/fsd/features/create-project/api/create-project.server.ts", ["createProject"]);
  const entries = manifestEntries();
  for (const entry of entries) {
    const filename = entry.filename?.replaceAll("\\", "/") ?? "";
    assert.equal(/(?:^|\/)src\/server\/github\//.test(filename), false);
    assert.equal(filename.endsWith("repository-picker.server.ts"), false);
    if (filename.endsWith("create-project.server.ts")) assert.equal(entry.exportedName, "createProject");
  }
  const routes: unknown = JSON.parse(readFileSync(".next/server/app-paths-manifest.json", "utf8"));
  assert.ok(routes && typeof routes === "object" && !Array.isArray(routes));
  for (const route of ["connection/start", "connection/callback", "connection/installation", "connection/draft", "connection/cancel", "connection/disconnect", "repositories", "webhook"]) {
    assert.ok(Object.hasOwn(routes, `/api/github/${route}/route`));
  }
});
