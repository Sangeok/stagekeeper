import { it } from "node:test";

import assert from "node:assert/strict";

import { limitedResult, limitedUntil, RUNNER_RESULT_MAX } from "./runner-contract.mjs";

it("writes the resume time as a UTC minute and reads the same time back", () => {
    const resume = new Date(Date.UTC(2026, 10, 10, 9, 21));
    const line = limitedResult(resume);
    assert.equal(line, "limited: Claude usage limit until 2026-11-10T09:21Z");
    assert.ok(line.length <= RUNNER_RESULT_MAX);
    assert.equal(limitedUntil(line)?.getTime(), resume.getTime());
    assert.equal(limitedResult(new Date(Date.UTC(2026, 10, 10, 9, 21, 59))), line);
  });

it("reads no time from other result lines or a malformed time, and refuses an invalid resume time", () => {
    for (const value of [null, undefined, "", "done: 3 turns, 0 denied", "error: success (api_error)", "dirty",
      "limited: Claude usage limit until 2026-13-01T09:21Z", "limited: Claude usage limit until 2026-02-30T09:21Z",
      "limited: Claude usage limit until 2026-11-10T24:00Z", "limited: Claude usage limit until 2026-11-10T09:21",
      " limited: Claude usage limit until 2026-11-10T09:21Z", "limited: Claude usage limit until 2026-11-10T09:21Z later"]) {
      assert.equal(limitedUntil(value), null, String(value));
    }
    assert.throws(() => limitedResult(new Date(NaN)), /resumeAt/);
  });
