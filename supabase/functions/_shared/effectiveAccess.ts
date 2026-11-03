import type { createClient } from "npm:@supabase/supabase-js@2";
import { computeOwnAccess, type OwnAccess, type OwnAccessFacts, type PurchaseEnvironment } from "./accessRules.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface RCEntitlementResult {
  active: boolean;
  plan: "monthly" | "yearly";
  expiresAt: string | null;
  environment: PurchaseEnvironment | null;
}

export function isVerifiedPurchaseEnvironment(env: PurchaseEnvironment | null): env is PurchaseEnvironment {
  return env === "production" || env === "sandbox";
}

export async function fetchOwnAccessFacts(adminClient: AdminClient, userId: string): Promise<OwnAccessFacts> {
  const [review, profile, subscription] = await Promise.all([
    adminClient.from("permanent_review_access").select("user_id").eq("user_id", userId).maybeSingle(),
    adminClient.from("profiles").select("is_admin, is_super_admin").eq("id", userId).maybeSingle(),
    adminClient
      .from("subscriptions")
      .select("plan, status, expires_at, purchase_environment")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  for (const result of [review, profile, subscription]) {
    if (result.error) throw new Error(`access lookup failed: ${result.error.message}`);
  }

  return {
    hasReviewAccess: review.data !== null,
    isAdmin: profile.data?.is_admin === true,
    isSuperAdmin: profile.data?.is_super_admin === true,
    subscription: subscription.data,
  };
}

export async function resolveOwnAccess(adminClient: AdminClient, userId: string): Promise<OwnAccess> {
  return computeOwnAccess(await fetchOwnAccessFacts(adminClient, userId));
}

// Throws on RevenueCat outages so callers can distinguish "no entitlement" from "unknown".
// A user RevenueCat has never seen (404) has no entitlement.
export async function checkRevenueCatEntitlement(
  rcUserId: string,
  secretKey: string
): Promise<RCEntitlementResult> {
  const inactive: RCEntitlementResult = { active: false, plan: "monthly", expiresAt: null, environment: null };
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 404) return inactive;
  if (!res.ok) throw new Error(`RevenueCat lookup failed: HTTP ${res.status}`);

  const data = await res.json();
  const entitlement = data?.subscriber?.entitlements?.premium;

  if (!entitlement?.expires_date) return inactive;

  const expiresAt = entitlement.expires_date;
  const isActive = new Date(expiresAt) > new Date();
  const productId: string = entitlement.product_identifier ?? "";

  const plan: "monthly" | "yearly" =
    productId.includes("annual") || productId.includes("yearly") || productId.includes("year")
      ? "yearly"
      : "monthly";

  const subscriptions = data?.subscriber?.subscriptions ?? {};
  const subEntry = subscriptions[productId];

  let environment: PurchaseEnvironment | null = null;
  if (subEntry && typeof subEntry.is_sandbox === "boolean") {
    environment = subEntry.is_sandbox ? "sandbox" : "production";
  }

  return { active: isActive, plan, expiresAt, environment };
}

// Read-only check of one user's own access, mirroring get-effective-subscription's
// own-access rules (review, admin, production paid, trial with grace, verified RevenueCat).
export async function hasEffectiveSelfAccess(
  adminClient: AdminClient,
  userId: string,
  rcSecretKey: string | undefined
): Promise<boolean> {
  const own = await resolveOwnAccess(adminClient, userId);
  if (own.hasPremium) return true;
  if (!rcSecretKey) return false;
  const rc = await checkRevenueCatEntitlement(userId, rcSecretKey);
  return rc.active && isVerifiedPurchaseEnvironment(rc.environment);
}
