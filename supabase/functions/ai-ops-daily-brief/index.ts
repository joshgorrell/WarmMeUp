import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const openAiKey = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isCron = token === serviceRoleKey;

    if (!isCron) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
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
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    await admin.from("ai_loop_runs").insert({
      id: runId,
      loop_type: "daily_brief",
      started_at: startedAt,
      status: "running",
    });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Collect all stats in parallel
    const [
      { count: newUsers24h },
      { count: totalUsers },
      { count: activeCouples },
      { count: totalCouples },
      { data: subscriptionRows },
      { count: interactions24h },
      { count: pushFailures24h },
      { data: diagnosticsRows },
      { data: openIssues },
      { data: recentRuns },
    ] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("couples").select("id", { count: "exact", head: true }).eq("active", true).not("user_b_id", "is", null),
      admin.from("couples").select("id", { count: "exact", head: true }),
      admin.from("subscriptions").select("status, created_at").gte("created_at", oneDayAgo),
      admin.from("interactions").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      // Count push notification failures by checking ai_loop_runs for signup_monitor failures
      admin.from("ai_loop_runs").select("id", { count: "exact", head: true }).eq("loop_type", "signup_monitor").eq("status", "failed").gte("started_at", oneDayAgo),
      // Recent diagnostics with errors
      admin.from("user_diagnostics").select("snapshot, captured_at").gte("captured_at", oneDayAgo).limit(50),
      // Open issues
      admin.from("ai_issues").select("title, severity, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(10),
      // Recent loop runs
      admin.from("ai_loop_runs").select("loop_type, status, completed_at").gte("started_at", sevenDaysAgo).order("started_at", { ascending: false }).limit(20),
    ]);

    // Tally subscription activity
    const newTrials = (subscriptionRows ?? []).filter((s: any) => s.status === "trialing").length;
    const newPaid = (subscriptionRows ?? []).filter((s: any) => s.status === "active").length;
    const newCancelled = (subscriptionRows ?? []).filter((s: any) => s.status === "canceled").length;

    // Count diagnostic error patterns
    const authErrors = (diagnosticsRows ?? []).filter((r: any) => {
      const snap = r.snapshot ?? {};
      return snap.last_auth_error || snap.last_signup_error;
    }).length;
    const pushIssues = (diagnosticsRows ?? []).filter((r: any) => {
      const snap = r.snapshot ?? {};
      return snap.push_token_status && snap.push_token_status !== "registered" && snap.push_token_status !== "unknown";
    }).length;
    const networkIssues = (diagnosticsRows ?? []).filter((r: any) => {
      const snap = r.snapshot ?? {};
      return snap.network_supabase_reachable && snap.network_supabase_reachable.includes("unreachable");
    }).length;

    const stats = {
      new_users_24h: newUsers24h ?? 0,
      total_users: totalUsers ?? 0,
      active_couples: activeCouples ?? 0,
      total_couples: totalCouples ?? 0,
      interactions_24h: interactions24h ?? 0,
      new_trials_24h: newTrials,
      new_paid_24h: newPaid,
      new_cancellations_24h: newCancelled,
      diagnostic_auth_errors_24h: authErrors,
      diagnostic_push_issues_24h: pushIssues,
      diagnostic_network_issues_24h: networkIssues,
      open_issues_count: (openIssues ?? []).length,
      open_issues: (openIssues ?? []).slice(0, 5).map((i: any) => ({ title: i.title, severity: i.severity })),
    };

    const completedAt = new Date().toISOString();

    if (!openAiKey) {
      // Return raw stats without AI narrative
      await admin.from("ai_loop_runs").update({
        completed_at: completedAt,
        status: "success",
        stop_condition_met: true,
        success_condition_met: true,
        findings: { stats, narrative: null, top_issue: null, note: "OPENAI_API_KEY not configured — raw stats only" },
      }).eq("id", runId);

      await admin.from("ai_loop_settings").update({
        last_triggered_at: completedAt,
      }).eq("loop_type", "daily_brief");

      return new Response(
        JSON.stringify({ ok: true, stats, narrative: null, top_issue: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are an AI product analyst for "Warm Me Up", a couples intimacy app (React Native + Expo + Supabase).

Given 24-hour product metrics, write a concise daily brief for the founder/admin. Be honest and direct — no fluff.

Respond ONLY with valid JSON in this exact shape:
{
  "headline": "One-line summary of the most important thing happening today (max 100 chars)",
  "narrative": "2-3 sentence plain-English summary of the last 24 hours. What's working, what's concerning.",
  "top_issue": "The single most important issue to address today, or null if nothing is urgent",
  "top_issue_severity": "low" | "medium" | "high" | null
}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(stats) },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    let narrative: string | null = null;
    let headline: string | null = null;
    let topIssue: string | null = null;

    if (aiRes.ok) {
      const aiJson = await aiRes.json() as any;
      const rawContent = aiJson?.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(rawContent);
        headline = parsed.headline ?? null;
        narrative = parsed.narrative ?? null;
        topIssue = parsed.top_issue ?? null;
      } catch {
        // leave null
      }
    }

    const finalCompletedAt = new Date().toISOString();
    await admin.from("ai_loop_runs").update({
      completed_at: finalCompletedAt,
      status: "success",
      stop_condition_met: true,
      success_condition_met: true,
      findings: { stats, headline, narrative, top_issue: topIssue },
    }).eq("id", runId);

    await admin.from("ai_loop_settings").update({
      last_triggered_at: finalCompletedAt,
    }).eq("loop_type", "daily_brief");

    return new Response(
      JSON.stringify({ ok: true, stats, headline, narrative, top_issue: topIssue }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[ai-ops-daily-brief] Unhandled error:", err?.message ?? String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
