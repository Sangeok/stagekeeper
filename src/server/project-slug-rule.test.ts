import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RESERVED_SLUGS, SLUG_MAX, SLUG_RE, availableSlug, slugCandidate } from "./project-slug-rule";

describe("slugCandidate", () => {
  it("passes through a name that is already a valid slug", () => {
    assert.equal(slugCandidate("stagekeeper"), "stagekeeper");
    assert.equal(slugCandidate("my-repo-2"), "my-repo-2");
  });

  it("folds case and non-slug characters into single dashes", () => {
    assert.equal(slugCandidate("StageKeeper"), "stagekeeper");
    assert.equal(slugCandidate("my_repo.name"), "my-repo-name");
    assert.equal(slugCandidate("a//b??c"), "a-b-c");
  });

  it("trims leading and trailing dashes rather than emitting an invalid slug", () => {
    assert.equal(slugCandidate("_repo_"), "repo");
    assert.equal(slugCandidate("...x-y..."), "x-y");
  });

  it("truncates to the shared maximum", () => {
    const long = "a".repeat(SLUG_MAX + 20);
    const out = slugCandidate(long);
    assert.equal(out?.length, SLUG_MAX);
    assert.match(out ?? "", SLUG_RE);
  });

  // null은 "못 만들었다"는 뜻이고 호출부가 fallback으로 푼다 — 규칙을 어긴 슬러그를 내보내지 않는다.
  it("returns null when nothing valid survives", () => {
    assert.equal(slugCandidate(""), null);
    assert.equal(slugCandidate("..."), null);
    assert.equal(slugCandidate("a"), null); // 최소 2자
  });

  it("returns null for a reserved slug so the caller suffixes it", () => {
    for (const reserved of RESERVED_SLUGS) assert.equal(slugCandidate(reserved), null);
  });
});

describe("availableSlug", () => {
  it("uses the plain candidate when nothing has taken it", () => {
    assert.equal(availableSlug("stagekeeper", new Set()), "stagekeeper");
  });

  // 접미사는 **다른 저장소가 같은 이름일 때만** 쓰인다. 같은 저장소의 재등록은 호출부의 멱등
  // 조회가 먼저 잡으므로 여기 오지 않는다 — 그 구분이 무너지면 init 재실행이 <repo>-2를 만든다.
  it("suffixes only when the name is genuinely taken by something else", () => {
    assert.equal(availableSlug("stagekeeper", new Set(["stagekeeper"])), "stagekeeper-2");
    assert.equal(availableSlug("stagekeeper", new Set(["stagekeeper", "stagekeeper-2"])), "stagekeeper-3");
  });

  it("falls back when the repo name yields no valid candidate", () => {
    assert.equal(availableSlug("...", new Set()), "project");
    assert.equal(availableSlug("...", new Set(["project"])), "project-2");
  });

  it("keeps the suffixed slug inside the maximum and still valid", () => {
    const taken = new Set([("b".repeat(SLUG_MAX))]);
    const out = availableSlug("b".repeat(SLUG_MAX + 5), taken);
    assert.ok(out.length <= SLUG_MAX, `${out.length} > ${SLUG_MAX}`);
    assert.match(out, SLUG_RE);
    assert.ok(!taken.has(out));
  });

  it("never returns a reserved slug", () => {
    // "new"는 후보 단계에서 null이 되어 fallback으로 빠진다.
    assert.ok(!RESERVED_SLUGS.has(availableSlug("new", new Set())));
  });
});
