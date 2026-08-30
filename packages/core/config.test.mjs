import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseHarnessConfig } from "./config.mjs";

const APCH = readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8");

describe("parseHarnessConfig", () => {
  it("accepts the ApcH example and normalizes defaults", () => {
    const c = parseHarnessConfig(APCH);
    assert.equal(c.project.name, "ApcH");
    assert.equal(c.workspaces.length, 3);
    assert.deepEqual(c.workspaces.map((w) => w.agent), ["web-dev", "admin-dev", "backend-dev"]);
    assert.equal(c.executor.kind, "local");
    assert.equal(c.executor.commandIssue, null);
    assert.equal(c.release.baseUrl, "https://admin.a-pch.com");
    assert.equal(c.release.auth, "verifier");
  });
  it("defaults: language en, executor local, release null, scout null, name=repo", () => {
    const c = parseHarnessConfig({ version: 1, project: { owner: "o", repo: "r", branch: "main" },
      workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] });
    assert.equal(c.language, "en");
    assert.equal(c.executor.kind, "local");
    assert.equal(c.executor.commandIssue, null);
    assert.equal(c.release, null);
    assert.equal(c.scout, null);
    assert.equal(c.project.name, "r");
  });
  const base = () => ({ version: 1, project: { owner: "o", repo: "r", branch: "main" },
    workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] });
  it("rejects wrong version", () => assert.throws(() => parseHarnessConfig({ ...base(), version: 2 }), /version/));
  it("rejects empty workspaces", () => assert.throws(() => parseHarnessConfig({ ...base(), workspaces: [] }), /workspaces/));
  it("rejects bad agent id", () => { const b = base(); b.workspaces[0].agent = "Web Dev"; assert.throws(() => parseHarnessConfig(b), /agent/); });
  it("rejects duplicate agent", () => { const b = base(); b.workspaces.push({ ...b.workspaces[0], id: "x" }); assert.throws(() => parseHarnessConfig(b), /duplicate/); });
  it("rejects empty verify", () => { const b = base(); b.workspaces[0].verify = []; assert.throws(() => parseHarnessConfig(b), /verify/); });
  it("routine executor requires commandIssue", () => assert.throws(() => parseHarnessConfig({ ...base(), executor: { kind: "routine" } }), /commandIssue/));
  it("rejects unknown executor kind", () => assert.throws(() => parseHarnessConfig({ ...base(), executor: { kind: "hosted" } }), /executor.kind/));
  it("release: strips trailing slash, auth default none", () => {
    const c = parseHarnessConfig({ ...base(), release: { baseUrl: "https://x.example/" } });
    assert.equal(c.release.baseUrl, "https://x.example"); assert.equal(c.release.auth, "none");
  });
  it("rejects unknown release.auth", () => assert.throws(() => parseHarnessConfig({ ...base(), release: { baseUrl: "https://x", auth: "oauth" } }), /release.auth/));
});
