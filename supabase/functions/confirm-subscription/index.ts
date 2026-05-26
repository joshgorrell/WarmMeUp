import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CustomerInfoPayload {
  // RevenueCat customerInfo shape (subset we care about)
  entitlements: {
    active: Record<string, {
      productIdentifier: string;
      expirationDate: string | null;
      periodType: "NORMAL" | "TRIAL" | "INTRO";
    }>;
  };
  // fallback: pass plan explicitly if entitlements aren't available
  plan?: "monthly" | "yearly";
  expiresAt?: string | null;
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

    const body: CustomerInfoPayload = await req.json();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Derive plan and expiry from RevenueCat entitlement
    const premiumEntitlement = body.entitlements?.active?.["premium"];
    let plan: "monthly" | "yearly" = "monthly";
    let expiresAt: string | null = null;

    if (premiumEntitlement) {
      const id = premiumEntitlement.productIdentifier.toLowerCase();
      if (id.includes("annual") || id.includes("yearly") || id.includes("year")) {
        plan = "yearly";
      }
      expiresAt = premiumEntitlement.expirationDate ?? null;
    } else if (body.plan) {
      plan = body.plan;
      expiresAt = body.expiresAt ?? null;
    }

    // Upsert the subscription row (service role bypasses RLS)
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
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stamp subscription_owner_id on the user's active couple if they're paired
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
    return new Response(JSON.stringify({ error: err?.message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
