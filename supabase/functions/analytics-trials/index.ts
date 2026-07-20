import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_admin, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin && !profile?.is_super_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trials started (subscriptions with trial_started_at not null)
    const { count: trialsStarted } = await adminClient
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .not("trial_started_at", "is", null);

    // Trials converted (trial_started_at not null AND plan in monthly/yearly AND status active)
    const { count: trialsConverted } = await adminClient
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .not("trial_started_at", "is", null)
      .in("plan", ["monthly", "yearly"])
      .eq("status", "active");

    // Trials expired (trial plan, status not active)
    const { count: trialsExpired } = await adminClient
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan", "trial")
      .neq("status", "active");

    const conversionRate = trialsStarted ? Math.round(((trialsConverted ?? 0) / trialsStarted) * 100) : 0;

    // Avg days until subscription (from trial_started_at to started_at for converted)
    const { data: convertedSubs } = await adminClient
      .from("subscriptions")
      .select("trial_started_at, started_at")
      .not("trial_started_at", "is", null)
      .in("plan", ["monthly", "yearly"])
      .eq("status", "active");

    let avgDaysUntilSub = 0;
    if (convertedSubs && convertedSubs.length > 0) {
      const totalDays = convertedSubs.reduce((sum, s: any) => {
        if (s.trial_started_at && s.started_at) {
          return sum + Math.floor((new Date(s.started_at).getTime() - new Date(s.trial_started_at).getTime()) / 86400000);
        }
        return sum;
      }, 0);
      avgDaysUntilSub = Math.round(totalDays / convertedSubs.length * 10) / 10;
    }

    // Avg days until partner joined (from couple created_at to user_b_id set)
    const { data: couplesData } = await adminClient
      .from("couples")
      .select("created_at, updated_at, user_b_id")
      .not("user_b_id", "is", null)
      .eq("active", true);

    let avgDaysUntilPartner = 0;
    if (couplesData && couplesData.length > 0) {
      const totalDays = couplesData.reduce((sum, c: any) => {
        return sum + Math.floor((new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 86400000);
      }, 0);
      avgDaysUntilPartner = Math.round(totalDays / couplesData.length * 10) / 10;
    }

    return new Response(
      JSON.stringify({
        trialsStarted: trialsStarted ?? 0,
        trialsConverted: trialsConverted ?? 0,
        trialsExpired: trialsExpired ?? 0,
        conversionRate,
        avgDaysUntilSubscription: avgDaysUntilSub,
        avgDaysUntilPartnerJoined: avgDaysUntilPartner,
        _ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
