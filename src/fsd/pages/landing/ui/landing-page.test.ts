import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, lockFailure, missingUnits, visibleText } from "@/fsd/shared/lib/copy-lock";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "../model/landing-copy";
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

// 제목·설명은 화면이 아니라 <head>에 나가므로 렌더 대신 값을 글자 그대로 잠금과 맞춘다.
// 설명은 본문 첫 문단의 앞 두 문장이라 페이지에도 그대로 있어야 한다.
it("the document title and description are the lines product-copy.md §16 locks", () => {
  assert.deepEqual([LANDING_TITLE, LANDING_DESCRIPTION], copyLock("landing-meta"));
  const html = renderToStaticMarkup(createElement(LandingPage, { signedIn: false, signInAction: async () => {} }));
  assert.ok(visibleText(html).includes(LANDING_DESCRIPTION), "the description is the page's own paragraph");
});
