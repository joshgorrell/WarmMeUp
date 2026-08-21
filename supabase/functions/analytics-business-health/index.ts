import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MONTHLY_PRICE = 9.99;
const YEARLY_MONTHLY_EQUIV = 8.33; // 99.99 / 12

type RangeKey = "current_month" | "previous_month" | "last_30d" | "last_90d" | "lifetime";

function getDateRange(range: RangeKey): { start: string; end: string; prevStart: string; prevEnd: string } {
  const now = new Date();
  const end = now.toISOString();

  let start: Date;
  let prevStart: Date;
  let prevEnd: Date;

  switch (range) {
    case "current_month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
      break;
    }
    case "previous_month": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      prevEnd.setMilliseconds(-1);
      prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      break;
    }
    case "last_30d": {
      start = new Date(now.getTime() - 30 * 86400000);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - 30 * 86400000);
      break;
    }
    case "last_90d": {
      start = new Date(now.getTime() - 90 * 86400000);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - 90 * 86400000);
      break;
    }
    case "lifetime":
    default: {
      start = new Date(0);
      prevStart = new Date(0);
      prevEnd = new Date(0);
      break;
    }
  }

  return {
    start: start.toISOString(),
    end,
    prevStart: prevStart.toISOString(),
    prevEnd: prevEnd.toISOString(),
  };
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
    const range = (url.searchParams.get("range") || "current_month") as RangeKey;
    const dates = getDateRange(range);

    // 1. Current paying subscriptions (active, non-trial)
    const { data: activeSubs } = await adminClient
      .from("subscriptions")
      .select("user_id, plan, status")
      .eq("status", "active")
      .in("plan", ["monthly", "yearly"]);

    const payingUsersCount = activeSubs?.length ?? 0;

    // 2. Link paying users to couples
    const payingUserIds = (activeSubs || []).map((s) => s.user_id);
    let payingCouplesCount = 0;
    if (payingUserIds.length > 0) {
      const { count } = await adminClient
        .from("couples")
        .select("id", { count: "exact", head: true })
        .not("user_b_id", "is", null)
        .eq("active", true)
        .or(`user_a_id.in.(${payingUserIds.join(",")}),user_b_id.in.(${payingUserIds.join(",")})`);
      payingCouplesCount = count ?? 0;
    }

    // 3. MRR: sum of monthly prices for active paid subscriptions
    let mrr = 0;
    for (const sub of activeSubs || []) {
      if (sub.plan === "monthly") mrr += MONTHLY_PRICE;
      else if (sub.plan === "yearly") mrr += YEARLY_MONTHLY_EQUIV;
    }
    const arr = mrr * 12;

    // 4. Total users
    const { count: totalUsers } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true });

    // 5. Total paired couples
    const { count: totalPairedCouples } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .not("user_b_id", "is", null)
      .eq("active", true);

    // 6. Active couples this week (activity in last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: activeWeekCouples } = await adminClient
      .from("activity_events")
      .select("couple_id")
      .gte("created_at", weekAgo);
    const activeWeekSet = new Set((activeWeekCouples || []).map((e) => e.couple_id).filter(Boolean));

    // Also check chat messages for activity
    const { data: activeWeekChat } = await adminClient
      .from("chat_messages")
      .select("couple_id")
      .is("deleted_at", null)
      .gte("created_at", weekAgo);
    (activeWeekChat || []).forEach((m) => { if (m.couple_id) activeWeekSet.add(m.couple_id); });

    const activeCouplesWeek = activeWeekSet.size;

    // 7. Active couples this month (activity in last 30 days)
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: activeMonthCouples } = await adminClient
      .from("activity_events")
      .select("couple_id")
      .gte("created_at", monthAgo);
    const activeMonthSet = new Set((activeMonthCouples || []).map((e) => e.couple_id).filter(Boolean));
    const { data: activeMonthChat } = await adminClient
      .from("chat_messages")
      .select("couple_id")
      .is("deleted_at", null)
      .gte("created_at", monthAgo);
    (activeMonthChat || []).forEach((m) => { if (m.couple_id) activeMonthSet.add(m.couple_id); });
    const activeCouplesMonth = activeMonthSet.size;

    // 8. New paying couples in range (from subscription_events)
    let newPayingCount = 0;
    if (range !== "lifetime") {
      const { data: newSubEvents } = await adminClient
        .from("subscription_events")
        .select("user_id, couple_id")
        .in("event_type", ["subscription_started", "trial_converted"])
        .gte("occurred_at", dates.start)
        .lte("occurred_at", dates.end);
      const newCoupleSet = new Set((newSubEvents || []).map((e) => e.couple_id).filter(Boolean));
      newPayingCount = newCoupleSet.size;
    } else {
      newPayingCount = payingCouplesCount;
    }

    // 9. Previous period MRR for growth calculation
    let prevMrr = 0;
    if (range !== "lifetime") {
      // Count subscriptions that were active at the end of the previous period
      const { data: prevSubs } = await adminClient
        .from("subscriptions")
        .select("plan, status, started_at, expires_at")
        .in("plan", ["monthly", "yearly"]);

      for (const sub of prevSubs || []) {
        const started = new Date(sub.started_at).getTime();
        const prevEndMs = new Date(dates.prevEnd).getTime();
        const expires = sub.expires_at ? new Date(sub.expires_at).getTime() : Infinity;

        if (started <= prevEndMs && expires > prevEndMs) {
          if (sub.plan === "monthly") prevMrr += MONTHLY_PRICE;
          else if (sub.plan === "yearly") prevMrr += YEARLY_MONTHLY_EQUIV;
        }
      }
    }

    const mrrGrowth = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 1000) / 10 : (mrr > 0 ? 100 : 0);

    // 10. Trial conversion rate from subscription_events
    const { count: trialsStarted } = await adminClient
      .from("subscription_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "trial_started")
      .gte("occurred_at", dates.start)
      .lte("occurred_at", dates.end);

    const { count: trialsConverted } = await adminClient
      .from("subscription_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "trial_converted")
      .gte("occurred_at", dates.start)
      .lte("occurred_at", dates.end);

    const trialConversionRate = trialsStarted && trialsStarted > 0
      ? Math.round((trialsConverted / trialsStarted) * 1000) / 10
      : 0;

    // 11. Churn: cancellations in range
    const { count: cancellations } = await adminClient
      .from("subscription_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "cancelled")
      .gte("occurred_at", dates.start)
      .lte("occurred_at", dates.end);

    // Paying couples at period start (for churn rate denominator)
    let payingAtStart = payingCouplesCount;
    if (range !== "lifetime") {
      const { data: prevSubs } = await adminClient
        .from("subscriptions")
        .select("plan, status, started_at, expires_at")
        .in("plan", ["monthly", "yearly"]);

      const prevStartMs = new Date(dates.start).getTime();
      const payingUserIdsAtStart = new Set<string>();
      for (const sub of prevSubs || []) {
        const started = new Date(sub.started_at).getTime();
        const expires = sub.expires_at ? new Date(sub.expires_at).getTime() : Infinity;
        if (started <= prevStartMs && expires > prevStartMs) {
          payingUserIdsAtStart.add(sub.user_id);
        }
      }
      // Count couples with at least one paying user
      if (payingUserIdsAtStart.size > 0) {
        const { count } = await adminClient
          .from("couples")
          .select("id", { count: "exact", head: true })
          .not("user_b_id", "is", null)
          .eq("active", true)
          .or(`user_a_id.in.(${Array.from(payingUserIdsAtStart).join(",")}),user_b_id.in.(${Array.from(payingUserIdsAtStart).join(",")})`);
        payingAtStart = count ?? 0;
      }
    }

    const monthlyChurn = payingAtStart > 0
      ? Math.round((cancellations / payingAtStart) * 1000) / 10
      : 0;
    const annualChurn = Math.min(monthlyChurn * 12, 100);

    // 12. ARPPU and LTV
    const arppu = payingCouplesCount > 0 ? Math.round((mrr / payingCouplesCount) * 100) / 100 : 0;
    const ltv = monthlyChurn > 0 ? Math.round((arppu / (monthlyChurn / 100)) * 100) / 100 : 0;

    // 13. Couple activation rate
    const coupleActivationRate = totalPairedCouples && totalPairedCouples > 0
      ? Math.round((activeCouplesWeek / totalPairedCouples) * 1000) / 10
      : 0;

    // 14. Partner invite acceptance rate
    const { count: totalWithInvite } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .not("invite_code", "is", null);

    const { count: pairedCount } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .not("user_b_id", "is", null);

    const inviteAcceptanceRate = totalWithInvite && totalWithInvite > 0
      ? Math.round((pairedCount / totalWithInvite) * 1000) / 10
      : 0;

    // 15. Monthly historical series for trends
    const { data: monthlyEvents } = await adminClient
      .from("subscription_events")
      .select("event_type, plan, occurred_at, metadata")
      .order("occurred_at", { ascending: true });

    // Build monthly MRR history
    const monthlyMap = new Map<string, { mrr: number; payingCouples: number; newPaying: number; cancellations: number; trialsStarted: number; trialsConverted: number }>();

    for (const evt of monthlyEvents || []) {
      const monthKey = evt.occurred_at.slice(0, 7); // YYYY-MM
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { mrr: 0, payingCouples: 0, newPaying: 0, cancellations: 0, trialsStarted: 0, trialsConverted: 0 });
      }
      const m = monthlyMap.get(monthKey)!;
      if (evt.event_type === "trial_started") m.trialsStarted++;
      if (evt.event_type === "trial_converted") { m.trialsConverted++; m.newPaying++; }
      if (evt.event_type === "subscription_started") m.newPaying++;
      if (evt.event_type === "cancelled") m.cancellations++;
    }

    // Compute MRR per month: count active subscriptions at end of each month
    const { data: allSubs } = await adminClient
      .from("subscriptions")
      .select("user_id, plan, status, started_at, expires_at");

    const now2 = new Date();
    for (let year = 2026; year <= now2.getFullYear(); year++) {
      const maxMonth = year === now2.getFullYear() ? now2.getMonth() : 11;
      for (let month = 0; month <= maxMonth; month++) {
        const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
        const monthEnd = new Date(year, month + 1, 1);
        monthEnd.setMilliseconds(-1);
        const monthEndMs = monthEnd.getTime();

        let monthMrr = 0;
        const payingUsersThisMonth = new Set<string>();
        for (const sub of allSubs || []) {
          const started = new Date(sub.started_at).getTime();
          const expires = sub.expires_at ? new Date(sub.expires_at).getTime() : Infinity;
          if (started <= monthEndMs && expires > monthEndMs && sub.plan in ["monthly", "yearly"]) {
            if (sub.plan === "monthly") monthMrr += MONTHLY_PRICE;
            else if (sub.plan === "yearly") monthMrr += YEARLY_MONTHLY_EQUIV;
            payingUsersThisMonth.add(sub.user_id);
          }
        }
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { mrr: 0, payingCouples: 0, newPaying: 0, cancellations: 0, trialsStarted: 0, trialsConverted: 0 });
        }
        const m = monthlyMap.get(monthKey)!;
        m.mrr = Math.round(monthMrr * 100) / 100;
        m.payingCouples = payingUsersThisMonth.size;
      }
    }

    const monthlyHistory = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 16. Subscription funnel
    const { count: totalSignups } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true });

    const { count: totalInvited } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .not("invite_code", "is", null);

    const { count: totalJoined } = await adminClient
      .from("couples")
      .select("id", { count: "exact", head: true })
      .not("user_b_id", "is", null);

    const { count: totalTrialsStarted } = await adminClient
      .from("subscription_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "trial_started");

    const { count: totalPaid } = await adminClient
      .from("subscription_events")
      .select("id", { count: "exact", head: true })
      .in("event_type", ["subscription_started", "trial_converted"]);

    const { count: totalCancelled } = await adminClient
      .from("subscription_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "cancelled");

    // D30/D90 retained: paid users who still have active subscription 30/90 days after first payment
    const { data: paidEvents } = await adminClient
      .from("subscription_events")
      .select("user_id, occurred_at")
      .in("event_type", ["subscription_started", "trial_converted"])
      .order("occurred_at", { ascending: true });

    let retainedD30 = 0;
    let retainedD90 = 0;
    const nowMs = Date.now();
    const seenUsers = new Set<string>();
    for (const evt of paidEvents || []) {
      if (seenUsers.has(evt.user_id)) continue;
      seenUsers.add(evt.user_id);
      const paidMs = new Date(evt.occurred_at).getTime();
      if (nowMs - paidMs >= 30 * 86400000) {
        // Check if still active
        const { data: stillActive } = await adminClient
          .from("subscriptions")
          .select("status, expires_at")
          .eq("user_id", evt.user_id)
          .in("plan", ["monthly", "yearly"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (stillActive?.status === "active" && (!stillActive.expires_at || new Date(stillActive.expires_at).getTime() > nowMs)) {
          retainedD30++;
          if (nowMs - paidMs >= 90 * 86400000) retainedD90++;
        }
      }
    }

    const funnel = {
      signups: totalSignups ?? 0,
      partnerInvited: totalInvited ?? 0,
      partnerJoined: totalJoined ?? 0,
      coupleActivated: activeCouplesMonth,
      trialStarted: totalTrialsStarted ?? 0,
      paid: totalPaid ?? 0,
      retainedD30: retainedD30,
      retainedD90: retainedD90,
      cancelled: totalCancelled ?? 0,
    };

    return new Response(
      JSON.stringify({
        range,
        payingCouples: payingCouplesCount,
        activeCouplesWeek,
        activeCouplesMonth,
        totalUsers: totalUsers ?? 0,
        totalPairedCouples: totalPairedCouples ?? 0,
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        mrrGrowth,
        prevMrr: Math.round(prevMrr * 100) / 100,
        newPayingCouples: newPayingCount,
        trialConversionRate,
        trialsStarted: trialsStarted ?? 0,
        trialsConverted: trialsConverted ?? 0,
        monthlyChurn,
        annualChurn,
        cancellations: cancellations ?? 0,
        arppu,
        ltv,
        coupleActivationRate,
        inviteAcceptanceRate,
        monthlyHistory,
        funnel,
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
