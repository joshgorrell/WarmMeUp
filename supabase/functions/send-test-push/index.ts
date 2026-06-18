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

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json() as {
      target: "self" | "partner";
      couple_id: string;
      force?: boolean;
    };

    const { target, couple_id, force } = body;
    if (!target || !couple_id) return json({ error: "Missing required fields" }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Resolve target user ID
    let targetUserId: string;

    if (target === "self") {
      targetUserId = user.id;
    } else {
      // partner — verify couple membership
      const { data: couple, error: coupleError } = await adminClient
        .from("couples")
        .select("user_a_id, user_b_id")
        .eq("id", couple_id)
        .eq("active", true)
        .maybeSingle();

      if (coupleError || !couple) return json({ error: "Couple not found" }, 404);

      const isCoupleMember = couple.user_a_id === user.id || couple.user_b_id === user.id;
      if (!isCoupleMember) return json({ error: "Forbidden" }, 403);

      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      if (!partnerId) {
        return json({ ok: true, skipped: "no_partner", target_user_id: null, token_present: false });
      }
      targetUserId = partnerId;
    }

    // Fetch target profile and settings
    const [{ data: targetProfile }, { data: targetSettings }] = await Promise.all([
      adminClient.from("profiles").select("push_token").eq("id", targetUserId).maybeSingle(),
      adminClient.from("user_settings").select("push_notifications_enabled").eq("user_id", targetUserId).maybeSingle(),
    ]);

    const tokenPresent = !!targetProfile?.push_token;
    const notificationsEnabled = targetSettings?.push_notifications_enabled ?? false;

    // For partner target, respect push_notifications_enabled unless force=true AND caller is super_admin
    if (target === "partner" && !notificationsEnabled) {
      if (force) {
        // Verify super_admin before bypassing
        const { data: callerProfile } = await adminClient
          .from("profiles")
          .select("is_super_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (!callerProfile?.is_super_admin) {
          return json({
            ok: true,
            skipped: "notifications_disabled",
            target_user_id: targetUserId,
            token_present: tokenPresent,
            partner_enabled: false,
          });
        }
        // super_admin force — fall through to send
      } else {
        return json({
          ok: true,
          skipped: "notifications_disabled",
          target_user_id: targetUserId,
          token_present: tokenPresent,
          partner_enabled: false,
        });
      }
    }

    if (!tokenPresent) {
      return json({
        ok: true,
        skipped: "no_push_token",
        target_user_id: targetUserId,
        token_present: false,
        partner_enabled: notificationsEnabled,
      });
    }

    // Send via Expo push API
    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: targetProfile!.push_token,
        title: "Warm Me Up",
        body: target === "self"
          ? "[Debug] Self push test — end-to-end"
          : "[Debug] Partner push test — forced by admin",
        data: { event_type: "debug_test", couple_id },
        sound: "default",
      }),
    });

    let expoTicket: any = null;
    let expoStatus: string | null = null;
    let expoError: string | null = null;

    try {
      const pushJson = await pushRes.json() as any;
      expoTicket = pushJson?.data ?? null;
      expoStatus = expoTicket?.status ?? null;

      // Clear stale token if Expo reports the device is gone
      if (expoTicket?.status === "error" && expoTicket?.details?.error === "DeviceNotRegistered") {
        await adminClient.from("profiles").update({ push_token: null }).eq("id", targetUserId);
      }
    } catch (e: any) {
      expoError = e?.message ?? "Failed to parse Expo response";
    }

    return json({
      ok: true,
      target_user_id: targetUserId,
      token_present: tokenPresent,
      partner_enabled: notificationsEnabled,
      expo_http_status: pushRes.status,
      expo_status: expoStatus,
      expo_ticket: expoTicket,
      expo_error: expoError,
    });
  } catch (err: any) {
    return json({ error: "Internal server error", detail: err?.message ?? String(err) }, 500);
  }
});
