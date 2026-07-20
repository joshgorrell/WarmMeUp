import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SEVEN_DAYS_MS = 7 * 86400000;
const FOURTEEN_DAYS_MS = 14 * 86400000;

interface CoupleRow {
  id: string;
  user_a_id: string;
  user_b_id: string | null;
  created_at: string;
  active: boolean;
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

    // Fetch all couples (active only)
    const { data: couples } = await adminClient
      .from("couples")
      .select("id, user_a_id, user_b_id, created_at, active")
      .eq("active", true);

    if (!couples || couples.length === 0) {
      return new Response(
        JSON.stringify({
          distribution: { healthy: 0, at_risk: 0, inactive: 0 },
          couples: [],
          _ts: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS).toISOString();
    const fourteenDaysAgo = new Date(now - FOURTEEN_DAYS_MS).toISOString();

    // Get last activity per couple from activity_events
    const { data: recentActivity } = await adminClient
      .from("activity_events")
      .select("couple_id, created_at")
      .gte("created_at", fourteenDaysAgo);

    // Build a map of couple_id -> last activity timestamp
    const lastActivityMap = new Map<string, string>();
    const activity7dCountMap = new Map<string, number>();
    if (recentActivity) {
      for (const evt of recentActivity) {
        const prev = lastActivityMap.get(evt.couple_id);
        if (!prev || new Date(evt.created_at) > new Date(prev)) {
          lastActivityMap.set(evt.couple_id, evt.created_at);
        }
        if (new Date(evt.created_at).getTime() > now - SEVEN_DAYS_MS) {
          activity7dCountMap.set(evt.couple_id, (activity7dCountMap.get(evt.couple_id) ?? 0) + 1);
        }
      }
    }

    // Also check chat_messages for last activity
    const { data: recentChats } = await adminClient
      .from("chat_messages")
      .select("couple_id, created_at")
      .is("deleted_at", null)
      .gte("created_at", fourteenDaysAgo);

    if (recentChats) {
      for (const msg of recentChats) {
        const prev = lastActivityMap.get(msg.couple_id);
        if (!prev || new Date(msg.created_at) > new Date(prev)) {
          lastActivityMap.set(msg.couple_id, msg.created_at);
        }
        if (new Date(msg.created_at).getTime() > now - SEVEN_DAYS_MS) {
          activity7dCountMap.set(msg.couple_id, (activity7dCountMap.get(msg.couple_id) ?? 0) + 1);
        }
      }
    }

    // Check partner activity (both partners active in last 7 days)
    const { data: recentActorActivity } = await adminClient
      .from("activity_events")
      .select("actor_user_id, created_at")
      .gte("created_at", sevenDaysAgo);

    const activeUsers7d = new Set<string>();
    if (recentActorActivity) {
      for (const evt of recentActorActivity) {
        activeUsers7d.add(evt.actor_user_id);
      }
    }

    // Compute health for each couple
    const healthRecords: Array<{
      couple_id: string;
      status: string;
      last_activity_at: string | null;
      days_since_activity: number | null;
      partner_a_active: boolean;
      partner_b_active: boolean;
      shared_activity_7d: number;
    }> = [];

    const distribution = { healthy: 0, at_risk: 0, inactive: 0 };

    for (const couple of couples as CoupleRow[]) {
      const lastActivity = lastActivityMap.get(couple.id) ?? null;
      const daysSince = lastActivity
        ? Math.floor((now - new Date(lastActivity).getTime()) / 86400000)
        : null;
      const shared7d = activity7dCountMap.get(couple.id) ?? 0;
      const partnerAActive = activeUsers7d.has(couple.user_a_id);
      const partnerBActive = couple.user_b_id ? activeUsers7d.has(couple.user_b_id) : false;

      let status: string;
      if (!lastActivity || (daysSince !== null && daysSince > 14)) {
        status = "inactive";
      } else if (daysSince !== null && daysSince > 7) {
        status = "at_risk";
      } else {
        status = "healthy";
      }

      distribution[status as keyof typeof distribution]++;

      healthRecords.push({
        couple_id: couple.id,
        status,
        last_activity_at: lastActivity,
        days_since_activity: daysSince,
        partner_a_active: partnerAActive,
        partner_b_active: partnerBActive,
        shared_activity_7d: shared7d,
      });
    }

    // Upsert into couple_health_scores
    for (const rec of healthRecords) {
      await adminClient
        .from("couple_health_scores")
        .upsert({
          couple_id: rec.couple_id,
          status: rec.status,
          computed_at: new Date().toISOString(),
          last_activity_at: rec.last_activity_at,
          days_since_activity: rec.days_since_activity,
          partner_a_active: rec.partner_a_active,
          partner_b_active: rec.partner_b_active,
          shared_activity_7d: rec.shared_activity_7d,
        }, { onConflict: "couple_id" });
    }

    // Filter by status if requested
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const filteredRecords = statusFilter
      ? healthRecords.filter((r) => r.status === statusFilter)
      : healthRecords;

    return new Response(
      JSON.stringify({
        distribution,
        couples: filteredRecords,
        total: healthRecords.length,
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
