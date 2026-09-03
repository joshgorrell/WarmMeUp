import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type PurchaseEnvironment = "sandbox" | "production";

interface RCEntitlementResult {
  active: boolean;
  plan: "monthly" | "yearly";
  expiresAt: string | null;
  environment: PurchaseEnvironment | null;
}

async function verifyRevenueCatEntitlement(
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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[confirm-subscription] RevenueCat API error status=${res.status}`, body.slice(0, 200));
    return { active: false, plan: "monthly", expiresAt: null, environment: null };
  }

  const data = await res.json();
  const entitlement = data?.subscriber?.entitlements?.premium;

  console.log(`[confirm-subscription] RC entitlement for ${rcUserId}:`, JSON.stringify({
    expires_date: entitlement?.expires_date ?? null,
    product_identifier: entitlement?.product_identifier ?? null,
  }));

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
  // RevenueCat's v1 API returns is_sandbox on each subscription entry (keyed
  // by product identifier). The entitlement itself does not carry is_sandbox,
  // so we look it up via the entitlement's product_identifier.
  const subscriptions = data?.subscriber?.subscriptions ?? {};
  const subEntry = subscriptions[productId];

  let environment: PurchaseEnvironment | null = null;
  if (subEntry && typeof subEntry.is_sandbox === "boolean") {
    environment = subEntry.is_sandbox ? "sandbox" : "production";
  }

  console.log(`[confirm-subscription] RC environment for ${rcUserId}: product=${productId} is_sandbox=${subEntry?.is_sandbox ?? "N/A"} environment=${environment ?? "unknown"}`);

  return { active: isActive, plan, expiresAt, environment };
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
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");

    if (!rcSecretKey) {
      console.error("[confirm-subscription] REVENUECAT_SECRET_KEY is not set — cannot verify purchase");
      return new Response(JSON.stringify({ error: "Server misconfiguration: RevenueCat secret key missing" }), {
        status: 500,
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

    console.log(`[confirm-subscription] Verifying RC entitlement for user=${user.id}`);

    const { active, plan, expiresAt, environment } = await verifyRevenueCatEntitlement(user.id, rcSecretKey);

    if (!active) {
      console.warn(`[confirm-subscription] RC premium NOT active for user=${user.id}`);
      return new Response(
        JSON.stringify({ error: "No active premium entitlement found in RevenueCat" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fail safe: if we cannot determine the purchase environment, do NOT
    // grant production access. A sandbox entitlement must not masquerade
    // as a real production subscription.
    if (environment === null) {
      console.warn(`[confirm-subscription] Cannot determine purchase environment for user=${user.id} — refusing to grant production access`);
      return new Response(
        JSON.stringify({ error: "Unable to verify purchase environment. Please try restoring your purchase or contact support." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (environment === "sandbox") {
      console.warn(`[confirm-subscription] Sandbox entitlement detected for user=${user.id} — NOT recording as production subscription`);
      return new Response(
        JSON.stringify({
          ok: false,
          environment: "sandbox",
          error: "Sandbox purchase detected. This purchase is valid for TestFlight testing but is not a production subscription.",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[confirm-subscription] RC premium ACTIVE user=${user.id} plan=${plan} environment=${environment} expiresAt=${expiresAt}`);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: upsertError } = await adminClient
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan,
          status: "active",
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          trial_started_at: null,
          purchase_environment: environment,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[confirm-subscription] DB upsert error:", upsertError.message);
      return new Response(JSON.stringify({ error: "Could not save your subscription" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stamp subscription_owner_id on the user's active couple if they're paired.
    const { data: couple } = await adminClient
      .from("couples")
      .select("id, user_a_id, user_b_id")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .eq("active", true)
      .not("user_b_id", "is", null)
      .maybeSingle();

    if (couple) {
      await adminClient
        .from("couples")
        .update({ subscription_owner_id: user.id })
        .eq("id", couple.id);
    }

    return new Response(
      JSON.stringify({ ok: true, plan, expiresAt, environment }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[confirm-subscription] Unexpected error:", err?.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
