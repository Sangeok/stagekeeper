import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHarnessConfig } from "./harness-config.mjs";

const base = () => ({ version: 1, project: { owner: "o", repo: "r", branch: "main" },
  workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] });

for (const field of ["project", "executor", "release", "scout"]) it(`rejects non-object ${field} with its config field path`, () => {
  for (const value of [null, [], "wrong", 1, true]) {
    assert.throws(() => parseHarnessConfig({ ...base(), [field]: value }), {
      name: "Error", message: `harness.json ${field}: must be an object`,
    });
  }
});

describe("parseHarnessConfig", () => {
  it("accepts JSON text and preserves explicit project identity and language", () => {
    const input = { ...base(), project: { owner: "team", repo: "tools", branch: "release", name: "Team tools", slug: "tools-1" }, language: "ko" };
    const config = parseHarnessConfig(JSON.stringify(input));
    assert.deepEqual(config.project, input.project);
    assert.equal(config.language, "ko");
  });
  it("preserves workspace order and optional metadata while normalizing omissions", () => {
    const workspaces = [
      { id: "jobs", path: "workers/jobs", agent: "jobs-dev", verify: ["npm run check", "npm test"], knowledge: "workers/jobs/AGENTS.md", readOnly: ["packages/contracts/**"] },
      { id: "api", path: "services/api", agent: "api-dev", verify: ["npm test"] },
    ];
    const config = parseHarnessConfig({ ...base(), workspaces });
    assert.deepEqual(config.workspaces, [workspaces[0], { ...workspaces[1], knowledge: null, readOnly: [] }]);
  });
  it("preserves configured release authentication and scout question", () => {
    const release = { baseUrl: "https://preview.example.test", auth: "verifier" };
    const scout = { question: "Which failing workflow should be fixed next?" };
    const config = parseHarnessConfig({ ...base(), release, scout });
    assert.deepEqual(config.release, release);
    assert.deepEqual(config.scout, scout);
  });
  it("defaults: language en, executor local, release null, scout null, name=repo", () => {
    const c = parseHarnessConfig(base());
    assert.equal(c.language, "en");
    assert.equal(c.executor.kind, "local");
    assert.equal(c.executor.commandIssue, null);
    assert.equal(c.release, null);
    assert.equal(c.scout, null);
    assert.equal(c.project.name, "r");
    assert.equal(c.project.slug, null);
  });
  it("rejects wrong version", () => assert.throws(() => parseHarnessConfig({ ...base(), version: 2 }), /version/));
  it("rejects empty workspaces", () => assert.throws(() => parseHarnessConfig({ ...base(), workspaces: [] }), /workspaces/));
  it("rejects bad agent id", () => { const b = base(); b.workspaces[0].agent = "Web Dev"; assert.throws(() => parseHarnessConfig(b), /agent/); });
  it("rejects duplicate agent", () => { const b = base(); b.workspaces.push({ ...b.workspaces[0], id: "x" }); assert.throws(() => parseHarnessConfig(b), /duplicate/); });
  for (const agent of ["pm", "plan-verifier", "doc-auditor", "feature-scout"]) {
    it(`rejects reserved report agent ${agent}`, () => {
      const input = base();
      input.workspaces[0].agent = agent;
      assert.throws(() => parseHarnessConfig(input), /workspaces\[0\]\.agent: reserved report agent/);
    });
  }
  for (const readOnly of ["src/generated/**", null, {}, [null], [""]]) {
    it(`rejects invalid readOnly ${JSON.stringify(readOnly)}`, () => {
      const input = base();
      input.workspaces[0].readOnly = readOnly;
      assert.throws(() => parseHarnessConfig(input), /workspaces\[0\]\.readOnly/);
    });
  }
  for (const readOnly of [undefined, [], ["src/generated/**"]]) {
    it(`preserves valid readOnly ${JSON.stringify(readOnly)}`, () => {
      const input = base();
      input.workspaces[0].readOnly = readOnly;
      assert.deepEqual(parseHarnessConfig(input).workspaces[0].readOnly, readOnly ?? []);
    });
  }
  it("rejects empty verify", () => { const b = base(); b.workspaces[0].verify = []; assert.throws(() => parseHarnessConfig(b), /verify/); });
  it("routine executor requires commandIssue", () => assert.throws(() => parseHarnessConfig({ ...base(), executor: { kind: "routine" } }), /commandIssue/));
  it("rejects unknown executor kind", () => assert.throws(() => parseHarnessConfig({ ...base(), executor: { kind: "hosted" } }), /executor.kind/));
  it("release: strips trailing slash, auth default none", () => {
    const c = parseHarnessConfig({ ...base(), release: { baseUrl: "https://x.example/" } });
    assert.equal(c.release.baseUrl, "https://x.example"); assert.equal(c.release.auth, "none");
  });
  it("rejects unknown release.auth", () => assert.throws(() => parseHarnessConfig({ ...base(), release: { baseUrl: "https://x", auth: "oauth" } }), /release.auth/));
});

it("normalized workspace validation preserves semantic order and raw knowledge compatibility", async () => {
  const { validateWorkspaceSemantics: validateWorkspaces } = await import("./workspaces.mjs");
  const valid = { id: "web", path: ".", agent: "dev", verify: ["npm test"], knowledge: null, readOnly: [] };
  assert.deepEqual(validateWorkspaces([valid]), [valid]);
  for (const [input, expected] of [
    [[], /at least one workspace/],
    [[{ ...valid, agent: "pm", verify: [] }], /reserved report agent/],
    [[valid, { ...valid, id: "" }], /duplicate agent/],
    [[{ ...valid, id: "", verify: [] }], /verify/],
    [[{ ...valid, id: "", readOnly: null }], /readOnly/],
    [[{ ...valid, verify: [""], knowledge: "" }], /verify\[0\]/],
    [[{ ...valid, knowledge: "", readOnly: [""] }], /knowledge/],
  ]) assert.throws(() => validateWorkspaces(input), expected);
  const rawConfig = { version: 1, project: { owner: "a", repo: "b", branch: "main" }, workspaces: [valid] };
  assert.throws(() => parseHarnessConfig(rawConfig), /knowledge/);
  const raw = { ...valid }; delete raw.knowledge; delete raw.readOnly;
  assert.deepEqual(parseHarnessConfig({ ...rawConfig, workspaces: [raw] }).workspaces, [valid]);
});
