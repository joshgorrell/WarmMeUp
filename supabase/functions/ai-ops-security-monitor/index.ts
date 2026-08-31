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
      loop_type: "security_anomaly_monitor",
      started_at: startedAt,
      status: "running",
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch security events from the last 7 days
    const { data: securityEvents } = await admin
      .from("security_events")
      .select("event_type, user_id, detail, created_at")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(500);

    // Aggregate event counts by type and by user
    const events = securityEvents ?? [];
    const byType: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    for (const ev of events) {
      byType[ev.event_type] = (byType[ev.event_type] ?? 0) + 1;
      if (ev.user_id) {
        byUser[ev.user_id] = (byUser[ev.user_id] ?? 0) + 1;
      }
    }

    // Users with 3+ security events in the window (potential abuse signal)
    const flaggedUsers = Object.entries(byUser)
      .filter(([, count]) => count >= 3)
      .map(([userId, count]) => ({ user_ref: userId, event_count: count }));

    const stats = {
      total_events_7d: events.length,
      events_by_type: byType,
      flagged_users: flaggedUsers,
    };

    const completedAt = new Date().toISOString();

    if (!openAiKey) {
      await admin.from("ai_loop_runs").update({
        completed_at: completedAt,
        status: "success",
        stop_condition_met: true,
        success_condition_met: true,
        findings: { stats, narrative: null, issues: [], note: "OPENAI_API_KEY not configured — raw stats only" },
      }).eq("id", runId);

      await admin.from("ai_loop_settings").update({
        last_triggered_at: completedAt,
      }).eq("loop_type", "security_anomaly_monitor");

      return new Response(
        JSON.stringify({ ok: true, stats, narrative: null, issues_created: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are an AI security analyst for "Warm Me Up", a couples intimacy app (React Native + Expo + Supabase).

Given 7 days of security event data, identify suspicious patterns that warrant admin attention. Focus on:
- Repeated admin self-elevation attempts (potential privilege escalation)
- Invite rate-limiting triggered frequently (potential brute-force or abuse)
- Users with 3+ security events (potential bad actors)

Respond ONLY with valid JSON in this exact shape:
{
  "narrative": "2-3 sentence summary of security posture this week",
  "issues": [
    {
      "title": "Short title (max 120 chars)",
      "body": "Detailed description with specific numbers and user refs",
      "severity": "low" | "medium" | "high"
    }
  ]
}

Only include issues that represent genuine security concerns. If nothing is concerning, return an empty issues array.`;

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
        max_tokens: 600,
        temperature: 0.3,
      }),
    });

    let narrative: string | null = null;
    let issues: any[] = [];

    if (aiRes.ok) {
      const aiJson = await aiRes.json() as any;
      const rawContent = aiJson?.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(rawContent);
        narrative = parsed.narrative ?? null;
        issues = Array.isArray(parsed.issues) ? parsed.issues : [];
      } catch {
        // leave defaults
      }
    }

    // Get open + pending_review issue titles to avoid duplicates
    const { data: openIssues } = await admin
      .from("ai_issues")
      .select("title")
      .in("status", ["open", "pending_review"]);
    const openIssueTitles = new Set((openIssues ?? []).map((i: any) => i.title.toLowerCase()));

    // Check whether this loop type requires human approval
    const { data: loopSetting } = await admin
      .from("ai_loop_settings")
      .select("require_human_approval")
      .eq("loop_type", "security_anomaly_monitor")
      .maybeSingle();
    const requireHumanApproval = loopSetting?.require_human_approval ?? false;

    let issuesCreated = 0;
    for (const issue of issues) {
      if (!issue.title || typeof issue.title !== "string") continue;
      if (openIssueTitles.has(issue.title.toLowerCase())) continue;

      await admin.from("ai_issues").insert({
        title: issue.title.slice(0, 200),
        body: issue.body ?? null,
        severity: ["low", "medium", "high"].includes(issue.severity) ? issue.severity : "medium",
        source_loop_type: "security_anomaly_monitor",
        source_run_id: runId,
        status: requireHumanApproval ? "pending_review" : "open",
      });
      issuesCreated++;
    }

    const finalCompletedAt = new Date().toISOString();
    await admin.from("ai_loop_runs").update({
      completed_at: finalCompletedAt,
      status: "success",
      stop_condition_met: true,
      success_condition_met: true,
      findings: { stats, narrative, issues_created: issuesCreated },
    }).eq("id", runId);

    await admin.from("ai_loop_settings").update({
      last_triggered_at: finalCompletedAt,
    }).eq("loop_type", "security_anomaly_monitor");

    return new Response(
      JSON.stringify({ ok: true, stats, narrative, issues_created: issuesCreated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[ai-ops-security-monitor] Unhandled error:", err?.message ?? String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
