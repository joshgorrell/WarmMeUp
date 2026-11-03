import { assertEquals } from "jsr:@std/assert@1";
import { computeOwnAccess, isSubActive, TRIAL_GRACE_MS, type OwnAccessFacts } from "./accessRules.ts";

const NOW = Date.parse("2026-01-10T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const none: OwnAccessFacts = {
  hasReviewAccess: false,
  isAdmin: false,
  isSuperAdmin: false,
  subscription: null,
};

Deno.test("review access grants premium regardless of subscription", () => {
  const access = computeOwnAccess({ ...none, hasReviewAccess: true }, NOW);
  assertEquals(access.hasPremium, true);
  assertEquals(access.source, "review_access");
});

Deno.test("super admin and admin grant premium", () => {
  assertEquals(computeOwnAccess({ ...none, isSuperAdmin: true }, NOW).source, "super_admin");
  assertEquals(computeOwnAccess({ ...none, isAdmin: true }, NOW).source, "admin");
});

Deno.test("production paid active grants premium", () => {
  const access = computeOwnAccess(
    {
      ...none,
      subscription: {
        plan: "monthly",
        status: "active",
        expires_at: iso(NOW + 86_400_000),
        purchase_environment: "production",
      },
    },
    NOW,
  );
  assertEquals(access.hasPremium, true);
  assertEquals(access.source, "self");
});

Deno.test("sandbox paid row does not grant premium on its own", () => {
  const access = computeOwnAccess(
    {
      ...none,
      subscription: {
        plan: "yearly",
        status: "active",
        expires_at: iso(NOW + 86_400_000),
        purchase_environment: "sandbox",
      },
    },
    NOW,
  );
  assertEquals(access.hasPremium, false);
});

Deno.test("paid row with null environment does not grant premium", () => {
  const access = computeOwnAccess(
    {
      ...none,
      subscription: { plan: "monthly", status: "active", expires_at: iso(NOW + 86_400_000) },
    },
    NOW,
  );
  assertEquals(access.hasPremium, false);
});

Deno.test("trial within its term grants access", () => {
  const access = computeOwnAccess(
    { ...none, subscription: { plan: "trial", status: "active", expires_at: iso(NOW + 3_600_000) } },
    NOW,
  );
  assertEquals(access.hasPremium, true);
  assertEquals(access.isOnTrial, true);
});

Deno.test("trial inside 24h grace still grants access", () => {
  const expiredAt = NOW - (TRIAL_GRACE_MS - 60_000);
  const access = computeOwnAccess(
    { ...none, subscription: { plan: "trial", status: "active", expires_at: iso(expiredAt) } },
    NOW,
  );
  assertEquals(access.hasPremium, true);
});

Deno.test("trial past 24h grace denies access", () => {
  const expiredAt = NOW - (TRIAL_GRACE_MS + 60_000);
  const access = computeOwnAccess(
    { ...none, subscription: { plan: "trial", status: "active", expires_at: iso(expiredAt) } },
    NOW,
  );
  assertEquals(access.hasPremium, false);
});

Deno.test("expired paid subscription denies access", () => {
  const access = computeOwnAccess(
    {
      ...none,
      subscription: {
        plan: "monthly",
        status: "active",
        expires_at: iso(NOW - 1_000),
        purchase_environment: "production",
      },
    },
    NOW,
  );
  assertEquals(access.hasPremium, false);
});

Deno.test("non-active status denies access", () => {
  assertEquals(isSubActive({ plan: "trial", status: "cancelled", expires_at: iso(NOW + 1) }, NOW), false);
  assertEquals(isSubActive(null, NOW), false);
});

Deno.test("no facts deny access", () => {
  assertEquals(computeOwnAccess(none, NOW).hasPremium, false);
});
