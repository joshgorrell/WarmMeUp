import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { hasEffectiveSelfAccess } from "../_shared/effectiveAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Trial expirations whose grace period ended before this instant are historical and never notify.
const TRIAL_NOTIFICATION_CUTOFF = "2026-11-03T20:00:00Z";
const TRIAL_GRACE_MS = 24 * 60 * 60 * 1000;

/** Length-independent, constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ba.length ^ bb.length;
  const len = Math.max(ba.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Authorization ────────────────────────────────────────────────────
    // This job sends push notifications and stamps notification bookkeeping
    // columns, so it must only run for the scheduler (Vault token or service-role
    // key) or for an admin triggering it manually. Never for an anonymous caller.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    let isScheduled = token.length > 0 && safeEqual(token, serviceRoleKey);
    const schedulerToken = req.headers.get("x-trial-expiry-token") ?? "";
    if (!isScheduled && schedulerToken.length > 0) {
      const { data: valid, error: tokenError } = await adminClient.rpc("validate_trial_expiry_token", { p_token: schedulerToken });
      isScheduled = !tokenError && valid === true;
    }

    if (!isScheduled) {
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
      const gateClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: profile } = await gateClient
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

    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
    const hasAccess = (userId: string) => hasEffectiveSelfAccess(adminClient, userId, rcSecretKey);

    // ── Trial expirations ────────────────────────────────────────────────
    // A trial qualifies once its 24h grace has ended, and only if that happened on or
    // after the cutoff. Each expiration notifies at most once per couple: the couple's
    // trial_expired_notified_at must be earlier than the end of that grace period.
    const cutoffMs = Date.parse(TRIAL_NOTIFICATION_CUTOFF);
    const nowMs = Date.now();

    const { data: lapsedTrials, error: lapsedError } = await adminClient
      .from("subscriptions")
      .select("user_id, expires_at")
      .eq("plan", "trial")
      .gte("expires_at", new Date(cutoffMs - TRIAL_GRACE_MS).toISOString())
      .lte("expires_at", new Date(nowMs - TRIAL_GRACE_MS).toISOString());

    if (lapsedError) {
      console.error("[process-trial-expiry] trial query error:", lapsedError.message);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let notified = 0;

    for (const trial of lapsedTrials ?? []) {
      const lapseEndMs = Date.parse(trial.expires_at) + TRIAL_GRACE_MS;
      const lapseEndIso = new Date(lapseEndMs).toISOString();

      const { data: couples, error: coupleError } = await adminClient
        .from("couples")
        .select("id, user_a_id, user_b_id, pending_partner_status, trial_expired_notified_at")
        .eq("active", true)
        .or(`user_a_id.eq.${trial.user_id},user_b_id.eq.${trial.user_id}`);

      if (coupleError) {
        console.error(`[process-trial-expiry] couple query error for user=${trial.user_id}:`, coupleError.message);
        continue;
      }

      for (const couple of couples ?? []) {
        if (couple.trial_expired_notified_at && Date.parse(couple.trial_expired_notified_at) >= lapseEndMs) continue;

        const recipients = couple.user_b_id ? [couple.user_a_id, couple.user_b_id] : [couple.user_a_id];

        try {
          let covered = false;
          for (const userId of recipients) {
            if (await hasAccess(userId)) {
              covered = true;
              break;
            }
          }
          if (covered) continue;

          // Claim the expiration before sending so a concurrent run or a repeated call cannot notify twice.
          const { data: claimed, error: claimError } = await adminClient
            .from("couples")
            .update({ trial_expired_notified_at: new Date(nowMs).toISOString() })
            .eq("id", couple.id)
            .or(`trial_expired_notified_at.is.null,trial_expired_notified_at.lt.${lapseEndIso}`)
            .select("id");

          if (claimError) {
            console.error(`[process-trial-expiry] claim failed for couple=${couple.id}:`, claimError.message);
            continue;
          }
          if (!claimed || claimed.length === 0) continue;

          const eventType = couple.user_b_id
            ? "paired_trial_expired"
            : couple.pending_partner_status
              ? "invite_trial_expired"
              : "solo_trial_expired";

          for (const userId of recipients) {
            await sendPushToUser(adminClient, userId, eventType, couple.id);
          }
          notified++;
        } catch (err: any) {
          console.error(`[process-trial-expiry] error for couple=${couple.id}:`, err?.message ?? String(err));
        }
      }
    }

    console.log(`[process-trial-expiry] checked ${lapsedTrials?.length ?? 0} lapsed trials, notified ${notified} couples`);

    return new Response(
      JSON.stringify({ ok: true, checkedTrials: lapsedTrials?.length ?? 0, notified }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[process-trial-expiry] unhandled error:", err?.message ?? String(err));
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendPushToUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  eventType: string,
  coupleId: string
): Promise<void> {
  try {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("push_token")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.push_token) {
      console.log(`[process-trial-expiry] no push_token for user=${userId}, skipping`);
      return;
    }

    const labels: Record<string, string> = {
      invite_trial_expired: "Your trial has ended! Subscribe now to confirm your partner's connection request.",
      solo_trial_expired: "Your free trial has ended. Subscribe to keep your access to all features.",
      paired_trial_expired: "Your free trial has ended. Subscribe to keep your access to all features.",
    };

    const bodyText = labels[eventType] ?? "Your free trial has ended.";

    const expoPayload = {
      to: profile.push_token,
      title: "Warm Me Up",
      body: bodyText,
      data: { event_type: eventType, couple_id: coupleId, target_route: "/(auth)/subscription" },
      sound: "default",
    };

    const pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expoPayload),
    });

    if (!pushRes.ok) {
      console.error(`[process-trial-expiry] Expo push HTTP ${pushRes.status} for user=${userId}`);
    } else {
      const ticket = await pushRes.json().catch(() => null);
      if (ticket?.data?.status === "error") {
        const expoError = ticket?.data?.details?.error ?? "unknown";
        if (expoError === "DeviceNotRegistered") {
          await adminClient.from("profiles").update({ push_token: null }).eq("id", userId);
          console.warn(`[process-trial-expiry] DeviceNotRegistered — cleared token for user=${userId}`);
        } else {
          console.error(`[process-trial-expiry] Expo push error: ${expoError}`);
        }
      }
    }
  } catch (err: any) {
    console.error(`[process-trial-expiry] sendPushToUser error for user=${userId}:`, err?.message ?? String(err));
  }
}
