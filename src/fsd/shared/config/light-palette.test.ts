import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { LIGHT_PALETTE } from "./light-palette";

const GLOBALS_URL = new URL("../../../app/globals.css", import.meta.url);

// 이미지가 화면과 다른 파랑을 쓰면 아이콘·공유 카드만 다른 제품처럼 보인다.
it("matches the light tokens in globals.css :root", () => {
  const css = readFileSync(GLOBALS_URL, "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  for (const [token, value] of Object.entries(LIGHT_PALETTE)) {
    const declared = root.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    assert.equal(declared?.toLowerCase(), value, `--${token} in globals.css :root`);
  }
});
