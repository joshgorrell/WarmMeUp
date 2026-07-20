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

    const now = Date.now();
    const dayMs = 86400000;
    const todayStart = new Date(now - dayMs).toISOString();
    const weekStart = new Date(now - 7 * dayMs).toISOString();
    const monthStart = new Date(now - 30 * dayMs).toISOString();

    // Total messages (metadata only — never select content_text)
    const { count: totalMessages } = await adminClient
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);

    const { count: messagesToday } = await adminClient
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", todayStart);

    const { count: messagesWeek } = await adminClient
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", weekStart);

    const { count: messagesMonth } = await adminClient
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("created_at", monthStart);

    // Active couples (couples with any messages)
    const { data: couplesWithMessages } = await adminClient
      .from("chat_messages")
      .select("couple_id")
      .is("deleted_at", null);

    const uniqueCouples = new Set<string>();
    if (couplesWithMessages) {
      for (const m of couplesWithMessages) uniqueCouples.add(m.couple_id);
    }

    // Engagement buckets — count messages per couple
    const coupleMessageCounts = new Map<string, number>();
    if (couplesWithMessages) {
      for (const m of couplesWithMessages) {
        coupleMessageCounts.set(m.couple_id, (coupleMessageCounts.get(m.couple_id) ?? 0) + 1);
      }
    }

    const buckets = { "0": 0, "1-10": 0, "11-100": 0, "101-500": 0, "500+": 0 };
    for (const [, count] of coupleMessageCounts) {
      if (count === 0) buckets["0"]++;
      else if (count <= 10) buckets["1-10"]++;
      else if (count <= 100) buckets["11-100"]++;
      else if (count <= 500) buckets["101-500"]++;
      else buckets["500+"]++;
    }

    // Most active couple
    let mostActiveCoupleId: string | null = null;
    let mostActiveCount = 0;
    for (const [coupleId, count] of coupleMessageCounts) {
      if (count > mostActiveCount) {
        mostActiveCount = count;
        mostActiveCoupleId = coupleId;
      }
    }

    // Most active day of week (last 30 days)
    const { data: recentMessages } = await adminClient
      .from("chat_messages")
      .select("created_at")
      .is("deleted_at", null)
      .gte("created_at", monthStart);

    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    if (recentMessages) {
      for (const m of recentMessages) {
        const day = new Date(m.created_at).getDay();
        dayOfWeekCounts[day]++;
      }
    }
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const mostActiveDayIdx = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts));
    const mostActiveDay = dayNames[mostActiveDayIdx];

    // % of couples chatted today/this week
    const { data: todayCouples } = await adminClient
      .from("chat_messages")
      .select("couple_id")
      .is("deleted_at", null)
      .gte("created_at", todayStart);
    const todayActiveCouples = new Set<string>();
    if (todayCouples) for (const m of todayCouples) todayActiveCouples.add(m.couple_id);

    const { data: weekCouples } = await adminClient
      .from("chat_messages")
      .select("couple_id")
      .is("deleted_at", null)
      .gte("created_at", weekStart);
    const weekActiveCouples = new Set<string>();
    if (weekCouples) for (const m of weekCouples) weekActiveCouples.add(m.couple_id);

    // Total couples for percentage calculation
    const { count: totalCouples } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .not("user_b_id", "is", null);

    const pctChattedToday = totalCouples ? Math.round((todayActiveCouples.size / totalCouples) * 100) : 0;
    const pctChattedWeek = totalCouples ? Math.round((weekActiveCouples.size / totalCouples) * 100) : 0;

    // Avg messages per couple per day
    const avgPerCouplePerDay = uniqueCouples.size > 0
      ? Math.round((totalMessages ?? 0) / uniqueCouples.size / 30 * 10) / 10
      : 0;

    return new Response(
      JSON.stringify({
        totalMessages: totalMessages ?? 0,
        messagesToday: messagesToday ?? 0,
        messagesThisWeek: messagesWeek ?? 0,
        messagesThisMonth: messagesMonth ?? 0,
        activeCouples: uniqueCouples.size,
        avgPerCouplePerDay,
        engagementBuckets: buckets,
        mostActiveCoupleId,
        mostActiveCoupleMessages: mostActiveCount,
        mostActiveDay,
        pctChattedToday,
        pctChattedThisWeek: pctChattedWeek,
        privacyProtected: true,
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
