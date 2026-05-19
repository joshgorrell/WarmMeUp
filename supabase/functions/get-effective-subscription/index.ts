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
}

function isActive(row: SubscriptionRow | null): boolean {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return false;
  return true;
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

    // Check own subscription first
    const { data: ownSub } = await adminClient
      .from("subscriptions")
      .select("user_id, plan, status, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (isActive(ownSub)) {
      return new Response(
        JSON.stringify({
          isPremium: true,
          source: "self",
          plan: ownSub!.plan,
          expiresAt: ownSub!.expires_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check partner's subscription via active couple
    const { data: couple } = await adminClient
      .from("couples")
      .select("user_a_id, user_b_id")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .eq("active", true)
      .maybeSingle();

    if (couple) {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      if (partnerId) {
        const { data: partnerSub } = await adminClient
          .from("subscriptions")
          .select("user_id, plan, status, expires_at")
          .eq("user_id", partnerId)
          .maybeSingle();

        if (isActive(partnerSub)) {
          return new Response(
            JSON.stringify({
              isPremium: true,
              source: "partner",
              plan: partnerSub!.plan,
              expiresAt: partnerSub!.expires_at,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ isPremium: false, source: "none", plan: null, expiresAt: null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
