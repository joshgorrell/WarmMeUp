export type PurchaseEnvironment = "sandbox" | "production";

export interface SubscriptionRow {
  plan: string;
  status: string;
  expires_at: string | null;
  purchase_environment?: PurchaseEnvironment | null;
}

export interface OwnAccessFacts {
  hasReviewAccess: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  subscription: SubscriptionRow | null;
}

export interface OwnAccess {
  hasPremium: boolean;
  isOnTrial: boolean;
  source: string;
  plan: string | null;
  expiresAt: string | null;
  canInvite: boolean;
  trialGraceEndsAt: string | null;
  purchaseEnvironment: PurchaseEnvironment | "none";
}

export const TRIAL_GRACE_MS = 24 * 60 * 60 * 1000;
export const REVIEW_ACCESS_SOURCE = "review_access";

export function isPaidPlan(plan: string): boolean {
  return plan === "monthly" || plan === "yearly";
}

export function isTrialPlan(plan: string): boolean {
  return plan === "trial";
}

export function isSubActive(row: SubscriptionRow | null, nowMs: number): boolean {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (row.expires_at && new Date(row.expires_at).getTime() < nowMs) {
    if (isTrialPlan(row.plan)) {
      const expiredMs = nowMs - new Date(row.expires_at).getTime();
      if (expiredMs < TRIAL_GRACE_MS) return true;
    }
    return false;
  }
  return true;
}

const NO_ACCESS: OwnAccess = {
  hasPremium: false,
  isOnTrial: false,
  source: "none",
  plan: null,
  expiresAt: null,
  canInvite: false,
  trialGraceEndsAt: null,
  purchaseEnvironment: "none",
};

// Paid plans count only when the stored purchase was production. Sandbox
// rows need a live RevenueCat check, which the caller performs.
export function computeOwnAccess(facts: OwnAccessFacts, nowMs: number = Date.now()): OwnAccess {
  if (facts.hasReviewAccess) {
    return { ...NO_ACCESS, hasPremium: true, source: REVIEW_ACCESS_SOURCE, canInvite: true };
  }
  if (facts.isSuperAdmin) {
    return { ...NO_ACCESS, hasPremium: true, source: "super_admin", canInvite: true };
  }
  if (facts.isAdmin) {
    return { ...NO_ACCESS, hasPremium: true, source: "admin", canInvite: true };
  }

  const sub = facts.subscription;
  if (isSubActive(sub, nowMs) && isPaidPlan(sub!.plan) && sub!.purchase_environment === "production") {
    return {
      ...NO_ACCESS,
      hasPremium: true,
      source: "self",
      plan: sub!.plan,
      expiresAt: sub!.expires_at,
      canInvite: true,
      purchaseEnvironment: "production",
    };
  }

  if (isSubActive(sub, nowMs) && isTrialPlan(sub!.plan)) {
    const graceEndsAt = sub!.expires_at
      ? new Date(new Date(sub!.expires_at).getTime() + TRIAL_GRACE_MS).toISOString()
      : null;
    return {
      ...NO_ACCESS,
      hasPremium: true,
      isOnTrial: true,
      source: "trial",
      plan: "trial",
      expiresAt: sub!.expires_at,
      canInvite: true,
      trialGraceEndsAt: graceEndsAt,
    };
  }

  return NO_ACCESS;
}
