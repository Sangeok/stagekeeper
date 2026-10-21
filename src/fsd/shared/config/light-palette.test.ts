import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { LIGHT_PALETTE } from "./light-palette";

const GLOBALS_URL = new URL("../../../app/globals.css", import.meta.url);

it("matches the light tokens in globals.css :root", () => {
  const css = readFileSync(GLOBALS_URL, "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  for (const [token, value] of Object.entries(LIGHT_PALETTE)) {
    const declared = root.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    assert.equal(declared?.toLowerCase(), value, `--${token} in globals.css :root`);
  }
});
