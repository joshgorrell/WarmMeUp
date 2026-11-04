import type { createClient } from "npm:@supabase/supabase-js@2";
import { computeOwnAccess, isPaidPlan, type OwnAccess } from "../_shared/accessRules.ts";
import {
  checkRevenueCatEntitlement,
  fetchOwnAccessFacts,
  hasRevenueCatAccess,
  recordRevenueCatEntitlement,
  type RCEntitlementResult,
} from "../_shared/effectiveAccess.ts";

type AdminClient = ReturnType<typeof createClient>;

export const ACCESS_GRACE_MS = 24 * 60 * 60 * 1000;

const PAID_PLANS = ["monthly", "yearly"];

export function graceEndsMs(member: { plan: string; expires_at: string | null }, nowMs: number): number | null {
  if (!isPaidPlan(member.plan) || !member.expires_at) return null;
  const endedMs = Date.parse(member.expires_at);
  if (endedMs > nowMs) return null;
  const endsMs = endedMs + ACCESS_GRACE_MS;
  return endsMs > nowMs ? endsMs : null;
}

export function revokedAtIso(rc: RCEntitlementResult, nowMs: number): string {
  return rc.expiresAt ?? new Date(nowMs).toISOString();
}

async function hasActiveAdminGrant(admin: AdminClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("admin_grants")
    .select("user_id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  if (error) throw new Error(`admin grant lookup failed: ${error.message}`);
  return (data ?? []).length > 0;
}

function revenueCatAccess(rc: RCEntitlementResult): OwnAccess {
  return {
    hasPremium: true,
    isOnTrial: false,
    source: "self",
    plan: rc.plan,
    expiresAt: rc.expiresAt,
    canInvite: true,
    trialGraceEndsAt: null,
    purchaseEnvironment: rc.environment ?? "none",
  };
}

async function refreshActiveRow(admin: AdminClient, userId: string, rc: RCEntitlementResult) {
  const { error } = await admin
    .from("subscriptions")
    .update({
      plan: rc.plan === "yearly" ? "yearly" : "monthly",
      expires_at: rc.expiresAt,
      purchase_environment: rc.environment,
    })
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw new Error(`subscription refresh failed: ${error.message}`);
}

// Rows that are still running take the revocation time as their end. Rows that already
// lapsed keep their stored end date, so repeated checks never move the grace window.
export async function recordConfirmedRevocation(
  admin: AdminClient,
  userId: string,
  rc: RCEntitlementResult,
  nowMs: number,
) {
  const nowIso = new Date(nowMs).toISOString();
  const { error: endError } = await admin
    .from("subscriptions")
    .update({ status: "expired", expires_at: revokedAtIso(rc, nowMs) })
    .eq("user_id", userId)
    .eq("status", "active")
    .in("plan", PAID_PLANS)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  if (endError) throw new Error(`revocation write failed: ${endError.message}`);

  const { error: lapseError } = await admin
    .from("subscriptions")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("status", "active")
    .in("plan", PAID_PLANS)
    .lte("expires_at", nowIso);
  if (lapseError) throw new Error(`lapse write failed: ${lapseError.message}`);
}

export interface VerifiedAccess {
  access: OwnAccess;
  revenueCatChecked: boolean;
}

// Paid rows are re-checked against RevenueCat on every call, so a stored row is never
// trusted over a confirmed revocation. Review, admin, and legacy-grant accounts keep
// their stored state and are never revoked here.
export async function resolveVerifiedAccess(
  admin: AdminClient,
  userId: string,
  rcSecretKey: string | undefined,
): Promise<VerifiedAccess> {
  const facts = await fetchOwnAccessFacts(admin, userId);
  const sub = facts.subscription;
  if (!sub || !isPaidPlan(sub.plan) || !rcSecretKey) {
    return { access: computeOwnAccess(facts), revenueCatChecked: false };
  }
  const exempt =
    facts.hasReviewAccess || facts.isAdmin || facts.isSuperAdmin || (await hasActiveAdminGrant(admin, userId));
  if (exempt) return { access: computeOwnAccess(facts), revenueCatChecked: false };

  let rc: RCEntitlementResult;
  try {
    rc = await checkRevenueCatEntitlement(userId, rcSecretKey);
  } catch (err) {
    console.error("RevenueCat check failed; keeping last known state", err);
    return { access: computeOwnAccess(facts), revenueCatChecked: true };
  }

  if (hasRevenueCatAccess(rc)) {
    if (sub.status === "active") await refreshActiveRow(admin, userId, rc);
    else await recordRevenueCatEntitlement(admin, userId, rc);
    return { access: revenueCatAccess(rc), revenueCatChecked: true };
  }

  await recordConfirmedRevocation(admin, userId, rc, Date.now());
  return { access: computeOwnAccess({ ...facts, subscription: null }), revenueCatChecked: true };
}

export async function reverifyPaidSubscriptions(admin: AdminClient, rcSecretKey: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("status", "active")
    .in("plan", PAID_PLANS)
    .limit(500);
  if (error) throw new Error(`reverify lookup failed: ${error.message}`);

  const summary = { checked: 0, stillActive: 0, notActive: 0, failed: 0 };
  for (const row of data ?? []) {
    summary.checked++;
    try {
      const { access } = await resolveVerifiedAccess(admin, row.user_id, rcSecretKey);
      if (access.hasPremium) summary.stillActive++;
      else summary.notActive++;
    } catch (err) {
      summary.failed++;
      console.error("reverify failed for a subscription", err);
    }
  }
  return summary;
}
