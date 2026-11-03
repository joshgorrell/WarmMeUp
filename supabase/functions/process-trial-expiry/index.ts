import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { hasEffectiveSelfAccess } from "../_shared/effectiveAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    // Failures for one couple are logged and skipped so the next run retries them
    // (a RevenueCat outage must not stamp a couple as expired).
    const hasAccess = (userId: string) => hasEffectiveSelfAccess(adminClient, userId, rcSecretKey);

    let processedFirst = 0;
    let processedReminders = 0;

    // ── 1. First-time trial expiry detection ──────────────────────────────
    // Find couples where:
    //   - user_b_id IS NULL (solo, invite pending)
    //   - pending_partner_status IS NOT NULL (someone requested to join)
    //   - trial_expired_notified_at IS NULL (not yet detected)
    //   - the inviter (user_a_id) has NO active premium and NO active trial
    const { data: expiredCouples, error: expiredError } = await adminClient
      .from("couples")
      .select("id, user_a_id, pending_partner_id, pending_partner_status")
      .is("user_b_id", null)
      .not("pending_partner_status", "is", null)
      .is("trial_expired_notified_at", null);

    if (expiredError) {
      console.error("[process-trial-expiry] query error:", expiredError.message);
    }

    if (expiredCouples && expiredCouples.length > 0) {
      for (const couple of expiredCouples) {
        try {
          if (await hasAccess(couple.user_a_id)) continue;

          const { error: stampError } = await adminClient
            .from("couples")
            .update({ trial_expired_notified_at: new Date().toISOString() })
            .eq("id", couple.id);
          if (stampError) {
            console.error(`[process-trial-expiry] stamp failed for couple=${couple.id}:`, stampError.message);
            continue;
          }

          await sendPushToUser(adminClient, couple.user_a_id, "invite_trial_expired", couple.id);
          processedFirst++;
        } catch (err: any) {
          console.error(`[process-trial-expiry] first-notice error for couple=${couple.id}:`, err?.message ?? String(err));
        }
      }
    }

    // ── 2. 48-hour reminder detection ────────────────────────────────────
    // Find couples where:
    //   - trial_expired_notified_at IS NOT NULL (already detected)
    //   - trial_expired_reminder_sent IS NULL or false (reminder not yet sent)
    //   - trial_expired_notified_at is 48+ hours ago
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: reminderCouples, error: reminderError } = await adminClient
      .from("couples")
      .select("id, user_a_id, pending_partner_id, pending_partner_status, trial_expired_notified_at")
      .is("user_b_id", null)
      .not("pending_partner_status", "is", null)
      .not("trial_expired_notified_at", "is", null)
      .lt("trial_expired_notified_at", fortyEightHoursAgo)
      .or("trial_expired_reminder_sent.is.null,trial_expired_reminder_sent.eq.false");

    if (reminderError) {
      console.error("[process-trial-expiry] reminder query error:", reminderError.message);
    }

    if (reminderCouples && reminderCouples.length > 0) {
      for (const couple of reminderCouples) {
        // Only send reminder if the request is still pending (not accepted/declined)
        if (couple.pending_partner_status !== "pending" && couple.pending_partner_status !== "b_accepted") {
          continue;
        }

        try {
          if (await hasAccess(couple.user_a_id)) continue;

          const { error: reminderStampError } = await adminClient
            .from("couples")
            .update({ trial_expired_reminder_sent: true })
            .eq("id", couple.id);
          if (reminderStampError) {
            console.error(`[process-trial-expiry] reminder stamp failed for couple=${couple.id}:`, reminderStampError.message);
            continue;
          }

          await sendPushToUser(adminClient, couple.user_a_id, "invite_trial_reminder", couple.id);
          processedReminders++;
        } catch (err: any) {
          console.error(`[process-trial-expiry] reminder error for couple=${couple.id}:`, err?.message ?? String(err));
        }
      }
    }

    // ── 3. Paired-couple trial expiry detection ──────────────────────────
    // Notify only when neither partner has access. Partner access follows whichever
    // partner currently holds valid premium, so a partner's purchase covers the couple.
    let processedPaired = 0;

    const { data: pairedCouples, error: pairedError } = await adminClient
      .from("couples")
      .select("id, user_a_id, user_b_id")
      .not("user_b_id", "is", null)
      .eq("active", true)
      .is("trial_expired_notified_at", null);

    if (pairedError) {
      console.error("[process-trial-expiry] paired query error:", pairedError.message);
    }

    if (pairedCouples && pairedCouples.length > 0) {
      for (const couple of pairedCouples) {
        if (!couple.user_a_id || !couple.user_b_id) continue;

        try {
          if (await hasAccess(couple.user_a_id)) continue;
          if (await hasAccess(couple.user_b_id)) continue;

          const { error: pairedStampError } = await adminClient
            .from("couples")
            .update({ trial_expired_notified_at: new Date().toISOString() })
            .eq("id", couple.id);
          if (pairedStampError) {
            console.error(`[process-trial-expiry] paired stamp failed for couple=${couple.id}:`, pairedStampError.message);
            continue;
          }

          await sendPushToUser(adminClient, couple.user_a_id, "paired_trial_expired", couple.id);
          await sendPushToUser(adminClient, couple.user_b_id, "paired_trial_expired", couple.id);
          processedPaired++;
        } catch (err: any) {
          console.error(`[process-trial-expiry] paired error for couple=${couple.id}:`, err?.message ?? String(err));
        }
      }
    }

    console.log(`[process-trial-expiry] processed ${processedFirst} first-notifications, ${processedReminders} reminders, ${processedPaired} paired-expirations`);

    return new Response(
      JSON.stringify({ ok: true, processedFirst, processedReminders, processedPaired }),
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
      invite_trial_reminder: "Your partner is still waiting! Subscribe now to confirm your connection.",
      paired_trial_expired: "Your free trial has ended. Subscribe to keep your access to all features.",
    };

    const bodyText = labels[eventType] ?? "You have a pending connection request.";

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
