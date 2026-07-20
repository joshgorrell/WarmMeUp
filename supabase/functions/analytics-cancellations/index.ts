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

    const url = new URL(req.url);
    const surveyType = url.searchParams.get("survey_type");

    // Build query for cancellation surveys
    let query = adminClient.from("cancellation_surveys").select("*");
    if (surveyType) query = query.eq("survey_type", surveyType);
    const { data: surveys } = await query;

    const totalSurveys = surveys?.length ?? 0;

    // Count by survey_type
    const byType: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    const byWouldReturn: Record<string, number> = {};
    const featureRequests: Record<string, number> = {};
    const neverUsed: Record<string, number> = {};

    if (surveys) {
      for (const s of surveys) {
        byType[s.survey_type] = (byType[s.survey_type] ?? 0) + 1;
        if (s.primary_reason) byReason[s.primary_reason] = (byReason[s.primary_reason] ?? 0) + 1;
        if (s.would_return) byWouldReturn[s.would_return] = (byWouldReturn[s.would_return] ?? 0) + 1;
        if (s.would_convince_feature) featureRequests[s.would_convince_feature] = (featureRequests[s.would_convince_feature] ?? 0) + 1;
        if (s.never_used_feature) neverUsed[s.never_used_feature] = (neverUsed[s.never_used_feature] ?? 0) + 1;
      }
    }

    // Top reasons sorted
    const topReasons = Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count }));

    // Most requested feature
    const mostRequestedFeature = Object.entries(featureRequests)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Most common never-used feature
    const mostCommonNeverUsed = Object.entries(neverUsed)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Subscription events for avg lengths
    const { data: subEvents } = await adminClient
      .from("subscription_events")
      .select("*")
      .order("occurred_at", { ascending: false });

    // Avg subscription length (from subscription_started to subscription_cancelled)
    let avgSubLength = 0;
    let avgTrialLength = 0;
    if (subEvents) {
      const startedMap = new Map<string, string>(); // user_id -> started_at
      const cancelledList: number[] = [];
      const trialStartedMap = new Map<string, string>();
      const trialExpiredList: number[] = [];

      for (const evt of subEvents) {
        if (evt.event_type === "subscription_started") {
          startedMap.set(evt.user_id, evt.occurred_at);
        } else if (evt.event_type === "subscription_cancelled") {
          const started = startedMap.get(evt.user_id);
          if (started) {
            cancelledList.push(Math.floor((new Date(evt.occurred_at).getTime() - new Date(started).getTime()) / 86400000));
          }
        } else if (evt.event_type === "trial_started") {
          trialStartedMap.set(evt.user_id, evt.occurred_at);
        } else if (evt.event_type === "trial_expired") {
          const started = trialStartedMap.get(evt.user_id);
          if (started) {
            trialExpiredList.push(Math.floor((new Date(evt.occurred_at).getTime() - new Date(started).getTime()) / 86400000));
          }
        }
      }

      if (cancelledList.length > 0) {
        avgSubLength = Math.round((cancelledList.reduce((a, b) => a + b, 0) / cancelledList.length) * 10) / 10;
      }
      if (trialExpiredList.length > 0) {
        avgTrialLength = Math.round((trialExpiredList.reduce((a, b) => a + b, 0) / trialExpiredList.length) * 10) / 10;
      }
    }

    return new Response(
      JSON.stringify({
        totalSurveys,
        byType,
        topReasons,
        byWouldReturn,
        mostRequestedFeature,
        mostCommonNeverUsed,
        avgSubscriptionLength: avgSubLength,
        avgTrialLength,
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
