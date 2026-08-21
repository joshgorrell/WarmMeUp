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

    // 1. Get cancellation events in range
    const { data: cancelEvents } = await adminClient
      .from("subscription_events")
      .select("user_id, couple_id, plan, occurred_at, metadata")
      .eq("event_type", "cancelled")
      .gte("occurred_at", dates.start)
      .lte("occurred_at", dates.end)
      .order("occurred_at", { ascending: false });

    // 2. Get all subscription data for tenure calculation
    const { data: allSubs } = await adminClient
      .from("subscriptions")
      .select("user_id, plan, status, started_at, expires_at, trial_started_at");

    const subByUser = new Map<string, typeof allSubs>();
    for (const sub of allSubs || []) {
      subByUser.set(sub.user_id, sub);
    }

    // 3. Get cancellation surveys
    const { data: surveys } = await adminClient
      .from("cancellation_surveys")
      .select("user_id, primary_reason, other_reason_text, most_used_feature, never_used_feature, would_return, submitted_at");

    const surveyByUser = new Map<string, typeof surveys>();
    for (const s of surveys || []) {
      surveyByUser.set(s.user_id, s);
    }

    // 4. Get couple activity before cancellation
    const cancelUserIds = (cancelEvents || []).map((e) => e.user_id);
    const cancelCoupleIds = (cancelEvents || []).map((e) => e.couple_id).filter(Boolean);

    // Get activity events for these couples (7/14/30 days before cancellation)
    let activityByCouple = new Map<string, { d7: number; d14: number; d30: number; lastActivity: string | null }>();
    if (cancelCoupleIds.length > 0) {
      const { data: coupleActivity } = await adminClient
        .from("activity_events")
        .select("couple_id, created_at")
        .in("couple_id", cancelCoupleIds)
        .order("created_at", { ascending: false });

      const activityMap = new Map<string, string[]>();
      for (const evt of coupleActivity || []) {
        if (!evt.couple_id) continue;
        if (!activityMap.has(evt.couple_id)) activityMap.set(evt.couple_id, []);
        activityMap.get(evt.couple_id)!.push(evt.created_at);
      }

      for (const cid of cancelCoupleIds) {
        const timestamps = (activityMap.get(cid) || []).map((t) => new Date(t).getTime());
        activityByCouple.set(cid, {
          d7: timestamps.filter(() => true).length, // Will refine below
          d14: 0,
          d30: 0,
          lastActivity: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
        });
      }
    }

    // 5. Get monthly_scores for feature usage before cancellation
    const { data: monthlyScores } = await adminClient
      .from("monthly_scores")
      .select("couple_id, dares_accepted, dares_completed, dice_accepted, dice_completed, asks_sent, chat_messages_sent, media_sent, vault_uploads, wishes_sent")
      .in("couple_id", cancelCoupleIds);

    const scoresByCouple = new Map<string, typeof monthlyScores>();
    for (const ms of monthlyScores || []) {
      if (ms.couple_id) scoresByCouple.set(ms.couple_id, ms);
    }

    // 6. Build per-cancellation detail records
    const details = (cancelEvents || []).map((evt) => {
      const sub = subByUser.get(evt.user_id);
      const survey = surveyByUser.get(evt.user_id);
      const activity = evt.couple_id ? activityByCouple.get(evt.couple_id) : null;
      const scores = evt.couple_id ? scoresByCouple.get(evt.couple_id) : null;

      const tenureMs = sub ? new Date(evt.occurred_at).getTime() - new Date(sub.started_at).getTime() : 0;
      const tenureDays = Math.floor(tenureMs / 86400000);

      return {
        userId: evt.user_id,
        coupleId: evt.couple_id,
        plan: evt.plan,
        tenureDays,
        wasTrial: sub?.plan === "trial" || (sub?.trial_started_at && sub?.plan !== "trial"),
        monthly: evt.plan === "monthly",
        annual: evt.plan === "yearly",
        cancellationReason: survey?.primary_reason || null,
        otherReasonText: survey?.other_reason_text || null,
        mostUsedFeature: survey?.most_used_feature || null,
        neverUsedFeature: survey?.never_used_feature || null,
        wouldReturn: survey?.would_return || null,
        lastActivityAt: activity?.lastActivity || null,
        featuresUsed: scores ? {
          daresAccepted: scores.dares_accepted,
          daresCompleted: scores.dares_completed,
          diceAccepted: scores.dice_accepted,
          diceCompleted: scores.dice_completed,
          asksSent: scores.asks_sent,
          chatMessages: scores.chat_messages_sent,
          mediaSent: scores.media_sent,
          vaultUploads: scores.vault_uploads,
          wishesSent: scores.wishes_sent,
        } : null,
        voluntary: evt.metadata?.voluntary !== false,
        occurredAt: evt.occurred_at,
      };
    });

    // 7. Build summary
    const totalCancellations = details.length;

    // Top reasons
    const reasonCounts: { [key: string]: number } = {};
    for (const d of details) {
      if (d.cancellationReason) {
        reasonCounts[d.cancellationReason] = (reasonCounts[d.cancellationReason] || 0) + 1;
      }
    }
    const topReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Average tenure
    const avgTenure = totalCancellations > 0
      ? Math.round(details.reduce((sum, d) => sum + d.tenureDays, 0) / totalCancellations)
      : 0;

    // Plan breakdown
    const monthlyCount = details.filter((d) => d.monthly).length;
    const annualCount = details.filter((d) => d.annual).length;

    // Would return
    const wouldReturnCount = details.filter((d) => d.wouldReturn === "yes" || d.wouldReturn === "maybe").length;

    // 8. Churn rate (cancellations / paying couples at period start)
    let payingAtStart = 0;
    const startMs = new Date(dates.start).getTime();
    for (const sub of allSubs || []) {
      const started = new Date(sub.started_at).getTime();
      const expires = sub.expires_at ? new Date(sub.expires_at).getTime() : Infinity;
      if (started <= startMs && expires > startMs && sub.plan in ["monthly", "yearly"]) {
        payingAtStart++;
      }
    }
    const churnRate = payingAtStart > 0
      ? Math.round((totalCancellations / payingAtStart) * 1000) / 10
      : 0;

    return new Response(
      JSON.stringify({
        range,
        summary: {
          totalCancellations,
          churnRate,
          payingAtStart,
          avgTenureDays: avgTenure,
          monthlyCount,
          annualCount,
          wouldReturnCount,
          topReasons,
        },
        details,
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
