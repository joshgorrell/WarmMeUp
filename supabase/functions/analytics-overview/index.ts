import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function parseDateRange(url: URL): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  const range = url.searchParams.get("range") ?? "30d";
  let start: string;
  if (range === "7d") start = new Date(now.getTime() - 7 * 86400000).toISOString();
  else if (range === "30d") start = new Date(now.getTime() - 30 * 86400000).toISOString();
  else if (range === "90d") start = new Date(now.getTime() - 90 * 86400000).toISOString();
  else if (range === "all") start = new Date(0).toISOString();
  else start = new Date(now.getTime() - 30 * 86400000).toISOString();
  return { start, end };
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

    // Verify caller is admin
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

    const url = new URL(req.url);
    const { start, end } = parseDateRange(url);

    // Total couples
    const { count: totalCouples } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true });

    // Paired couples (user_b_id not null)
    const { count: pairedCouples } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .not("user_b_id", "is", null)
      .eq("active", true);

    // Solo couples
    const { count: soloCouples } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .is("user_b_id", null);

    // Total users
    const { count: totalUsers } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true });

    // Active today (users with activity_events in last 24h)
    const { count: activeToday } = await adminClient
      .from("activity_events")
      .select("actor_user_id", { count: "exact", head: true, count: "exact" })
      .gte("created_at", new Date(Date.now() - 86400000).toISOString());

    // Active this week
    const { count: activeWeek } = await adminClient
      .from("activity_events")
      .select("actor_user_id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());

    // Active this month
    const { count: activeMonth } = await adminClient
      .from("activity_events")
      .select("actor_user_id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    // Subscriptions
    const { count: onTrial } = await adminClient
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("plan", "trial")
      .eq("status", "active");

    const { count: paid } = await adminClient
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "active")
      .in("plan", ["monthly", "yearly"]);

    const { count: complimentary } = await adminClient
      .from("admin_grants")
      .select("user_id", { count: "exact", head: true })
      .eq("active", true);

    // Avg days together (for paired couples)
    const { data: couplesData } = await adminClient
      .from("couples")
      .select("created_at")
      .not("user_b_id", "is", null)
      .eq("active", true);

    let avgDaysTogether = 0;
    if (couplesData && couplesData.length > 0) {
      const now = Date.now();
      const totalDays = couplesData.reduce((sum, c) => {
        const created = new Date(c.created_at).getTime();
        return sum + Math.floor((now - created) / 86400000);
      }, 0);
      avgDaysTogether = Math.round(totalDays / couplesData.length);
    }

    // Avg daily couple activity (activity_events in date range / couples / days)
    const { count: rangeActivity } = await adminClient
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", end);

    const daysInRange = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
    const avgDailyActivity = totalCouples ? Math.round((rangeActivity ?? 0) / totalCouples / daysInRange * 10) / 10 : 0;

    return new Response(
      JSON.stringify({
        totalCouples: totalCouples ?? 0,
        pairedCouples: pairedCouples ?? 0,
        soloCouples: soloCouples ?? 0,
        totalUsers: totalUsers ?? 0,
        activeToday: activeToday ?? 0,
        activeThisWeek: activeWeek ?? 0,
        activeThisMonth: activeMonth ?? 0,
        onTrial: onTrial ?? 0,
        paid: paid ?? 0,
        complimentary: complimentary ?? 0,
        avgDaysTogether,
        avgDailyActivity,
        range: { start, end },
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
