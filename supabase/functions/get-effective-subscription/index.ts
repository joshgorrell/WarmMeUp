import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type PurchaseEnvironment = "sandbox" | "production";

interface SubscriptionRow {
  user_id: string;
  plan: string;
  status: string;
  expires_at: string | null;
  trial_started_at: string | null;
  purchase_environment: PurchaseEnvironment | null;
}

interface AccessResult {
  hasPremium: boolean;
  isOnTrial: boolean;
  source: string;
  plan: string | null;
  expiresAt: string | null;
  canInvite: boolean;
  trialGraceEndsAt: string | null;
  purchaseEnvironment: PurchaseEnvironment | "none";
}

const REVIEW_ACCESS_SOURCE = "review_access";

const TRIAL_GRACE_MS = 24 * 60 * 60 * 1000;

function isSubActive(row: SubscriptionRow | null): boolean {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    if (isTrialPlan(row.plan)) {
      const expiredMs = Date.now() - new Date(row.expires_at).getTime();
      if (expiredMs < TRIAL_GRACE_MS) return true;
    }
    return false;
  }
  return true;
}

function isPaidPlan(plan: string): boolean {
  return plan === "monthly" || plan === "yearly";
}

function isTrialPlan(plan: string): boolean {
  return plan === "trial";
}

function isProductionEnv(env: PurchaseEnvironment | null): boolean {
  return env === "production";
}

interface RCEntitlementResult {
  active: boolean;
  plan: "monthly" | "yearly";
  expiresAt: string | null;
  environment: PurchaseEnvironment | null;
}

async function checkRevenueCatEntitlement(
  rcUserId: string,
  secretKey: string
): Promise<RCEntitlementResult> {
  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) return { active: false, plan: "monthly", expiresAt: null, environment: null };

  const data = await res.json();
  const entitlement = data?.subscriber?.entitlements?.premium;

  if (!entitlement?.expires_date) {
    return { active: false, plan: "monthly", expiresAt: null, environment: null };
  }

  const expiresAt = entitlement.expires_date;
  const isActive = new Date(expiresAt) > new Date();
  const productId: string = entitlement.product_identifier ?? "";

  const plan: "monthly" | "yearly" =
    productId.includes("annual") || productId.includes("yearly") || productId.includes("year")
      ? "yearly"
      : "monthly";

  // Determine sandbox vs production from the underlying subscription object.
  const subscriptions = data?.subscriber?.subscriptions ?? {};
  const subEntry = subscriptions[productId];

  let environment: PurchaseEnvironment | null = null;
  if (subEntry && typeof subEntry.is_sandbox === "boolean") {
    environment = subEntry.is_sandbox ? "sandbox" : "production";
  }

  return { active: isActive, plan, expiresAt, environment };
}

async function userHasPremiumAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<AccessResult> {
  // 1. Explicit permanent review access
  const { data: reviewAccess } = await adminClient
    .from("permanent_review_access")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (reviewAccess) {
    return { hasPremium: true, isOnTrial: false, source: REVIEW_ACCESS_SOURCE, plan: null, expiresAt: null, canInvite: true, trialGraceEndsAt: null, purchaseEnvironment: "none" };
  }

  // 2. admin / super_admin profile flags
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_admin, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_super_admin === true) {
    return { hasPremium: true, isOnTrial: false, source: "super_admin", plan: null, expiresAt: null, canInvite: true, trialGraceEndsAt: null, purchaseEnvironment: "none" };
  }
  if (profile?.is_admin === true) {
    return { hasPremium: true, isOnTrial: false, source: "admin", plan: null, expiresAt: null, canInvite: true, trialGraceEndsAt: null, purchaseEnvironment: "none" };
  }

  // 3. Own subscription row — paid plan or active 7-day trial
  const { data: sub } = await adminClient
    .from("subscriptions")
    .select("user_id, plan, status, expires_at, trial_started_at, purchase_environment")
    .eq("user_id", userId)
    .maybeSingle();

  if (isSubActive(sub) && isPaidPlan(sub!.plan)) {
    // Only grant production premium if the subscription row came from a
    // production App Store purchase. Sandbox rows (from TestFlight) must
    // not masquerade as real paid subscriptions.
    if (isProductionEnv(sub!.purchase_environment)) {
      return { hasPremium: true, isOnTrial: false, source: "self", plan: sub!.plan, expiresAt: sub!.expires_at, canInvite: true, trialGraceEndsAt: null, purchaseEnvironment: "production" };
    }
    // Sandbox subscription row — do not grant production premium from DB.
    // The RC fallback below will check if there's a real production entitlement.
  }

  if (isSubActive(sub) && isTrialPlan(sub!.plan)) {
    const graceEndsAt = sub!.expires_at
      ? new Date(new Date(sub!.expires_at).getTime() + TRIAL_GRACE_MS).toISOString()
      : null;
    return { hasPremium: true, isOnTrial: true, source: "trial", plan: "trial", expiresAt: sub!.expires_at, canInvite: true, trialGraceEndsAt: graceEndsAt, purchaseEnvironment: "none" };
  }

  return { hasPremium: false, isOnTrial: false, source: "none", plan: null, expiresAt: null, canInvite: false, trialGraceEndsAt: null, purchaseEnvironment: "none" };
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
          canInvite: ownAccess.canInvite,
          trialGraceEndsAt: ownAccess.trialGraceEndsAt,
          purchaseEnvironment: ownAccess.purchaseEnvironment,
          _v: "2026-09-03",
          _ts: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check own subscription row for trialExpired signal.
    const { data: ownSub } = await adminClient
      .from("subscriptions")
      .select("user_id, plan, status, expires_at, trial_started_at, purchase_environment")
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
              trialGraceEndsAt: null,
              purchaseEnvironment: partnerAccess.purchaseEnvironment,
              _v: "2026-09-03",
              _ts: new Date().toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Partner has no DB subscription — check RevenueCat directly. If the
        // partner purchased but confirm-subscription never completed, we still
        // grant access and backfill their subscription row for future checks.
        // BUT only if the RC entitlement is from a PRODUCTION environment.
        const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
        if (rcSecretKey) {
          try {
            const partnerRc = await checkRevenueCatEntitlement(partnerId, rcSecretKey);
            if (partnerRc.active && partnerRc.environment === "production") {
              console.log(`[get-effective-subscription] RC partner fallback hit for partner=${partnerId} plan=${partnerRc.plan} env=production`);
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
                    purchase_environment: "production",
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
                  trialGraceEndsAt: null,
                  purchaseEnvironment: "production",
                  _v: "2026-09-03",
                  _ts: new Date().toISOString(),
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            if (partnerRc.active && partnerRc.environment === "sandbox") {
              console.log(`[get-effective-subscription] RC partner sandbox entitlement detected for partner=${partnerId} — NOT granting production premium`);
            }
          } catch (err) {
            console.error(`[get-effective-subscription] RC partner fallback error for partner=${partnerId}:`, String(err));
          }
        }
      }
    }

    // 5. RevenueCat API fallback — if the DB has no active subscription but
    //    RevenueCat shows an active entitlement (e.g. purchase completed but
    //    confirm-subscription never ran), sync the DB and return premium.
    //    BUT only if the entitlement is from a PRODUCTION environment.
    //    Sandbox entitlements are NOT granted production premium by the server.
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
    if (rcSecretKey) {
      try {
        const rc = await checkRevenueCatEntitlement(user.id, rcSecretKey);
        if (rc.active && rc.environment === "production") {
          console.log(`[get-effective-subscription] RC fallback hit for user=${user.id} plan=${rc.plan} env=production`);
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
                purchase_environment: "production",
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
              trialGraceEndsAt: null,
              purchaseEnvironment: "production",
              _v: "2026-09-03",
              _ts: new Date().toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (rc.active && rc.environment === "sandbox") {
          console.log(`[get-effective-subscription] RC sandbox entitlement detected for user=${user.id} — NOT granting production premium from server`);
        }
      } catch (err) {
        console.error(`[get-effective-subscription] RC fallback error for user=${user.id}:`, String(err));
      }
    }

    // No active premium from any source. Only flag trialExpired for trial plan rows.
    const trialExpired = ownSub !== null && isTrialPlan(ownSub.plan) && !isSubActive(ownSub);

    // Compute trial grace end time for expired trials so the client can show
    // grace-period messaging in the paywall.
    let trialGraceEndsAt: string | null = null;
    if (trialExpired && ownSub?.expires_at) {
      trialGraceEndsAt = new Date(
        new Date(ownSub.expires_at).getTime() + TRIAL_GRACE_MS
      ).toISOString();
    }

    // Determine purchase_environment for the response (for diagnostics).
    let responseEnv: PurchaseEnvironment | "none" = "none";
    if (ownSub?.purchase_environment) {
      responseEnv = ownSub.purchase_environment;
    }

    return new Response(
      JSON.stringify({
        isPremium: false,
        source: "none",
        plan: null,
        expiresAt: null,
        isOnTrial: false,
        trialExpiresAt: ownSub?.expires_at ?? null,
        trialExpired,
        canInvite: false,
        trialGraceEndsAt,
        purchaseEnvironment: responseEnv,
        _v: "2026-09-03",
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
