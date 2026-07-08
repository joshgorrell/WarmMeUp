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
      loop_type: "bug_analyzer",
      started_at: startedAt,
      status: "running",
    });

    // Gather diagnostics snapshots from the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: diagnosticsRows } = await admin
      .from("user_diagnostics")
      .select("user_id, email, snapshot, captured_at")
      .gte("captured_at", sevenDaysAgo)
      .order("captured_at", { ascending: false })
      .limit(100);

    // Gather recent failed loop runs
    const { data: failedRuns } = await admin
      .from("ai_loop_runs")
      .select("loop_type, started_at, error_message, findings")
      .eq("status", "failed")
      .gte("started_at", sevenDaysAgo)
      .order("started_at", { ascending: false })
      .limit(20);

    // Get open issues titles to avoid duplicates
    const { data: openIssues } = await admin
      .from("ai_issues")
      .select("title")
      .eq("status", "open");
    const openIssueTitles = new Set((openIssues ?? []).map((i: any) => i.title.toLowerCase()));

    const diagnosticsSummary = (diagnosticsRows ?? []).map((row: any) => {
      const snap = row.snapshot ?? {};
      return {
        email: row.email,
        captured_at: row.captured_at,
        auth_status: snap.auth_status,
        last_auth_error: snap.last_auth_error,
        last_signup_error: snap.last_signup_error,
        push_token_status: snap.push_token_status,
        subscription_status: snap.subscription_status,
        app_version: snap.app_version,
        ota_update_id: snap.ota_update_id,
        platform: snap.platform,
        network_supabase_reachable: snap.network_supabase_reachable,
        app_events: snap.app_events ?? [],
      };
    });

    const completedAt = new Date().toISOString();

    if (diagnosticsSummary.length === 0 && (!failedRuns || failedRuns.length === 0)) {
      await admin.from("ai_loop_runs").update({
        completed_at: completedAt,
        status: "success",
        stop_condition_met: true,
        success_condition_met: true,
        findings: { message: "No diagnostic data in last 7 days", issues_created: 0 },
      }).eq("id", runId);

      await admin.from("ai_loop_settings").update({
        last_triggered_at: completedAt,
      }).eq("loop_type", "bug_analyzer");

      return new Response(
        JSON.stringify({ ok: true, issues_created: 0, message: "No data to analyze" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!openAiKey) {
      await admin.from("ai_loop_runs").update({
        completed_at: completedAt,
        status: "failed",
        stop_condition_met: true,
        success_condition_met: false,
        error_message: "OPENAI_API_KEY not configured",
      }).eq("id", runId);
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are a mobile app bug analyzer for "Warm Me Up", a couples intimacy app built with React Native + Expo + Supabase.

You will receive diagnostic snapshots from users and failed system run logs. Your job is to:
1. Identify patterns across multiple users (not one-off issues).
2. Group similar errors together.
3. Surface the top 3 actionable issues worth tracking.
4. For each issue, suggest a severity: low, medium, or high.

Respond ONLY with valid JSON in this exact shape:
{
  "issues": [
    {
      "title": "Short descriptive title (max 80 chars)",
      "body": "2-3 sentence description: what is happening, which users/versions are affected, and why it matters.",
      "severity": "low" | "medium" | "high"
    }
  ],
  "summary": "1-2 sentence overall summary of app health"
}

Rules:
- Only include issues that affect multiple users or are clearly systemic.
- Do not create issues for one-off user errors.
- Titles must be specific enough to be actionable.
- Do not include user emails or PII in issue bodies.
- If there are no real issues, return an empty issues array.`;

    const userMessage = JSON.stringify({
      diagnostics_count: diagnosticsSummary.length,
      diagnostics: diagnosticsSummary,
      failed_runs: failedRuns ?? [],
      existing_open_issues: Array.from(openIssueTitles),
    });

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
          { role: "user", content: userMessage },
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`OpenAI API error ${aiRes.status}: ${errText}`);
    }

    const aiJson = await aiRes.json() as any;
    const rawContent = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { issues?: any[]; summary?: string };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { issues: [], summary: "Could not parse AI response" };
    }

    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    let issuesCreated = 0;

    for (const issue of issues) {
      if (!issue.title || typeof issue.title !== "string") continue;
      // Skip if an open issue with the same title already exists (case-insensitive)
      if (openIssueTitles.has(issue.title.toLowerCase())) continue;

      await admin.from("ai_issues").insert({
        title: issue.title.slice(0, 200),
        body: issue.body ?? null,
        severity: ["low", "medium", "high"].includes(issue.severity) ? issue.severity : "medium",
        source_loop_type: "bug_analyzer",
        source_run_id: runId,
        status: "open",
      });
      issuesCreated++;
    }

    const finalCompletedAt = new Date().toISOString();
    await admin.from("ai_loop_runs").update({
      completed_at: finalCompletedAt,
      status: "success",
      stop_condition_met: true,
      success_condition_met: true,
      findings: {
        diagnostics_analyzed: diagnosticsSummary.length,
        issues_created: issuesCreated,
        summary: parsed.summary ?? null,
        issues,
      },
    }).eq("id", runId);

    await admin.from("ai_loop_settings").update({
      last_triggered_at: finalCompletedAt,
    }).eq("loop_type", "bug_analyzer");

    return new Response(
      JSON.stringify({ ok: true, issues_created: issuesCreated, summary: parsed.summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[ai-ops-bug-analyzer] Unhandled error:", err?.message ?? String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
