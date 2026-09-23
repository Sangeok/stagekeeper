import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { copyLock, lockFailure, missingUnits } from "@/fsd/shared/lib/copy-lock";
import { LandingPage } from "./landing-page";

// 데모 카드는 실제 Inbox에 대한 약속이다. 제품 문장 셋을 값으로 적었으므로(랜딩이 클라이언트 barrel을
// 끌어오지 않게) product-copy.md §16의 잠금 블록이 그 셋을 이 화면에 묶는다.
it("the landing demo card shows the product lines product-copy.md §16 locks", () => {
  const html = renderToStaticMarkup(createElement(LandingPage, { signedIn: false, signInAction: async () => {} }));
  const missing = missingUnits(copyLock("landing-demo"), html);
  assert.deepEqual(missing, [], lockFailure("landing-demo", missing));
});
