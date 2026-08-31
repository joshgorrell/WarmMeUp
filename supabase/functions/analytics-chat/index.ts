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

    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      { count: totalMessages },
      { data: couplesWithMessages },
      { data: weekCouples },
      { count: totalActiveCouples },
    ] = await Promise.all([
      adminClient.from("chat_messages").select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      adminClient.from("chat_messages").select("couple_id").is("deleted_at", null),
      adminClient.from("chat_messages").select("couple_id").is("deleted_at", null)
        .gte("created_at", weekStart),
      adminClient.from("couples").select("id", { count: "exact", head: true })
        .eq("active", true).not("user_b_id", "is", null),
    ]);

    const uniqueCouples = new Set<string>();
    if (couplesWithMessages) {
      for (const m of couplesWithMessages) uniqueCouples.add(m.couple_id);
    }

    const weekActiveCouples = new Set<string>();
    if (weekCouples) {
      for (const m of weekCouples) weekActiveCouples.add(m.couple_id);
    }

    const pctChattedWeek = totalActiveCouples
      ? Math.round((weekActiveCouples.size / totalActiveCouples) * 100)
      : 0;

    return new Response(
      JSON.stringify({
        totalMessages: totalMessages ?? 0,
        activeCouples: uniqueCouples.size,
        pctChattedThisWeek: pctChattedWeek,
        privacyProtected: true,
        _ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
