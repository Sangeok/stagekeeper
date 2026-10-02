import assert from "node:assert/strict";
import { it } from "node:test";
import { isTokenActive, parseTokenExpiry, parseTokenExpiryInput } from "./token-validity.mjs";

const expiry = new Date("2026-10-03T00:00:00.000Z");
it("accepts until the last millisecond and refuses exact expiry, revocation and missing expiry metadata", () => {
  const token = { revokedAt: null, expiresAt: expiry };
  assert.equal(isTokenActive(token, new Date(expiry.getTime() - 1)), true);
  assert.equal(isTokenActive(token, expiry), false);
  assert.equal(isTokenActive({ revokedAt: null, expiresAt: null }, expiry), true);
  assert.equal(isTokenActive({ revokedAt: expiry, expiresAt: null }, expiry), false);
  assert.equal(isTokenActive({ revokedAt: null }, expiry), false);
  assert.equal(isTokenActive(null, expiry), false);
});
it("interprets the fixed minute input as UTC and rejects date rollover or locale-specific values", () => {
  assert.equal(parseTokenExpiryInput(" 2026-10-04 12:30 ", expiry)?.toISOString(), "2026-10-04T12:30:00.000Z");
  assert.equal(parseTokenExpiryInput(" ", expiry), null);
  for (const value of ["2026-10-03 00:00", "2026-02-30 12:30", "2026-10-04 24:00", "10/04/2026 12:30 PM", "2026-10-04T12:30", "2026-10-04 12:30+09:00"]) {
    assert.throws(() => parseTokenExpiryInput(value, expiry));
  }
});
it("only accepts canonical future UTC timestamps or no expiry", () => {
  assert.equal(parseTokenExpiry(null, expiry), null); assert.equal(parseTokenExpiry(undefined, expiry), null);
  assert.equal(parseTokenExpiry("2026-10-04T00:00:00.000Z", expiry)?.toISOString(), "2026-10-04T00:00:00.000Z");
  for (const value of [expiry.toISOString(), "2026-10-02T00:00:00.000Z", "2026-02-31T00:00:00.000Z", "2026-10-04T00:00:00+09:00", {}, "invalid"]) {
    assert.throws(() => parseTokenExpiry(value, expiry));
  }
});
