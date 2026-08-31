import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    // ── 2. Delete storage files for this couple (chat_media + vault) ──
    // Must happen before the DB rows are wiped since we need the couple_id path.
    const PAGE = 100;

    async function deleteStorageFolder(bucket: string, prefix: string) {
      let offset = 0;
      while (true) {
        const { data: entries, error } = await admin.storage
          .from(bucket)
          .list(prefix, { limit: PAGE, offset });
        if (error || !entries?.length) break;

        const files = entries.filter((e) => e.id != null);
        const folders = entries.filter((e) => e.id == null);

        if (files.length) {
          const paths = files.map((f) => `${prefix}/${f.name}`);
          await admin.storage.from(bucket).remove(paths);
        }

        for (const folder of folders) {
          await deleteStorageFolder(bucket, `${prefix}/${folder.name}`);
        }

        if (entries.length < PAGE) break;
        if (files.length === 0) offset += PAGE;
      }
    }

    try {
      await deleteStorageFolder("chat_media", couple.id);
    } catch (err) {
      console.error("[disconnect-couple] chat_media cleanup failed:", String(err));
    }

    try {
      await deleteStorageFolder("vault", couple.id);
    } catch (err) {
      console.error("[disconnect-couple] vault cleanup failed:", String(err));
    }

    // ── 3. Call the server-side wipe function ──
    const { data: wipeResult, error: wipeError } = await admin
      .rpc("wipe_couple_data", {
        p_couple_id: couple.id,
        p_user_id: user.id,
      });

    if (wipeError) {
      console.error("[disconnect-couple] wipe_couple_data failed:", wipeError);
      return new Response(JSON.stringify({ error: "Failed to wipe couple data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      couple_id: couple.id,
      wiped: wipeResult,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[disconnect-couple] Unhandled error:", err?.message ?? String(err));
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
