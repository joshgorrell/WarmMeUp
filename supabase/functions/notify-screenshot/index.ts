import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SCREEN_ROUTES: Record<string, string> = {
  vault: "/(app)/(tabs)/vault",
  chat: "/(app)/(tabs)/note",
  wish: "/(app)/(tabs)/wish",
};

const SCREEN_LABELS: Record<string, string> = {
  vault: "Vault",
  chat: "Chat",
  wish: "Wish List",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create a client scoped to the calling user to verify auth
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
    const { vault_item_id, chat_message_id, couple_id, detected_by_user_id, source_screen } = body;

    if (!couple_id || !detected_by_user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is actually in this couple (prevent spoofed couple_ids)
    if (detected_by_user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for the rest — verified above that caller is legitimate
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Confirm caller is a couple member
    const { data: couple, error: coupleError } = await adminClient
      .from("couples")
      .select("user_a_id, user_b_id")
      .eq("id", couple_id)
      .eq("active", true)
      .maybeSingle();

    if (coupleError || !couple) {
      return new Response(JSON.stringify({ error: "Couple not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isCoupleMember =
      couple.user_a_id === user.id || couple.user_b_id === user.id;
    if (!isCoupleMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark screenshot_detected on vault_item if provided
    if (vault_item_id) {
      await adminClient
        .from("vault_items")
        .update({ screenshot_detected: true })
        .eq("id", vault_item_id)
        .in("couple_id", [couple_id]);
    }

    // Look up media info for the activity feed thumbnail. This is a pointer
    // to the existing file only — no copy is made. If the content is later
    // burned or deleted, the file is gone and the thumbnail simply stops
    // rendering (falls back to the icon).
    let mediaMeta: Record<string, unknown> | null = null;
    if (vault_item_id) {
      const { data: vaultItem } = await adminClient
        .from("vault_items")
        .select("storage_path, storage_bucket, blurred_thumbnail_path, media_type, deleted_at")
        .eq("id", vault_item_id)
        .maybeSingle();

      if (vaultItem && !vaultItem.deleted_at) {
        mediaMeta = {
          storage_path: vaultItem.storage_path ?? vaultItem.blurred_thumbnail_path ?? null,
          storage_bucket: vaultItem.storage_bucket ?? "vault",
          blurred_thumbnail_path: vaultItem.blurred_thumbnail_path ?? null,
          media_type: vaultItem.media_type ?? null,
        };
      }
    } else if (chat_message_id) {
      const { data: chatMsg } = await adminClient
        .from("chat_messages")
        .select("media_storage_path, media_storage_bucket, media_type, deleted_at")
        .eq("id", chat_message_id)
        .maybeSingle();

      if (chatMsg && !chatMsg.deleted_at && chatMsg.media_storage_path) {
        mediaMeta = {
          storage_path: chatMsg.media_storage_path,
          storage_bucket: chatMsg.media_storage_bucket ?? "chat_media",
          blurred_thumbnail_path: null,
          media_type: chatMsg.media_type ?? null,
        };
      }
    }

    // Find the partner's push token + settings
    const partnerId =
      couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;

    const [{ data: partnerProfile }, { data: partnerSettings }, { data: detectorProfile }] = await Promise.all([
      adminClient.from("profiles").select("push_token, display_name").eq("id", partnerId).maybeSingle(),
      adminClient.from("user_settings").select("push_notifications_enabled, discreet_notifications, notification_copy, screenshot_notify_partner").eq("user_id", partnerId).maybeSingle(),
      adminClient.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);

    // Always write a persistent activity event — source of truth regardless of push settings
    await adminClient.from("activity_events").insert({
      couple_id,
      actor_user_id: user.id,
      target_user_id: partnerId,
      event_type: "screenshot_detected",
      vault_item_id: vault_item_id ?? null,
      source_screen: source_screen ?? null,
      read: false,
      metadata: mediaMeta ? { ...mediaMeta, chat_message_id: chat_message_id ?? null } : (chat_message_id ? { chat_message_id } : null),
    });

    // Send push notification if the partner has opted in to screenshot alerts
    // AND has push enabled AND has a token. The activity_events row above is
    // always written so the in-app Activity feed records the screenshot regardless.
    if (
      (partnerSettings?.screenshot_notify_partner ?? true) &&
      partnerSettings?.push_notifications_enabled &&
      partnerProfile?.push_token
    ) {
      const detectorName = detectorProfile?.display_name ?? "Your partner";
      const isDiscreet = partnerSettings?.discreet_notifications ?? true;
      const notifCopy = partnerSettings?.notification_copy ?? "New activity";
      const screenLabel = source_screen ? SCREEN_LABELS[source_screen] ?? "the app" : "the app";

      const bodyText = isDiscreet
        ? notifCopy
        : `${detectorName} took a screenshot in ${screenLabel}.`;

      const targetRoute = source_screen ? (SCREEN_ROUTES[source_screen] ?? "/(app)/(tabs)/vault") : "/(app)/(tabs)/vault";

      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: partnerProfile.push_token,
          title: "Warm Me Up",
          body: bodyText,
          data: { event_type: "screenshot_detected", couple_id, vault_item_id, chat_message_id, source_screen, target_route: targetRoute },
          sound: "default",
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
