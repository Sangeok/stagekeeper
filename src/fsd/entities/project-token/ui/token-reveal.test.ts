import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, lockFailure, missingUnits, visibleText } from "@/fsd/shared/lib/copy-lock";
import { OwnerTokenReveal, OwnerTokenRevealView } from "./owner-token-reveal";
import { TokenReveal, TokenRevealView } from "./token-reveal";

it("ships the public init reuse guidance through the bumped plugin package", () => {
  const skill = readFileSync("plugin/skills/init/SKILL.md", "utf8").replace(/\s+/g, " ");
  assert.match(skill, /set the same token again from secure storage/);
  assert.match(skill, /token stays valid until revoked or its chosen expiry/);
  assert.match(skill, /Never ask for the token in chat or commit it to the repository/);
  assert.match(skill, /Do not save it machine-wide/i);
  const plugin = JSON.parse(readFileSync("plugin/.claude-plugin/plugin.json", "utf8"));
  const marketplace = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8"));
  assert.equal(plugin.version, "0.5.1");
  assert.ok(marketplace.plugins.some((entry: { name: string; source: string }) => entry.name === plugin.name && entry.source === "./plugin"));
});

it("renders actual Codex install/init guidance while preserving token scope and avoiding watch claims", () => {
  for (const token of ["hs_…", "hu_…"]) {
    const html = renderToStaticMarkup(createElement(TokenRevealView, { token, mcpUrl: MCP_URL, client: "codex", onClientChange: () => {} }));
    const text = visibleText(html);
    assertLocked(["token-reveal-codex", token.startsWith("hu_") ? "token-reveal-codex-user" : "token-reveal-codex-project"], html);
    assert.match(text, /codex plugin marketplace add Sangeok\/stagekeeper/); assert.match(text, /codex plugin add harness@stagekeeper-local/);
    assert.match(text, /\$harness-init/); assert.match(text, /Start Codex/); assert.doesNotMatch(text, /harness:watch|automatic.*watch/);
    assert.equal(text.includes("Save the token once for this machine"), token.startsWith("hu_"));
  }
});

// 잠금 블록의 자리표시자와 같은 값으로 그린다(product-copy.md 머리의 "Copy-lock blocks").
const MCP_URL = "http://…/api/mcp";
const reveal = (token: string) => renderToStaticMarkup(createElement(TokenReveal, { token, mcpUrl: MCP_URL }));

function assertLocked(ids: readonly string[], html: string) {
  for (const id of ids) {
    const missing = missingUnits(copyLock(id), html);
    assert.deepEqual(missing, [], lockFailure(id, missing));
  }
}

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
    assert.match(visibleText(reveal("hs_…")), /set the same token again from your secure storage/);
    assert.doesNotMatch(visibleText(reveal("hu_…")), /This environment variable lasts only in this terminal/);
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
  it("shows the Codex owner connection without implying init registers it", () => {
    const html = renderToStaticMarkup(createElement(OwnerTokenRevealView, { token: "ho_…", ownerMcpUrl: "http://fixture.test/api/mcp/owner", client: "codex", onClientChange: () => {} }));
    assertLocked(["owner-token-reveal-codex"], html);
    const text = visibleText(html);
    assert.match(text, /codex mcp add harness_owner --url 'http:\/\/fixture.test\/api\/mcp\/owner' --bearer-token-env-var HARNESS_OWNER_TOKEN/);
    assert.doesNotMatch(text, /\/harness:init|\$harness-init|harness:watch/);
  });

  it("shows the owner block", () => {
    const html = renderToStaticMarkup(createElement(OwnerTokenReveal, { token: "ho_…", ownerMcpUrl: "http://…/api/mcp/owner" }));
    assertLocked(["owner-token-reveal"], html);
  });
});
