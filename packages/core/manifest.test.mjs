import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashOf, planWrites } from "./manifest.mjs";

const t = { "a.md": { template: "x/a.md", content: "A2" } };
describe("planWrites", () => {
  it("writes when file is absent", () =>
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": null }, lock: null, adopt: false }).write, ["a.md"]));
  it("writes when locked hash matches current file", () => {
    const lock = { version: 1, files: { "a.md": { template: "x/a.md", hash: hashOf("A1") } } };
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "A1" }, lock, adopt: false }).write, ["a.md"]);
  });
  it("skips when user modified a generated file", () => {
    const lock = { version: 1, files: { "a.md": { template: "x/a.md", hash: hashOf("A1") } } };
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "A1 edited" }, lock, adopt: false }).skipModified, ["a.md"]);
  });
  it("refuses unknown existing file unless adopt", () => {
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "theirs" }, lock: null, adopt: false }).refuse, ["a.md"]);
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "theirs" }, lock: null, adopt: true }).write, ["a.md"]);
  });
  it("hash is stable and short", () => { assert.equal(hashOf("x"), hashOf("x")); assert.equal(hashOf("x").length, 16); });
  it("normalizes CRLF so a Windows checkout is not mistaken for a user edit", () => {
    assert.equal(hashOf("a\r\nb\r\n"), hashOf("a\nb\n"));
    const lock = { version: 1, files: { "a.md": { template: "x/a.md", hash: hashOf("A1\n") } } };
    // 디스크에서 CRLF로 돌아온 같은 내용 → skipModified가 아니라 write여야 한다
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "A1\r\n" }, lock, adopt: false }).write, ["a.md"]);
  });
});
