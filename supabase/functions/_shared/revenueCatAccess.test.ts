import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasRevenueCatAccess } from "./effectiveAccess.ts";

const base = { plan: "monthly" as const, expiresAt: "2026-12-01T00:00:00Z" };

describe("RevenueCat entitlement access", () => {
  it("grants access for a verified production purchase", () => {
    assert.equal(hasRevenueCatAccess({ ...base, active: true, environment: "production" }), true);
  });

  it("grants access for a verified sandbox purchase used in review", () => {
    assert.equal(hasRevenueCatAccess({ ...base, active: true, environment: "sandbox" }), true);
  });

  it("grants access for a complimentary grant with no store record", () => {
    assert.equal(hasRevenueCatAccess({ ...base, active: true, environment: null }), true);
  });

  it("denies access once the entitlement is no longer active", () => {
    assert.equal(hasRevenueCatAccess({ ...base, active: false, environment: "production" }), false);
    assert.equal(hasRevenueCatAccess({ ...base, active: false, environment: null }), false);
  });
});
