import { assertEquals } from "jsr:@std/assert@1";
import { ACCESS_GRACE_MS, graceEndsMs, revokedAtIso } from "./verification.ts";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-10T12:00:00Z");

Deno.test("natural expiry starts 24 hours after the end date", () => {
  const expiresAt = new Date(NOW - 2 * HOUR).toISOString();
  assertEquals(graceEndsMs({ plan: "monthly", expires_at: expiresAt }, NOW), NOW + 22 * HOUR);
});

Deno.test("no grace once 24 hours after natural expiry have passed", () => {
  const expiresAt = new Date(NOW - 25 * HOUR).toISOString();
  assertEquals(graceEndsMs({ plan: "yearly", expires_at: expiresAt }, NOW), null);
});

Deno.test("no grace while the paid period is still running", () => {
  const expiresAt = new Date(NOW + 3 * HOUR).toISOString();
  assertEquals(graceEndsMs({ plan: "monthly", expires_at: expiresAt }, NOW), null);
});

Deno.test("non-expiring paid rows never enter grace", () => {
  assertEquals(graceEndsMs({ plan: "monthly", expires_at: null }, NOW), null);
});

Deno.test("trial rows never enter couple grace", () => {
  const expiresAt = new Date(NOW - HOUR).toISOString();
  assertEquals(graceEndsMs({ plan: "trial", expires_at: expiresAt }, NOW), null);
});

Deno.test("early revocation starts grace at the revocation time", () => {
  const rc = { expiresAt: null, plan: "monthly", environment: "sandbox", active: false } as never;
  const revokedAt = revokedAtIso(rc, NOW);
  assertEquals(revokedAt, new Date(NOW).toISOString());
  assertEquals(graceEndsMs({ plan: "monthly", expires_at: revokedAt }, NOW), NOW + ACCESS_GRACE_MS);
});

Deno.test("revocation uses the RevenueCat end date when one is reported", () => {
  const endedAt = new Date(NOW - HOUR).toISOString();
  const rc = { expiresAt: endedAt, plan: "yearly", environment: "production", active: false } as never;
  assertEquals(revokedAtIso(rc, NOW), endedAt);
});

Deno.test("grace end is fixed by the stored end date, so later checks cannot extend it", () => {
  const stored = { plan: "monthly", expires_at: new Date(NOW - 5 * HOUR).toISOString() };
  const first = graceEndsMs(stored, NOW);
  const later = graceEndsMs(stored, NOW + 10 * HOUR);
  assertEquals(first, NOW + 19 * HOUR);
  assertEquals(later, NOW + 19 * HOUR);
});
