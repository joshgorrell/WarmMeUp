import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SubscriptionRow {
  user_id: string;
  plan: string;
  status: string;
  expires_at: string | null;
  trial_started_at: string | null;
}

interface AdminGrantRow {
  user_id: string;
  entitlement_type: string;
  expires_at: string | null;
  active: boolean;
  can_invite: boolean;
}

interface AccessResult {
  hasPremium: boolean;
  isOnTrial: boolean;
  source: string;
  plan: string | null;
  expiresAt: string | null;
  canInvite: boolean;
}

function isSubActive(row: SubscriptionRow | null): boolean {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return false;
  return true;
}

function isPaidPlan(plan: string): boolean {
  return plan === "monthly" || plan === "yearly";
}

function isTrialPlan(plan: string): boolean {
  return plan === "trial";
}

function isGrantActive(grant: AdminGrantRow | null): boolean {
  if (!grant) return false;
  if (!grant.active) return false;
  if (grant.expires_at && new Date(grant.expires_at) < new Date()) return false;
  return true;
}

async function checkRevenueCatEntitlement(
  rcUserId: string,
  secretKey: string
): Promise<{ active: boolean; plan: "monthly" | "yearly"; expiresAt: string | null }> {
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) return { active: false, plan: "monthly", expiresAt: null };

  const data = await res.json();
  const entitlement = data?.subscriber?.entitlements?.premium;

  if (!entitlement?.expires_date) {
    return { active: false, plan: "monthly", expiresAt: null };
  }

  const expiresAt = entitlement.expires_date;
  const isActive = new Date(expiresAt) > new Date();
  const productId: string = entitlement.product_identifier ?? "";

  const plan: "monthly" | "yearly" =
    productId.includes("annual") || productId.includes("yearly") || productId.includes("year")
      ? "yearly"
      : "monthly";

  return { active: isActive, plan, expiresAt };
}

async function userHasPremiumAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<AccessResult> {
  // 1. admin / super_admin profile flags
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_admin, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_super_admin === true) {
    return { hasPremium: true, isOnTrial: false, source: "super_admin", plan: null, expiresAt: null, canInvite: true };
  }
  if (profile?.is_admin === true) {
    return { hasPremium: true, isOnTrial: false, source: "admin", plan: null, expiresAt: null, canInvite: true };
  }

  // 2. Own subscription row — paid plan or active 7-day trial
  const { data: sub } = await adminClient
    .from("subscriptions")
    .select("user_id, plan, status, expires_at, trial_started_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (isSubActive(sub) && isPaidPlan(sub!.plan)) {
    return { hasPremium: true, isOnTrial: false, source: "self", plan: sub!.plan, expiresAt: sub!.expires_at, canInvite: true };
  }

  if (isSubActive(sub) && isTrialPlan(sub!.plan)) {
    return { hasPremium: true, isOnTrial: true, source: "trial", plan: "trial", expiresAt: sub!.expires_at, canInvite: true };
  }

  // 3. Admin grant
  const { data: grant } = await adminClient
    .from("admin_grants")
    .select("user_id, entitlement_type, expires_at, active, can_invite")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (isGrantActive(grant)) {
    return {
      hasPremium: true,
      isOnTrial: false,
      source: "admin_grant",
      plan: null,
      expiresAt: grant!.expires_at,
      canInvite: grant!.can_invite,
    };
  }

  return { hasPremium: false, isOnTrial: false, source: "none", plan: null, expiresAt: null, canInvite: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const ownAccess = await userHasPremiumAccess(adminClient, user.id);

    if (ownAccess.hasPremium) {
      return new Response(
        JSON.stringify({
          isPremium: true,
          source: ownAccess.source,
          plan: ownAccess.plan,
          expiresAt: ownAccess.expiresAt,
          isOnTrial: ownAccess.isOnTrial,
          trialExpiresAt: ownAccess.isOnTrial ? ownAccess.expiresAt : null,
          trialExpired: false,
          grantExpired: false,
          grantExpiresAt: ownAccess.source === "admin_grant" ? ownAccess.expiresAt : null,
          canInvite: ownAccess.canInvite,
          _v: "2026-07-01",
          _ts: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check own subscription row for trialExpired signal.
    const { data: ownSub } = await adminClient
      .from("subscriptions")
      .select("user_id, plan, status, expires_at, trial_started_at")
      .eq("user_id", user.id)
      .maybeSingle();

    // Check partner access. Partner users can never generate invite codes.
    const { data: couple } = await adminClient
      .from("couples")
      .select("user_a_id, user_b_id")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .eq("active", true)
      .maybeSingle();

    if (couple) {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      if (partnerId) {
        const partnerAccess = await userHasPremiumAccess(adminClient, partnerId);
        if (partnerAccess.hasPremium) {
          return new Response(
            JSON.stringify({
              isPremium: true,
              source: "partner",
              plan: partnerAccess.plan,
              expiresAt: partnerAccess.expiresAt,
              isOnTrial: false,
              trialExpiresAt: null,
              trialExpired: false,
              canInvite: false,
              _v: "2026-07-01",
              _ts: new Date().toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Partner has no DB subscription — check RevenueCat directly. If the
        // partner purchased but confirm-subscription never completed, we still
        // grant access and backfill their subscription row for future checks.
        const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
        if (rcSecretKey) {
          try {
            const partnerRc = await checkRevenueCatEntitlement(partnerId, rcSecretKey);
            if (partnerRc.active) {
              console.log(`[get-effective-subscription] RC partner fallback hit for partner=${partnerId} plan=${partnerRc.plan}`);
              await adminClient
                .from("subscriptions")
                .upsert(
                  {
                    user_id: partnerId,
                    plan: partnerRc.plan,
                    status: "active",
                    started_at: new Date().toISOString(),
                    expires_at: partnerRc.expiresAt,
                    trial_started_at: null,
                  },
                  { onConflict: "user_id" }
                );
              return new Response(
                JSON.stringify({
                  isPremium: true,
                  source: "partner",
                  plan: partnerRc.plan,
                  expiresAt: partnerRc.expiresAt,
                  isOnTrial: false,
                  trialExpiresAt: null,
                  trialExpired: false,
                  canInvite: false,
                  _v: "2026-07-01",
                  _ts: new Date().toISOString(),
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          } catch (err) {
            console.error(`[get-effective-subscription] RC partner fallback error for partner=${partnerId}:`, String(err));
          }
        }
      }
    }

    // 4. RevenueCat API fallback — if the DB has no active subscription but
    //    RevenueCat shows an active entitlement (e.g. purchase completed but
    //    confirm-subscription never ran), sync the DB and return premium.
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
    if (rcSecretKey) {
      try {
        const rc = await checkRevenueCatEntitlement(user.id, rcSecretKey);
        if (rc.active) {
          console.log(`[get-effective-subscription] RC fallback hit for user=${user.id} plan=${rc.plan}`);
          await adminClient
            .from("subscriptions")
            .upsert(
              {
                user_id: user.id,
                plan: rc.plan,
                status: "active",
                started_at: new Date().toISOString(),
                expires_at: rc.expiresAt,
                trial_started_at: null,
              },
              { onConflict: "user_id" }
            );
          return new Response(
            JSON.stringify({
              isPremium: true,
              source: "self",
              plan: rc.plan,
              expiresAt: rc.expiresAt,
              isOnTrial: false,
              trialExpiresAt: null,
              trialExpired: false,
              canInvite: true,
              _v: "2026-07-01",
              _ts: new Date().toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (err) {
        console.error(`[get-effective-subscription] RC fallback error for user=${user.id}:`, String(err));
      }
    }

    // No active premium from any source. Only flag trialExpired for trial plan rows.
    const trialExpired = ownSub !== null && isTrialPlan(ownSub.plan) && !isSubActive(ownSub);

    // Check for an expired admin grant so the app can show the right messaging.
    const { data: expiredGrant } = await adminClient
      .from("admin_grants")
      .select("expires_at")
      .eq("user_id", user.id)
      .eq("active", true)
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString())
      .maybeSingle();
    const grantExpired = expiredGrant !== null;

    return new Response(
      JSON.stringify({
        isPremium: false,
        source: "none",
        plan: null,
        expiresAt: null,
        isOnTrial: false,
        trialExpiresAt: ownSub?.expires_at ?? null,
        trialExpired,
        grantExpired,
        grantExpiresAt: null,
        canInvite: false,
        _v: "2026-07-01",
        _ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
