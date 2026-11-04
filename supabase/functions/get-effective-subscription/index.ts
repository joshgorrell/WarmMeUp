import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isSubActive, isTrialPlan, TRIAL_GRACE_MS } from "../_shared/accessRules.ts";
import {
  checkRevenueCatEntitlement,
  hasRevenueCatAccess,
  recordRevenueCatEntitlement,
} from "../_shared/effectiveAccess.ts";
import {
  graceEndsMs,
  reverifyPaidSubscriptions,
  resolveVerifiedAccess,
} from "./verification.ts";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");

    const reverifyToken = req.headers.get("x-subscription-reverify-token") ?? "";
    if (reverifyToken) {
      const { data: isScheduler, error: tokenError } = await adminClient.rpc(
        "validate_subscription_reverify_token",
        { p_token: reverifyToken },
      );
      if (!tokenError && isScheduler === true) {
        if (!rcSecretKey) throw new Error("REVENUECAT_SECRET_KEY is not configured");
        const summary = await reverifyPaidSubscriptions(adminClient, rcSecretKey);
        return new Response(JSON.stringify(summary), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const own = await resolveVerifiedAccess(adminClient, user.id, rcSecretKey);
    const ownAccess = own.access;

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
        const partner = await resolveVerifiedAccess(adminClient, partnerId, rcSecretKey);
        const partnerAccess = partner.access;
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

        // Partner has no paid row to re-verify, so check RevenueCat directly for a new purchase.
        if (rcSecretKey && !partner.revenueCatChecked) {
          try {
            const partnerRc = await checkRevenueCatEntitlement(partnerId, rcSecretKey);
            if (hasRevenueCatAccess(partnerRc)) {
              console.log(`[get-effective-subscription] RC partner fallback hit for partner=${partnerId} plan=${partnerRc.plan} env=${partnerRc.environment}`);
              await recordRevenueCatEntitlement(adminClient, partnerId, partnerRc);
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

    // RevenueCat fallback for a new purchase that confirm-subscription never recorded.
    if (rcSecretKey && !own.revenueCatChecked) {
      try {
        const rc = await checkRevenueCatEntitlement(user.id, rcSecretKey);
        if (hasRevenueCatAccess(rc)) {
          console.log(`[get-effective-subscription] RC fallback hit for user=${user.id} plan=${rc.plan} env=${rc.environment}`);
          await recordRevenueCatEntitlement(adminClient, user.id, rc);
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

    // A paired couple keeps access for 24 hours after its last valid paid moment.
    // Grace never grants invite permission, which the database invite gate checks separately.
    if (couple?.user_b_id) {
      const { data: memberSubs, error: memberSubsError } = await adminClient
        .from("subscriptions")
        .select("plan, expires_at")
        .in("user_id", [couple.user_a_id, couple.user_b_id]);
      if (memberSubsError) {
        console.error(`[get-effective-subscription] grace lookup failed for user=${user.id}:`, memberSubsError.message);
      }

      const nowMs = Date.now();
      let graceRow: { plan: string; expires_at: string | null; graceEndsMs: number } | null = null;
      for (const member of memberSubs ?? []) {
        const memberGraceEndsMs = graceEndsMs(member, nowMs);
        if (memberGraceEndsMs !== null && (graceRow === null || memberGraceEndsMs > graceRow.graceEndsMs)) {
          graceRow = { plan: member.plan, expires_at: member.expires_at, graceEndsMs: memberGraceEndsMs };
        }
      }

      if (graceRow) {
        return new Response(
          JSON.stringify({
            isPremium: true,
            source: "grace",
            plan: graceRow.plan,
            expiresAt: graceRow.expires_at,
            isOnTrial: false,
            trialExpiresAt: null,
            trialExpired: false,
            canInvite: false,
            trialGraceEndsAt: null,
            purchaseEnvironment: "none",
            _v: "2026-09-03",
            _ts: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
