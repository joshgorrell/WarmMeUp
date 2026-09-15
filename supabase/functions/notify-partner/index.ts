import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALWAYS_SHOW_EVENTS = new Set([
  "partner_disconnected",
  "partner_joined",
  "partner_request",
  "invite_trial_expired",
  "invite_trial_reminder",
]);

const SYSTEM_EVENT_LABELS: Record<string, string> = {
  partner_disconnected: "Your partner ended the connection.",
  partner_joined: "Your partner just joined! Your space is ready.",
  partner_request: "Your partner accepted your invite and is ready to join you!",
  invite_trial_expired: "Your trial has ended! Subscribe now to confirm your partner's connection request.",
  invite_trial_reminder: "Your partner is still waiting! Subscribe now to confirm your connection.",
};

function mediaActivityLabel(mediaType?: string | null, storagePath?: string | null): string {
  const path = (storagePath ?? "").toLowerCase();
  if (path.endsWith(".gif")) return "New GIF";
  if (mediaType === "video") return "New Video";
  return "New Picture";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { event_type, couple_id, target_route, item_id } = body as {
      event_type: string; couple_id: string; target_route?: string; item_id?: string;
    };
    if (!event_type || !couple_id) return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const coupleQuery = adminClient.from("couples").select("user_a_id, user_b_id, pending_partner_id, pending_partner_status").eq("id", couple_id);
    const pendingEvents = new Set(["partner_request", "invite_trial_expired", "invite_trial_reminder"]);
    if (event_type !== "partner_disconnected" && !pendingEvents.has(event_type)) coupleQuery.eq("active", true);
    const { data: couple, error: coupleError } = await coupleQuery.maybeSingle();
    if (coupleError || !couple) return new Response(JSON.stringify({ error: "Couple not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const isPendingEvent = pendingEvents.has(event_type);
    const isCoupleMember = isPendingEvent
      ? (couple.pending_partner_id === user.id && (couple.pending_partner_status === "pending" || couple.pending_partner_status === "b_accepted"))
      : (couple.user_a_id === user.id || couple.user_b_id === user.id);
    if (!isCoupleMember) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const partnerId = isPendingEvent ? couple.user_a_id : (couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id);
    if (!partnerId) return new Response(JSON.stringify({ ok: true, skipped: "no_partner" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [{ data: partnerProfile }, { data: partnerSettings }] = await Promise.all([
      adminClient.from("profiles").select("push_token").eq("id", partnerId).maybeSingle(),
      adminClient.from("user_settings").select("push_notifications_enabled, discreet_notifications").eq("user_id", partnerId).maybeSingle(),
    ]);

    if (!partnerSettings?.push_notifications_enabled && !ALWAYS_SHOW_EVENTS.has(event_type)) return new Response(JSON.stringify({ ok: true, skipped: "notifications_disabled" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!partnerProfile?.push_token) return new Response(JSON.stringify({ ok: true, skipped: "no_push_token" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const isSystemEvent = ALWAYS_SHOW_EVENTS.has(event_type);
    const isDiscreet = !isSystemEvent && (partnerSettings?.discreet_notifications ?? true);
    let activityLabel = "New Activity";

    // With Discreet OFF, identify only the activity type. Never include sender
    // names, message text, captions, emoji/reaction content, or media previews.
    if (!isDiscreet && !isSystemEvent) {
      if (event_type === "new_message") {
        const { data: latestMessage } = await adminClient
          .from("chat_messages")
          .select("media_type, media_storage_path")
          .eq("couple_id", couple_id)
          .eq("sender_id", user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        activityLabel = latestMessage?.media_storage_path
          ? mediaActivityLabel(latestMessage.media_type, latestMessage.media_storage_path)
          : "New Message";
      } else if (event_type === "new_vault_item") {
        let vaultItem: { media_type?: string | null; storage_path?: string | null } | null = null;
        if (item_id) {
          const result = await adminClient.from("vault_items").select("media_type, storage_path").eq("id", item_id).maybeSingle();
          vaultItem = result.data;
        }
        activityLabel = vaultItem ? mediaActivityLabel(vaultItem.media_type, vaultItem.storage_path) : "New Activity";
      } else if (event_type === "new_dare") {
        activityLabel = "New Dare";
      } else if (event_type === "new_wish") {
        activityLabel = "New Wish";
      }
    }

    const title = "Warm Me Up";
    const bodyText = isSystemEvent
      ? (SYSTEM_EVENT_LABELS[event_type] ?? "New Activity")
      : isDiscreet
        ? "New Activity"
        : activityLabel;

    const expoPayload = {
      to: partnerProfile.push_token,
      title,
      body: bodyText,
      data: { event_type, couple_id, target_route: target_route ?? null, item_id: item_id ?? null },
      sound: "default",
    };

    console.log("[notify-partner] Sending push payload:", JSON.stringify({
      to_prefix: (partnerProfile.push_token ?? "").slice(0, 30) + "...",
      title: expoPayload.title,
      body: expoPayload.body,
      sound: expoPayload.sound,
      data: expoPayload.data,
    }));

    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expoPayload),
    });
    let ticket: any = null;
    let ticketId: string | null = null;
    try {
      const pushJson = await pushRes.json() as any;
      ticket = pushJson?.data ?? null;
      ticketId = ticket?.id ?? null;
      console.log("[notify-partner] Expo ticket:", JSON.stringify(ticket));
    } catch (e: any) {
      console.error("[notify-partner] Failed to parse Expo push response:", e?.message ?? String(e));
    }

    if (ticket?.status === "error") {
      const expoError = ticket?.details?.error ?? "unknown";
      if (expoError === "DeviceNotRegistered") await adminClient.from("profiles").update({ push_token: null }).eq("id", partnerId);
      else console.error(`[notify-partner] Expo push error: ${expoError}`, JSON.stringify(ticket));
    } else if (!pushRes.ok) {
      console.error(`[notify-partner] Expo push HTTP ${pushRes.status} — non-ok response`);
    }

    return new Response(JSON.stringify({ ok: true, expo_status: ticket?.status ?? null, ticket_id: ticketId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[notify-partner] Unhandled error:", err?.message ?? String(err));
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
