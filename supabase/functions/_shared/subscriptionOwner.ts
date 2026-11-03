import type { createClient } from "npm:@supabase/supabase-js@2";
import { hasEffectiveSelfAccess } from "./effectiveAccess.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface CoupleOwnerRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  subscription_owner_id: string | null;
}

// The owner keeps the stamp while they still have access, so a second purchase never moves it.
// Otherwise it moves to the preferred purchaser, then the other partner, when they have access.
// Access is re-checked live, so a RevenueCat outage throws and leaves the stamp untouched.
export async function reconcileSubscriptionOwner(
  adminClient: AdminClient,
  couple: CoupleOwnerRow,
  rcSecretKey: string | undefined,
  preferredId: string | null = null,
): Promise<string | null> {
  if (!couple.user_b_id) return couple.subscription_owner_id;

  const members = [couple.user_a_id, couple.user_b_id];
  const candidates = [couple.subscription_owner_id, preferredId, ...members].filter(
    (id): id is string => id !== null && members.includes(id),
  );

  for (const candidate of new Set(candidates)) {
    if (!(await hasEffectiveSelfAccess(adminClient, candidate, rcSecretKey))) continue;
    if (candidate !== couple.subscription_owner_id) {
      const { error } = await adminClient
        .from("couples")
        .update({ subscription_owner_id: candidate })
        .eq("id", couple.id);
      if (error) throw new Error(`owner update failed: ${error.message}`);
    }
    return candidate;
  }

  return couple.subscription_owner_id;
}
