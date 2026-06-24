import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyRevenueCatEntitlement(
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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[confirm-subscription] RevenueCat API error status=${res.status}`, body.slice(0, 200));
    return { active: false, plan: "monthly", expiresAt: null };
  }

  const data = await res.json();
  const entitlement = data?.subscriber?.entitlements?.premium;

  console.log(`[confirm-subscription] RC entitlement for ${rcUserId}:`, JSON.stringify({
    expires_date: entitlement?.expires_date ?? null,
    product_identifier: entitlement?.product_identifier ?? null,
  }));

  if (!entitlement?.expires_date) {
    return { active: false, plan: "monthly", expiresAt: null };
  }

  const expiresAt = entitlement.expires_date;
  const isActive = new Date(expiresAt) > new Date();
  const productId: string = entitlement.product_identifier ?? "";

  // Plan detection from product_identifier in the RevenueCat subscriber record.
  const plan: "monthly" | "yearly" =
    productId.includes("annual") || productId.includes("yearly") || productId.includes("year")
      ? "yearly"
      : "monthly";

  return { active: isActive, plan, expiresAt };
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

    // Server-side verification: fetch the subscriber record from RevenueCat using
    // the user's Supabase UUID (which matches RC subscriber ID set via Purchases.logIn()).
    const { active, plan, expiresAt } = await verifyRevenueCatEntitlement(user.id, rcSecretKey);

    if (!active) {
      console.warn(`[confirm-subscription] RC premium NOT active for user=${user.id}`);
      return new Response(
        JSON.stringify({ error: "No active premium entitlement found in RevenueCat" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[confirm-subscription] RC premium ACTIVE user=${user.id} plan=${plan} expiresAt=${expiresAt}`);

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
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[confirm-subscription] DB upsert error:", upsertError.message);
      return new Response(JSON.stringify({ error: upsertError.message }), {
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
      JSON.stringify({ ok: true, plan, expiresAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[confirm-subscription] Unexpected error:", err?.message);
    return new Response(JSON.stringify({ error: err?.message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
