import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { prepareBurn, processBurnJob } from '../_shared/contentBurn.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Verify the caller's JWT
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Look up the caller's couple (must be active)
    const { data: couple, error: coupleError } = await admin
      .from("couples")
      .select("id, user_a_id, user_b_id")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .eq("active", true)
      .maybeSingle();

    if (coupleError || !couple) {
      return new Response(JSON.stringify({ error: "No active couple found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;

    // ── 1. Send partner notification BEFORE wiping (function checks active couple) ──
    if (partnerId) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-partner`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            Apikey: anonKey,
          },
          body: JSON.stringify({
            event_type: "partner_disconnected",
            couple_id: couple.id,
          }),
        });
      } catch (notifErr) {
        console.error("[disconnect-couple] notify-partner failed:", String(notifErr));
      }
    }

    const jobId = await prepareBurn(admin,couple.id,user.id,'disconnect');
    let complete = false;
    try { complete = await processBurnJob(admin,jobId); } catch { /* durable retry worker owns cleanup */ }
    return new Response(JSON.stringify({ ok: complete, disconnected: true, pending: !complete, job_id: jobId, couple_id: couple.id }), {
      status: complete ? 200 : 202, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    console.error("[disconnect-couple] Unhandled error:", err?.message ?? String(err));
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
