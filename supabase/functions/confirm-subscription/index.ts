import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRevenueCatEntitlement, hasRevenueCatAccess } from "../_shared/effectiveAccess.ts";
import { type CoupleOwnerRow, reconcileSubscriptionOwner } from "../_shared/subscriptionOwner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");

    if (!rcSecretKey) {
      console.error("[confirm-subscription] REVENUECAT_SECRET_KEY is not set — cannot verify purchase");
      return jsonResponse({ error: "Server misconfiguration: RevenueCat secret key missing" }, 500);
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let rc;
    try {
      rc = await checkRevenueCatEntitlement(user.id, rcSecretKey);
    } catch (err: any) {
      console.error(`[confirm-subscription] RevenueCat lookup failed for user=${user.id}:`, err?.message);
      return jsonResponse({ error: "Could not reach RevenueCat. Please try again in a moment." }, 503);
    }

    if (!hasRevenueCatAccess(rc)) {
      console.warn(`[confirm-subscription] RC premium NOT active for user=${user.id}`);
      return jsonResponse({ error: "No active subscription was found for this account." }, 402);
    }

    console.log(`[confirm-subscription] RC premium ACTIVE user=${user.id} plan=${rc.plan} environment=${rc.environment ?? "complimentary"} expiresAt=${rc.expiresAt ?? "never"}`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: upsertError } = await adminClient
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

    if (upsertError) {
      console.error("[confirm-subscription] DB upsert error:", upsertError.message);
      return jsonResponse({ error: "Could not save your subscription" }, 500);
    }

    const { data: couple, error: coupleError } = await adminClient
      .from("couples")
      .select("id, user_a_id, user_b_id, subscription_owner_id")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .eq("active", true)
      .not("user_b_id", "is", null)
      .maybeSingle();

    if (coupleError) {
      console.error("[confirm-subscription] couple lookup failed:", coupleError.message);
    } else if (couple) {
      try {
        await reconcileSubscriptionOwner(adminClient, couple as CoupleOwnerRow, rcSecretKey, user.id);
      } catch (err: any) {
        console.error(`[confirm-subscription] owner reconcile failed for couple=${couple.id}:`, err?.message);
      }
    }

    return jsonResponse({ ok: true, plan: rc.plan, expiresAt: rc.expiresAt, environment: rc.environment });
  } catch (err: any) {
    console.error("[confirm-subscription] Unexpected error:", err?.message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
