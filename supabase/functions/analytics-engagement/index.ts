import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type RangeKey = "current_month" | "previous_month" | "last_30d" | "last_90d" | "lifetime";

function getRangeDates(range: RangeKey): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();

  switch (range) {
    case "current_month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end };
    case "previous_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      prevEnd.setMilliseconds(-1);
      return { start: start.toISOString(), end: prevEnd.toISOString() };
    }
    case "last_30d":
      return { start: new Date(now.getTime() - 30 * 86400000).toISOString(), end };
    case "last_90d":
      return { start: new Date(now.getTime() - 90 * 86400000).toISOString(), end };
    case "lifetime":
    default:
      return { start: new Date(0).toISOString(), end };
  }
}

const ENGAGEMENT_EVENT_TYPES = [
  "chat_message_sent", "chat_media_sent", "burn_timer_used",
  "dare_sent", "dare_accepted", "dare_completed",
  "dice_sent", "dice_accepted", "dice_completed",
  "ask_sent", "ask_replied",
  "vault_uploaded", "wish_created",
  "blur_enabled", "stealth_mode_enabled",
];

const FEATURE_CATEGORIES = ["chat", "vault", "dares", "dice", "wishes", "burn"];

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

    const url = new URL(req.url);
    const range = (url.searchParams.get("range") || "last_30d") as RangeKey;
    const dates = getRangeDates(range);

    // 1. Get all engagement events in range
    const { data: events } = await adminClient
      .from("activity_events")
      .select("couple_id, actor_user_id, event_type, created_at")
      .in("event_type", ENGAGEMENT_EVENT_TYPES)
      .gte("created_at", dates.start)
      .lte("created_at", dates.end);

    // 2. Aggregate totals
    const totals: { [key: string]: number } = {};
    for (const evt of events || []) {
      totals[evt.event_type] = (totals[evt.event_type] || 0) + 1;
    }

    // 3. Per-couple engagement profile
    const coupleProfiles = new Map<string, {
      couple_id: string;
      eventCounts: { [key: string]: number };
      activeDays: Set<string>;
      featuresUsed: Set<string>;
    }>();

    for (const evt of events || []) {
      if (!evt.couple_id) continue;
      if (!coupleProfiles.has(evt.couple_id)) {
        coupleProfiles.set(evt.couple_id, {
          couple_id: evt.couple_id,
          eventCounts: {},
          activeDays: new Set(),
          featuresUsed: new Set(),
        });
      }
      const p = coupleProfiles.get(evt.couple_id)!;
      p.eventCounts[evt.event_type] = (p.eventCounts[evt.event_type] || 0) + 1;
      p.activeDays.add(evt.created_at.slice(0, 10)); // YYYY-MM-DD

      // Map event to feature category
      if (evt.event_type.startsWith("chat")) p.featuresUsed.add("chat");
      if (evt.event_type.startsWith("vault")) p.featuresUsed.add("vault");
      if (evt.event_type.startsWith("dare")) p.featuresUsed.add("dares");
      if (evt.event_type.startsWith("dice")) p.featuresUsed.add("dice");
      if (evt.event_type.startsWith("wish")) p.featuresUsed.add("wishes");
      if (evt.event_type.startsWith("burn")) p.featuresUsed.add("burn");
    }

    // 4. Feature diversity distribution
    const diversityBuckets = { "1": 0, "2": 0, "3": 0, "4+": 0 };
    for (const p of coupleProfiles.values()) {
      const count = p.featuresUsed.size;
      if (count === 1) diversityBuckets["1"]++;
      else if (count === 2) diversityBuckets["2"]++;
      else if (count === 3) diversityBuckets["3"]++;
      else if (count >= 4) diversityBuckets["4+"]++;
    }

    // 5. Active days distribution (per week, approximated from the range)
    const activeDaysBuckets = { "1": 0, "2-3": 0, "4+": 0 };
    for (const p of coupleProfiles.values()) {
      const days = p.activeDays.size;
      if (days <= 1) activeDaysBuckets["1"]++;
      else if (days <= 3) activeDaysBuckets["2-3"]++;
      else activeDaysBuckets["4+"]++;
    }

    // 6. Total active couples (with any engagement in range)
    const activeCouples = coupleProfiles.size;

    // 7. Build per-couple profiles array (for correlation analysis)
    const perCouple = Array.from(coupleProfiles.values()).map((p) => ({
      couple_id: p.couple_id,
      totalEvents: Object.values(p.eventCounts).reduce((a, b) => a + b, 0),
      activeDays: p.activeDays.size,
      featureDiversity: p.featuresUsed.size,
      features: Array.from(p.featuresUsed),
      eventCounts: p.eventCounts,
    }));

    return new Response(
      JSON.stringify({
        range,
        totals: {
          chatMessages: totals["chat_message_sent"] || 0,
          chatMedia: totals["chat_media_sent"] || 0,
          burnTimerUsed: totals["burn_timer_used"] || 0,
          daresSent: totals["dare_sent"] || 0,
          daresAccepted: totals["dare_accepted"] || 0,
          daresCompleted: totals["dare_completed"] || 0,
          diceSent: totals["dice_sent"] || 0,
          diceAccepted: totals["dice_accepted"] || 0,
          diceCompleted: totals["dice_completed"] || 0,
          asksSent: totals["ask_sent"] || 0,
          asksReplied: totals["ask_replied"] || 0,
          vaultUploads: totals["vault_uploaded"] || 0,
          wishesCreated: totals["wish_created"] || 0,
          blurEnabled: totals["blur_enabled"] || 0,
          stealthModeEnabled: totals["stealth_mode_enabled"] || 0,
        },
        activeCouples,
        diversityBuckets,
        activeDaysBuckets,
        perCouple,
        privacyProtected: true,
        _ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
