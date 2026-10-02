import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TokenUsage } from "./token-usage";

it("distinguishes legacy unknown, tracked no-record, and UTC authentication time", () => {
  const render = (lastUsedAt: Date | null, usageTrackingStartedAt: Date | null) => renderToStaticMarkup(createElement(TokenUsage, { lastUsedAt, usageTrackingStartedAt }));
  assert.match(render(null, null), /Unknown/);
  assert.match(render(null, null), /Usage before tracking began is unavailable/);
  assert.match(render(null, new Date()), /Never used/);
  assert.match(render(null, new Date()), /No authentication use recorded since tracking began/);
  for (const started of [null, new Date()]) {
    const html = render(new Date("2026-10-02T03:04:59.999Z"), started);
    assert.match(html, /2026-10-02 03:04 UTC/);
    assert.match(html, /dateTime="2026-10-02T03:04:59.999Z"/);
    assert.doesNotMatch(html, /Never used|Unknown/);
  }
});
