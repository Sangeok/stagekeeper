import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEGMENT, parseRepoUrl } from "./repo-url.mjs";

// 생성기가 `git remote get-url origin`에서 받을 법한 모양들. 실재 확인은 하지 않는다 —
// 형식 해석만이라는 것이 이 모듈의 계약이다.
describe("parseRepoUrl", () => {
  const expected = { owner: "Sangeok", repo: "stagekeeper" };

  it("reads the three shapes git remote actually prints", () => {
    for (const url of [
      "git@github.com:Sangeok/stagekeeper.git",
      "https://github.com/Sangeok/stagekeeper.git",
      "https://github.com/Sangeok/stagekeeper",
      "http://www.github.com/Sangeok/stagekeeper",
      "Sangeok/stagekeeper",
    ]) {
      assert.deepEqual(parseRepoUrl(url), expected, url);
    }
  });

  it("tolerates trailing slashes, query strings, and surrounding whitespace", () => {
    for (const url of [
      "  https://github.com/Sangeok/stagekeeper/  ",
      "https://github.com/Sangeok/stagekeeper?tab=readme",
      "https://github.com/Sangeok/stagekeeper/tree/dev",
      "git@github.com:Sangeok/stagekeeper.git/",
    ]) {
      assert.deepEqual(parseRepoUrl(url), expected, url);
    }
  });

  // null은 "해석 못 했다"이고 호출부가 사용자에게 물어서 진행한다 — 추측한 값을 내보내지 않는다.
  it("returns null rather than guessing", () => {
    for (const url of ["", "   ", "not a url", "https://gitlab.com/a/b", "https://github.com/onlyowner", null, undefined, 42]) {
      assert.equal(parseRepoUrl(url), null, String(url));
    }
  });

  // 다른 호스트를 짧은 형태로 오인하지 않는다 — owner에 점을 허용하지 않는 이유다.
  it("does not mistake a bare host path for owner/repo", () => {
    assert.equal(parseRepoUrl("example.com/thing"), null);
  });

  it("rejects names that SEGMENT forbids", () => {
    assert.equal(parseRepoUrl("git@github.com:Sangeok/bad..git"), null);
    assert.equal(SEGMENT.test("ok-name_1.x"), true);
    assert.equal(SEGMENT.test("-leading"), false);
    assert.equal(SEGMENT.test("trailing."), false);
  });
});
