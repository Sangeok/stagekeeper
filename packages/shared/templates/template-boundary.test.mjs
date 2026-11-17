import assert from "node:assert/strict";
import { it } from "node:test";
import { STEP_HEADING, stubOf } from "./template-boundary.mjs";

it("recognizes only the existing heading grammar without a space after the colon", () => {
  assert.equal(STEP_HEADING.test("## step:start requires: planning"), true);
  for (const line of ["## step: start", "## step:", "### step:start"]) assert.equal(STEP_HEADING.test(line), false);
});
for (const newline of ["\n", "\r\n"]) it(`keeps malformed headings in the stub and cuts at the first valid heading: ${JSON.stringify(newline)}`, () => {
  const body = ["Stub", "## step: start", "Still public", "", "## step:start", "PRIVATE STEP", "next: done", ""].join(newline);
  assert.equal(stubOf(body), "Stub\n## step: start\nStill public\n");
});
it("returns step-less runbooks and documents byte-for-byte", () => {
  for (const body of ["", "# Runbook\r\n\r\n", "## step: start\r\nPublic\r\n"]) assert.equal(stubOf(body), body);
});
