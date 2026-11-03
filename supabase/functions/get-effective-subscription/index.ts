import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isSubActive, isTrialPlan, TRIAL_GRACE_MS } from "../_shared/accessRules.ts";
import {
  checkRevenueCatEntitlement,
  hasRevenueCatAccess,
  resolveOwnAccess,
} from "../_shared/effectiveAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const ownAccess = await resolveOwnAccess(adminClient, user.id);

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
        const partnerAccess = await resolveOwnAccess(adminClient, partnerId);
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
        // Preserve the verified purchase environment when backfilling access.
        const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
        if (rcSecretKey) {
          try {
            const partnerRc = await checkRevenueCatEntitlement(partnerId, rcSecretKey);
            if (hasRevenueCatAccess(partnerRc)) {
              console.log(`[get-effective-subscription] RC partner fallback hit for partner=${partnerId} plan=${partnerRc.plan} env=${partnerRc.environment}`);
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
                    purchase_environment: partnerRc.environment,
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
                  purchaseEnvironment: partnerRc.environment,
                  _v: "2026-09-03",
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

    // 5. RevenueCat API fallback — if the DB has no active subscription but
    //    RevenueCat shows an active entitlement (e.g. purchase completed but
    //    confirm-subscription never ran), sync the DB and return premium.
    //    Both production and sandbox are verified server-side and labeled accurately.
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
    if (rcSecretKey) {
      try {
        const rc = await checkRevenueCatEntitlement(user.id, rcSecretKey);
        if (hasRevenueCatAccess(rc)) {
          console.log(`[get-effective-subscription] RC fallback hit for user=${user.id} plan=${rc.plan} env=${rc.environment}`);
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
                purchase_environment: rc.environment,
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
              purchaseEnvironment: rc.environment,
              _v: "2026-09-03",
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
    const trialExpired = ownSub !== null && isTrialPlan(ownSub.plan) && !isSubActive(ownSub, Date.now());

    // Compute trial grace end time for expired trials so the client can show
    // grace-period messaging in the paywall.
    let trialGraceEndsAt: string | null = null;
    if (trialExpired && ownSub?.expires_at) {
      trialGraceEndsAt = new Date(
        new Date(ownSub.expires_at).getTime() + TRIAL_GRACE_MS
      ).toISOString();
    }

    // Determine purchase_environment for the response (for diagnostics).
    let responseEnv: "sandbox" | "production" | "none" = "none";
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
