import type { createClient } from "npm:@supabase/supabase-js@2";
import { computeOwnAccess, type OwnAccess, type OwnAccessFacts, type PurchaseEnvironment } from "./accessRules.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface RCEntitlementResult {
  active: boolean;
  plan: "monthly" | "yearly" | "complimentary" | null;
  expiresAt: string | null;
  environment: PurchaseEnvironment | null;
}

function isVerifiedPurchaseEnvironment(env: PurchaseEnvironment | null): env is PurchaseEnvironment {
  return env === "production" || env === "sandbox";
}

// A null environment means RevenueCat holds no store record for the entitlement. That is how
// complimentary grants appear, so they grant access like any verified purchase.
export function hasRevenueCatAccess(rc: RCEntitlementResult): boolean {
  return rc.active && (rc.environment === null || isVerifiedPurchaseEnvironment(rc.environment));
}

// The subscriptions table cannot store a complimentary plan, so those rows are stored
// with a paid plan and no purchase environment. Paid-expiry notices skip such rows.
export function recordRevenueCatEntitlement(adminClient: AdminClient, userId: string, rc: RCEntitlementResult) {
  return adminClient
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan: rc.plan === "complimentary" ? "monthly" : rc.plan,
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: rc.expiresAt,
        trial_started_at: null,
        purchase_environment: rc.environment,
      },
      { onConflict: "user_id" }
    );
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
  const inactive: RCEntitlementResult = { active: false, plan: null, expiresAt: null, environment: null };
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

  if (!entitlement) return inactive;

  // RevenueCat omits expires_date for lifetime entitlements, which never lapse.
  const expiresAt: string | null = entitlement.expires_date ?? null;
  const isActive = expiresAt === null || new Date(expiresAt) > new Date();
  const productId: string = entitlement.product_identifier ?? "";

  const subscriptions = data?.subscriber?.subscriptions ?? {};
  const subEntry = subscriptions[productId];

  let environment: PurchaseEnvironment | null = null;
  if (subEntry && typeof subEntry.is_sandbox === "boolean") {
    environment = subEntry.is_sandbox ? "sandbox" : "production";
  }

  const plan: "monthly" | "yearly" | "complimentary" =
    environment === null
      ? "complimentary"
      : productId.includes("annual") || productId.includes("yearly") || productId.includes("year")
        ? "yearly"
        : "monthly";

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
  return hasRevenueCatAccess(await checkRevenueCatEntitlement(userId, rcSecretKey));
}
