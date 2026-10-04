import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, lockFailure, missingUnits } from "@/fsd/shared/lib/copy-lock";
import { LandingPage } from "./landing-page";
import { gateActionLabel, gateActionHint } from "@/fsd/entities/pipeline";

// 데모는 실제 Inbox의 순수 문구 API와 canonical copy를 함께 따른다.
it("the landing demo card shows the product lines product-copy.md §16 locks", () => {
  const html = renderToStaticMarkup(createElement(LandingPage, { signedIn: false, signInAction: async () => {} }));
  const missing = missingUnits(copyLock("landing-demo"), html);
  assert.deepEqual(missing, [], lockFailure("landing-demo", missing));
  assert.ok(html.includes(gateActionLabel("before-implement")));
  assert.ok(html.includes(gateActionHint("before-implement")));
});
