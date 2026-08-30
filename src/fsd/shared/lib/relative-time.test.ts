import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agoLabel, daysBetween, shortDate } from "./relative-time";

const d = (iso: string) => new Date(iso);

describe("daysBetween", () => {
  it("counts UTC calendar days, not 24h blocks", () => {
    assert.equal(daysBetween(d("2026-08-28T23:59:00Z"), d("2026-08-29T00:01:00Z")), 1);
    assert.equal(daysBetween(d("2026-08-28T00:00:00Z"), d("2026-08-28T23:59:00Z")), 0);
  });
  it("clamps the future to 0", () => {
    assert.equal(daysBetween(d("2026-09-01T00:00:00Z"), d("2026-08-28T00:00:00Z")), 0);
  });
});

describe("agoLabel", () => {
  it("reads today · 1 day ago · N days ago", () => {
    const now = d("2026-08-30T12:00:00Z");
    assert.equal(agoLabel(d("2026-08-30T01:00:00Z"), now), "today");
    assert.equal(agoLabel(d("2026-08-29T01:00:00Z"), now), "1 day ago");
    assert.equal(agoLabel(d("2026-08-27T01:00:00Z"), now), "3 days ago");
  });
});

describe("shortDate", () => {
  it("formats as Mon D in UTC", () => {
    assert.equal(shortDate(d("2026-08-28T23:30:00Z")), "Aug 28");
    assert.equal(shortDate(d("2026-01-05T00:00:00Z")), "Jan 5");
  });
});
