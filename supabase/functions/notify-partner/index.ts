import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Event types and their corresponding default notification text.
 * The actual body sent to the device is controlled by the recipient's
 * discreet_notifications / notification_copy settings.
 */
const EVENT_LABELS: Record<string, string> = {
  new_message: "sent you a new message",
  new_vault_item: "added something to the Vault",
  new_dare: "sent you a dare",
  dare_accepted: "accepted your dare",
  dare_rejected: "declined your dare",
  dare_completed: "completed your dare",
  new_ask: "asked you something",
  ask_answered: "answered your question",
  new_wish: "added a new wish",
  wish_fulfilled: "fulfilled your wish",
  dice_roll: "sent you a dice challenge",
  dice_accepted: "accepted your dice challenge",
  dice_completed: "completed your dice challenge",
  send_love: "sent you",
  partner_disconnected: "ended the partner connection",
  partner_joined: "just joined! Your space is ready.",
  partner_request: "accepted your invite and is ready to join you!",
  invite_trial_expired: "Your trial has ended! Subscribe now to confirm your partner's connection request.",
  invite_trial_reminder: "Your partner is still waiting! Subscribe now to confirm your connection.",
};

// System events shown regardless of discreet_notifications setting
const ALWAYS_SHOW_EVENTS = new Set(["partner_disconnected", "partner_joined", "partner_request", "invite_trial_expired", "invite_trial_reminder"]);

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

    // Verify the calling user
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

    const body = await req.json();
    const { event_type, couple_id, target_route, item_id, emoji, message_text } = body as {
      event_type: string;
      couple_id: string;
      target_route?: string;
      item_id?: string;
      emoji?: string;
      message_text?: string;
    };

    if (!event_type || !couple_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // For partner_disconnected, the couple may already be inactive — query without active filter.
    // For partner_request, the couple is still a solo row (active=false) with only a pending request.
    // For all other events, require active couple for security.
    const coupleQuery = adminClient
      .from("couples")
      .select("user_a_id, user_b_id, pending_partner_id, pending_partner_status")
      .eq("id", couple_id);

    const pendingEvents = new Set(["partner_request", "invite_trial_expired", "invite_trial_reminder"]);
    if (event_type !== "partner_disconnected" && !pendingEvents.has(event_type)) {
      coupleQuery.eq("active", true);
    }

    const { data: couple, error: coupleError } = await coupleQuery.maybeSingle();

    if (coupleError || !couple) {
      return new Response(JSON.stringify({ error: "Couple not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For partner_request, the caller is the pending partner (not yet user_b_id).
    // For all other events, the caller must be user_a_id or user_b_id.
    const isPendingEvent = pendingEvents.has(event_type);
    const isCoupleMember = isPendingEvent
      ? (couple.pending_partner_id === user.id && (couple.pending_partner_status === "pending" || couple.pending_partner_status === "b_accepted"))
      : (couple.user_a_id === user.id || couple.user_b_id === user.id);
    if (!isCoupleMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For partner_request, the recipient is User A (the one who shared the code).
    // For all other events, the recipient is the other member of the couple.
    const partnerId = isPendingEvent
      ? couple.user_a_id
      : (couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id);
    if (!partnerId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_partner" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch partner profile + settings
    const [{ data: partnerProfile }, { data: partnerSettings }, { data: senderProfile }] = await Promise.all([
      adminClient.from("profiles").select("push_token, display_name").eq("id", partnerId).maybeSingle(),
      adminClient.from("user_settings").select("push_notifications_enabled, discreet_notifications, notification_copy").eq("user_id", partnerId).maybeSingle(),
      adminClient.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);

    // Respect partner's notification opt-in (system events like disconnection bypass this)
    if (!partnerSettings?.push_notifications_enabled && !ALWAYS_SHOW_EVENTS.has(event_type)) {
      return new Response(JSON.stringify({ ok: true, skipped: "notifications_disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!partnerProfile?.push_token) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_push_token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build notification text
    const senderName = senderProfile?.display_name ?? "Your partner";
    const isSystemEvent = ALWAYS_SHOW_EVENTS.has(event_type);
    const isDiscreet = isSystemEvent ? false : (partnerSettings?.discreet_notifications ?? true);
    const notifCopy = partnerSettings?.notification_copy ?? "New activity";

    const title = "Warm Me Up";
    const eventLabel = EVENT_LABELS[event_type] ?? "has new activity for you";
    const suffix = emoji ? ` ${emoji}` : "";
    // When Discreet is OFF and this is a chat message with a text caption,
    // show the actual message body (truncated for push preview readability).
    // Media-only messages (no caption) fall back to the generic event label.
    // Never include media references — text only.
    const trimmedText = (message_text ?? "").trim();
    const showText = !isDiscreet && event_type === "new_message" && trimmedText.length > 0;
    const bodyText = isDiscreet
      ? (emoji ? `${notifCopy} ${emoji}` : notifCopy)
      : showText
        ? `${senderName}: ${trimmedText.slice(0, 200)}`
        : `${senderName} ${eventLabel}${suffix}`;

    const expoPayload = {
      to: partnerProfile.push_token,
      title,
      body: bodyText,
      data: { event_type, couple_id, target_route: target_route ?? null, item_id: item_id ?? null },
      sound: "default",
    };

    // Log the exact payload for server-side diagnostics (token truncated for privacy)
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

    // Inspect Expo ticket for delivery errors.
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
      if (expoError === "DeviceNotRegistered") {
        console.warn(`[notify-partner] DeviceNotRegistered for partner=${partnerId} — clearing push_token`);
        await adminClient.from("profiles").update({ push_token: null }).eq("id", partnerId);
      } else if (expoError === "InvalidCredentials") {
        console.error(`[notify-partner] InvalidCredentials — push credentials for this platform are missing or expired. Check APNs/FCM credentials at expo.dev for project cfde070c-187f-4d7e-b643-a20446ff95ab`);
      } else if (expoError === "MismatchSenderId") {
        console.error(`[notify-partner] MismatchSenderId — FCM sender ID mismatch. Ensure google-services.json matches the FCM credentials uploaded to expo.dev`);
      } else {
        console.error(`[notify-partner] Expo push error: ${expoError}`, JSON.stringify(ticket));
      }
    } else if (!pushRes.ok) {
      console.error(`[notify-partner] Expo push HTTP ${pushRes.status} — non-ok response`);
    }

    return new Response(JSON.stringify({
      ok: true,
      expo_status: ticket?.status ?? null,
      ticket_id: ticketId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[notify-partner] Unhandled error:", err?.message ?? String(err));
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
