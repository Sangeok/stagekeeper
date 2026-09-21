import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, lockFailure, missingUnits, visibleText } from "@/fsd/shared/lib/copy-lock";
import { OwnerTokenReveal } from "./owner-token-reveal";
import { TokenReveal } from "./token-reveal";

// 잠금 블록의 자리표시자와 같은 값으로 그린다(product-copy.md 머리의 "Copy-lock blocks").
const MCP_URL = "http://…/api/mcp";
const reveal = (token: string) => renderToStaticMarkup(createElement(TokenReveal, { token, mcpUrl: MCP_URL }));

function assertLocked(ids: readonly string[], html: string) {
  for (const id of ids) {
    const missing = missingUnits(copyLock(id), html);
    assert.deepEqual(missing, [], lockFailure(id, missing));
  }
}

// 2026-09-21: product-copy.md §9가 두 번 고쳐지는 동안(a766a0e · 6871680 — 문서와 스킬만 건드린 커밋)
// 이 화면은 `.mcp.json`·서버 줄·"approve the server"를 그대로 들고 있었다. 아래 잠금이 그때 있었다면 떨어졌다.
describe("TokenReveal follows product-copy.md §9", () => {
  it("a project token (hs_) shows the shared steps and the project steps", () => {
    assertLocked(["token-reveal-shared", "token-reveal-project"], reveal("hs_…"));
  });

  it("a user token (hu_) shows the shared steps and the user steps", () => {
    assertLocked(["token-reveal-shared", "token-reveal-user"], reveal("hu_…"));
  });

  // 같은 컴포넌트가 두 종류를 그린다 — 한쪽 문장이 다른 쪽에 새면 hs_를 머신 전역에 저장하라고 말하게 된다.
  it("keeps each kind's step 2 to itself", () => {
    assert.doesNotMatch(visibleText(reveal("hs_…")), /Save the token once for this machine/);
    assert.doesNotMatch(visibleText(reveal("hu_…")), /This lasts only in this terminal/);
  });

  it("stops at /harness:init — no server line to copy and no fifth step", () => {
    for (const token of ["hs_…", "hu_…"]) {
      const text = visibleText(reveal(token));
      assert.doesNotMatch(text, /HARNESS_SERVER/, token);
      assert.doesNotMatch(text, /5\. /, token);
    }
  });
});

describe("OwnerTokenReveal follows product-copy.md §9", () => {
  it("shows the owner block", () => {
    const html = renderToStaticMarkup(createElement(OwnerTokenReveal, { token: "ho_…", ownerMcpUrl: "http://…/api/mcp/owner" }));
    assertLocked(["owner-token-reveal"], html);
  });
});
