import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingPage } from "./billing-page";

it("renders usage only as percent with accessible progress and a recovery time at cap", () => {
  for (const percent of [0, 37, 100]) {
    const html = renderToStaticMarkup(createElement(BillingPage, { plan: "pro", usage: { kind: "limited", percent, resetAt: "2026-10-02T14:10:00.000Z" } }));
    const section = html.split('id="account-usage-heading"')[1].split("</section>")[0];
    assert.match(section, new RegExp(`${percent}% used`));
    assert.match(section, /<progress[^>]*aria-label="Account usage"/);
    assert.doesNotMatch(section, /runs used|100 runs|used\s*\/|Infinity/);
    assert.equal(section.includes('dateTime="2026-10-02T14:10:00.000Z"'), percent === 100);
  }
});
it("distinguishes unlimited and unavailable from a zero-percent snapshot", () => {
  for (const kind of ["unlimited", "unavailable"] as const) {
    const html = renderToStaticMarkup(createElement(BillingPage, { plan: "max", usage: { kind } }));
    assert.match(html, kind === "unlimited" ? /Unlimited/ : /Usage unavailable/);
    assert.doesNotMatch(html, /0% used|<progress/);
  }
});
