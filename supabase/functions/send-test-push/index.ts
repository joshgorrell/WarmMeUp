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
    const expoPayload = {
      to: targetProfile!.push_token,
      title: "Warm Me Up",
      body: target === "self"
        ? "[Debug] Self push test — end-to-end"
        : "[Debug] Partner push test — forced by admin",
      data: { event_type: "debug_test", couple_id },
      sound: "default",
      priority: "high",
      channelId: "default",
    };

    // Payload echoed back in response for diagnostics (token omitted)
    const expoPayloadSent = JSON.stringify({
      title: expoPayload.title,
      body: expoPayload.body,
      sound: expoPayload.sound,
      priority: expoPayload.priority,
      channelId: expoPayload.channelId,
      data: expoPayload.data,
      to_prefix: (targetProfile!.push_token ?? "").slice(0, 30) + "...",
    });

    console.log("[send-test-push] step=send_to_expo payload:", expoPayloadSent);

    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expoPayload),
    });

    let expoTicket: any = null;
    let expoStatus: string | null = null;
    let expoError: string | null = null;
    let ticketId: string | null = null;

    try {
      const pushJson = await pushRes.json() as any;
      expoTicket = pushJson?.data ?? null;
      expoStatus = expoTicket?.status ?? null;
      ticketId = expoTicket?.id ?? null;

      console.log("[send-test-push] step=got_ticket ticket:", JSON.stringify(expoTicket));

      // Clear stale token if Expo reports the device is gone
      if (expoTicket?.status === "error" && expoTicket?.details?.error === "DeviceNotRegistered") {
        await adminClient.from("profiles").update({ push_token: null }).eq("id", targetUserId);
      }
    } catch (e: any) {
      expoError = e?.message ?? "Failed to parse Expo response";
    }

    // Query Expo receipt API after a short delay so APNs/FCM can process the delivery.
    // Wrapped in a 10-second timeout so the function never hangs on a slow receipt API.
    let receiptStatus: string | null = null;
    let receiptDetails: any = null;
    let receiptError: string | null = null;
    let receiptRequestStarted: string | null = null;
    let receiptRequestFinished: string | null = null;
    let receiptTimedOut = false;
    let receiptResponse: string | null = null;

    if (ticketId && expoStatus === "ok") {
      receiptRequestStarted = new Date().toISOString();
      console.log("[send-test-push] step=receipt_delay starting 3s delay");

      type ReceiptResult =
        | { timedOut: false; receipt: any; error: null }
        | { timedOut: false; receipt: null; error: string }
        | { timedOut: true; receipt: null; error: string };

      const receiptWork = async (): Promise<ReceiptResult> => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        console.log("[send-test-push] step=receipt_fetch querying getReceipts");
        const receiptRes = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [ticketId] }),
        });
        if (!receiptRes.ok) {
          return { timedOut: false, receipt: null, error: `Receipt API HTTP ${receiptRes.status}` };
        }
        const receiptJson = await receiptRes.json() as any;
        const r = receiptJson?.data?.[ticketId as string] ?? null;
        if (r === null) {
          return { timedOut: false, receipt: null, error: "receipt_not_ready_after_5s" };
        }
        return { timedOut: false, receipt: r, error: null };
      };

      const result = await Promise.race<ReceiptResult>([
        receiptWork().catch((e: any): ReceiptResult => ({
          timedOut: false,
          receipt: null,
          error: e?.message ?? String(e),
        })),
        new Promise<ReceiptResult>((resolve) =>
          setTimeout(
            () => resolve({ timedOut: true, receipt: null, error: "Receipt lookup timed out after 10s" }),
            10_000,
          )
        ),
      ]);

      receiptRequestFinished = new Date().toISOString();
      receiptTimedOut = result.timedOut;

      if (result.receipt !== null) {
        receiptStatus = result.receipt?.status ?? null;
        receiptDetails = result.receipt?.details ?? null;
        receiptError = result.receipt?.details?.error ?? null;
        receiptResponse = JSON.stringify(result.receipt);
        console.log("[send-test-push] step=receipt_done receipt:", receiptResponse);
      } else {
        receiptError = result.error ?? "No receipt returned";
        console.warn("[send-test-push] step=receipt_failed error:", receiptError, "timedOut:", receiptTimedOut);
      }
    }

    return json({
      ok: true,
      target_user_id: targetUserId,
      token_present: tokenPresent,
      partner_enabled: notificationsEnabled,
      expo_http_status: pushRes.status,
      expo_status: expoStatus,
      expo_ticket_status: expoStatus,
      expo_ticket_id: ticketId,
      expo_ticket: expoTicket,
      expo_error: expoError,
      ticket_id: ticketId,
      expo_payload_sent: expoPayloadSent,
      receipt_status: receiptStatus,
      receipt_details: receiptDetails !== null ? JSON.stringify(receiptDetails) : null,
      receipt_error: receiptError,
      receipt_request_started: receiptRequestStarted,
      receipt_request_finished: receiptRequestFinished,
      receipt_timeout: receiptTimedOut,
      receipt_response: receiptResponse,
    });
  } catch (err: any) {
    return json({ error: "Internal server error" }, 500);
  }
});
