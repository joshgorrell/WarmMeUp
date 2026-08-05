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

    const { data: couples } = await adminClient
      .from("couples")
      .select("id, user_a_id, user_b_id, created_at, active")
      .eq("active", true)
      .not("user_b_id", "is", null);

    if (!couples || couples.length === 0) {
      return new Response(
        JSON.stringify({
          distribution: { healthy: 0, at_risk: 0, inactive: 0 },
          total: 0,
          _ts: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    const fourteenDaysAgo = new Date(now - FOURTEEN_DAYS_MS).toISOString();

    const [recentActivity, recentChats] = await Promise.all([
      adminClient.from("activity_events").select("couple_id, created_at")
        .gte("created_at", fourteenDaysAgo),
      adminClient.from("chat_messages").select("couple_id, created_at")
        .is("deleted_at", null).gte("created_at", fourteenDaysAgo),
    ]);

    const lastActivityMap = new Map<string, string>();
    const sources = [
      ...(recentActivity.data ?? []),
      ...(recentChats.data ?? []),
    ];
    for (const evt of sources) {
      const prev = lastActivityMap.get(evt.couple_id);
      if (!prev || new Date(evt.created_at) > new Date(prev)) {
        lastActivityMap.set(evt.couple_id, evt.created_at);
      }
    }

    const distribution = { healthy: 0, at_risk: 0, inactive: 0 };

    for (const couple of couples as CoupleRow[]) {
      const lastActivity = lastActivityMap.get(couple.id) ?? null;
      const daysSince = lastActivity
        ? Math.floor((now - new Date(lastActivity).getTime()) / 86400000)
        : null;

      let status: string;
      if (!lastActivity || (daysSince !== null && daysSince > 14)) {
        status = "inactive";
      } else if (daysSince !== null && daysSince > 7) {
        status = "at_risk";
      } else {
        status = "healthy";
      }

      distribution[status as keyof typeof distribution]++;
    }

    return new Response(
      JSON.stringify({
        distribution,
        total: couples.length,
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
