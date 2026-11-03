import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { hasEffectiveSelfAccess } from "../_shared/effectiveAccess.ts";
import { isNoticeEligible, type NoticeRecord, type NoticeStatus, TRIAL_GRACE_MS } from "../_shared/trialNotice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Trial expirations whose grace period ended before this instant are historical and never notify.
const TRIAL_NOTIFICATION_CUTOFF = "2026-11-03T20:00:00Z";

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
    // after the cutoff. Each user is tracked per expiration on their own profile, so
    // one partner's notice never blocks the other's.
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

      const { data: couples, error: coupleError } = await adminClient
        .from("couples")
        .select("id, user_a_id, user_b_id, pending_partner_status")
        .eq("active", true)
        .or(`user_a_id.eq.${trial.user_id},user_b_id.eq.${trial.user_id}`);

      if (coupleError) {
        console.error(`[process-trial-expiry] couple query error for user=${trial.user_id}:`, coupleError.message);
        continue;
      }

      for (const couple of couples ?? []) {
        const recipients = couple.user_b_id ? [couple.user_a_id, couple.user_b_id] : [couple.user_a_id];

        try {
          // A couple's expiration is the latest trial end across its members, so a
          // partner who lapses later still counts as one expiration for both.
          const { data: memberTrials, error: memberError } = await adminClient
            .from("subscriptions")
            .select("expires_at")
            .eq("plan", "trial")
            .in("user_id", recipients);
          if (memberError) throw new Error(memberError.message);

          const expirationMs = Math.max(
            lapseEndMs,
            ...(memberTrials ?? []).map((t) => Date.parse(t.expires_at) + TRIAL_GRACE_MS),
          );
          const expirationIso = new Date(expirationMs).toISOString();

          const { data: memberProfiles, error: profileError } = await adminClient
            .from("profiles")
            .select("id, trial_expiry_notice_for, trial_expiry_notice_status")
            .in("id", recipients);
          if (profileError) throw new Error(profileError.message);

          const noticeByUser = new Map<string, NoticeRecord>(
            (memberProfiles ?? []).map((p) => [
              p.id,
              { for: p.trial_expiry_notice_for, status: p.trial_expiry_notice_status as NoticeStatus | null },
            ]),
          );
          const eligibleIds = recipients.filter((id) => isNoticeEligible(noticeByUser.get(id) ?? null, expirationMs));
          if (eligibleIds.length === 0) continue;

          let covered = false;
          for (const userId of recipients) {
            if (await hasAccess(userId)) {
              covered = true;
              break;
            }
          }
          if (covered) continue;

          const eventType = couple.user_b_id
            ? "paired_trial_expired"
            : couple.pending_partner_status
              ? "invite_trial_expired"
              : "solo_trial_expired";

          for (const userId of eligibleIds) {
            // Claim before sending so a concurrent run cannot send the same notice twice.
            const { data: claimed, error: claimError } = await adminClient
              .from("profiles")
              .update({ trial_expiry_notice_for: expirationIso, trial_expiry_notice_status: "pending" })
              .eq("id", userId)
              .or(
                `trial_expiry_notice_for.is.null,trial_expiry_notice_for.neq.${expirationIso},trial_expiry_notice_status.eq.failed`,
              )
              .select("id");

            if (claimError) {
              console.error(`[process-trial-expiry] claim failed for user=${userId}:`, claimError.message);
              continue;
            }
            if (!claimed || claimed.length === 0) continue;

            const outcome = await sendPushToUser(adminClient, userId, eventType, couple.id);

            const { error: recordError } = await adminClient
              .from("profiles")
              .update({ trial_expiry_notice_status: outcome })
              .eq("id", userId)
              .eq("trial_expiry_notice_for", expirationIso);
            if (recordError) {
              console.error(`[process-trial-expiry] could not record outcome for user=${userId}:`, recordError.message);
            }
            if (outcome === "sent") notified++;
          }
        } catch (err: any) {
          console.error(`[process-trial-expiry] error for couple=${couple.id}:`, err?.message ?? String(err));
        }
      }
    }

    console.log(`[process-trial-expiry] checked ${lapsedTrials?.length ?? 0} lapsed trials, sent ${notified} notices`);

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

// "failed" means Expo definitely did not accept the message, so a retry is safe.
// "uncertain" means the request may have been delivered but the outcome is unknown,
// so the notice is not resent for this expiration.
async function sendPushToUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  eventType: string,
  coupleId: string
): Promise<NoticeStatus> {
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("push_token")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    console.error(`[process-trial-expiry] token read failed for user=${userId}:`, profileError.message);
    return "failed";
  }

  if (!profile?.push_token) {
    console.log(`[process-trial-expiry] no push_token for user=${userId}, marking unreachable`);
    return "unreachable";
  }

  const labels: Record<string, string> = {
    invite_trial_expired: "Your trial has ended! Subscribe now to confirm your partner's connection request.",
    solo_trial_expired: "Your free trial has ended. Subscribe to keep your access to all features.",
    paired_trial_expired: "Your free trial has ended. Subscribe to keep your access to all features.",
  };

  const expoPayload = {
    to: profile.push_token,
    title: "Warm Me Up",
    body: labels[eventType] ?? "Your free trial has ended.",
    data: { event_type: eventType, couple_id: coupleId, target_route: "/(auth)/subscription" },
    sound: "default",
  };

  let pushRes: Response;
  try {
    pushRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expoPayload),
    });
  } catch (err: any) {
    console.error(`[process-trial-expiry] Expo request error for user=${userId}:`, err?.message ?? String(err));
    return "uncertain";
  }

  if (!pushRes.ok) {
    console.error(`[process-trial-expiry] Expo push HTTP ${pushRes.status} for user=${userId}`);
    return "failed";
  }

  let ticket: any = null;
  try {
    ticket = await pushRes.json();
  } catch {
    return "uncertain";
  }

  const ticketStatus = ticket?.data?.status;
  if (ticketStatus === "ok") return "sent";

  if (ticketStatus === "error") {
    const expoError = ticket?.data?.details?.error ?? "unknown";
    if (expoError === "DeviceNotRegistered") {
      await adminClient.from("profiles").update({ push_token: null }).eq("id", userId);
      console.warn(`[process-trial-expiry] DeviceNotRegistered, cleared token for user=${userId}`);
      return "unreachable";
    }
    console.error(`[process-trial-expiry] Expo push error: ${expoError}`);
    return "failed";
  }

  return "uncertain";
}
