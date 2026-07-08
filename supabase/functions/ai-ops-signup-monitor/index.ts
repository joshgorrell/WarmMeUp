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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isCron = token === serviceRoleKey;

    if (!isCron) {
      // Verify the calling user is an admin
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
      loop_type: "signup_monitor",
      started_at: startedAt,
      status: "running",
    });

    const checks: Record<string, { pass: boolean; detail: string }> = {};

    // Check 1: Auth endpoint reachable
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(5000),
      });
      checks.auth_endpoint = { pass: res.ok, detail: `HTTP ${res.status}` };
    } catch (e: any) {
      checks.auth_endpoint = { pass: false, detail: e?.message ?? "unreachable" };
    }

    // Check 2: Profiles table is readable (signup writes here)
    try {
      const { count, error } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true });
      checks.profiles_readable = {
        pass: !error,
        detail: error ? error.message : `${count ?? 0} rows`,
      };
    } catch (e: any) {
      checks.profiles_readable = { pass: false, detail: e?.message ?? "error" };
    }

    // Check 3: Couples table is readable (partner invite writes here)
    try {
      const { count, error } = await admin
        .from("couples")
        .select("id", { count: "exact", head: true });
      checks.couples_readable = {
        pass: !error,
        detail: error ? error.message : `${count ?? 0} rows`,
      };
    } catch (e: any) {
      checks.couples_readable = { pass: false, detail: e?.message ?? "error" };
    }

    // Check 4: Subscriptions table readable (trial/subscription writes here)
    try {
      const { count, error } = await admin
        .from("subscriptions")
        .select("user_id", { count: "exact", head: true });
      checks.subscriptions_readable = {
        pass: !error,
        detail: error ? error.message : `${count ?? 0} rows`,
      };
    } catch (e: any) {
      checks.subscriptions_readable = { pass: false, detail: e?.message ?? "error" };
    }

    // Check 5: Recent signup activity (at least 1 profile in last 30 days signals pipeline is live)
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", thirtyDaysAgo);
      checks.recent_signup_activity = {
        pass: !error && (count ?? 0) > 0,
        detail: error ? error.message : `${count ?? 0} signups in last 30 days`,
      };
    } catch (e: any) {
      checks.recent_signup_activity = { pass: false, detail: e?.message ?? "error" };
    }

    const failedChecks = Object.entries(checks).filter(([, v]) => !v.pass);
    const allPassed = failedChecks.length === 0;
    const completedAt = new Date().toISOString();

    // Update or clear the alert in app_config
    const alertValue = allPassed
      ? null
      : {
          failed_checks: failedChecks.map(([k, v]) => ({ check: k, detail: v.detail })),
          detected_at: completedAt,
        };

    if (!allPassed) {
      // Upsert the alert key
      const { data: existing } = await admin
        .from("app_config")
        .select("key")
        .eq("key", "aiops_signup_alert")
        .maybeSingle();
      if (existing) {
        await admin.from("app_config").update({
          value: alertValue,
          updated_at: completedAt,
        }).eq("key", "aiops_signup_alert");
      } else {
        await admin.from("app_config").insert({
          key: "aiops_signup_alert",
          value: alertValue,
          updated_at: completedAt,
        });
      }
    } else {
      // Clear the alert
      await admin.from("app_config").delete().eq("key", "aiops_signup_alert");
    }

    // Record loop run result
    await admin.from("ai_loop_runs").update({
      completed_at: completedAt,
      status: "success",
      stop_condition_met: true,
      success_condition_met: allPassed,
      findings: { checks, all_passed: allPassed },
    }).eq("id", runId);

    // Update last_triggered_at
    await admin.from("ai_loop_settings").update({
      last_triggered_at: completedAt,
    }).eq("loop_type", "signup_monitor");

    return new Response(
      JSON.stringify({ ok: true, all_passed: allPassed, checks }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[ai-ops-signup-monitor] Unhandled error:", err?.message ?? String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
