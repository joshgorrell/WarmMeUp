import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNoticeEligible, TRIAL_GRACE_MS } from "./trialNotice.ts";

const EXP_1 = Date.parse("2026-11-05T12:00:00Z");
const EXP_2 = Date.parse("2026-11-09T12:00:00Z");

describe("trial notice eligibility", () => {
  it("eligible when no notice exists", () => {
    assert.equal(isNoticeEligible(null, EXP_1), true);
    assert.equal(isNoticeEligible({ for: null, status: null }, EXP_1), true);
  });

  it("not eligible once a notice was sent for this expiration", () => {
    assert.equal(isNoticeEligible({ for: "2026-11-05T12:00:00+00:00", status: "sent" }, EXP_1), false);
  });

  it("not eligible while pending or after an uncertain delivery", () => {
    assert.equal(isNoticeEligible({ for: "2026-11-05T12:00:00Z", status: "pending" }, EXP_1), false);
    assert.equal(isNoticeEligible({ for: "2026-11-05T12:00:00Z", status: "uncertain" }, EXP_1), false);
  });

  it("not eligible for an unreachable device for this expiration", () => {
    assert.equal(isNoticeEligible({ for: "2026-11-05T12:00:00Z", status: "unreachable" }, EXP_1), false);
  });

  it("eligible for retry after a definite failure", () => {
    assert.equal(isNoticeEligible({ for: "2026-11-05T12:00:00Z", status: "failed" }, EXP_1), true);
  });

  it("a later legitimate trial expiration is eligible even after an earlier notice", () => {
    assert.equal(isNoticeEligible({ for: "2026-11-05T12:00:00Z", status: "sent" }, EXP_2), true);
  });

  it("partners are tracked independently", () => {
    const partnerA: { for: string | null; status: "sent" } = { for: "2026-11-05T12:00:00Z", status: "sent" };
    const partnerB: null = null;
    assert.equal(isNoticeEligible(partnerA, EXP_1), false);
    assert.equal(isNoticeEligible(partnerB, EXP_1), true);
  });

  it("grace period is 24 hours", () => {
    assert.equal(TRIAL_GRACE_MS, 86_400_000);
  });
});
