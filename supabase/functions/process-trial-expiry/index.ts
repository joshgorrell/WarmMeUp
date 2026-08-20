import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // ── Authorization ────────────────────────────────────────────────────
    // This job sends push notifications and stamps notification bookkeeping
    // columns, so it must only run for the scheduler (service-role key) or
    // for an admin triggering it manually. Never for an anonymous caller.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isCron = token.length > 0 && safeEqual(token, serviceRoleKey);

    if (!isCron) {
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
        // Check if the inviter still has premium access
        const { data: inviterSub } = await adminClient
          .from("subscriptions")
          .select("status, plan, expires_at")
          .eq("user_id", couple.user_a_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const hasActivePremium =
          inviterSub?.status === "active" &&
          inviterSub?.plan !== "trial" &&
          inviterSub?.expires_at &&
          new Date(inviterSub.expires_at) > new Date();

        const hasActiveTrial =
          inviterSub?.status === "active" &&
          inviterSub?.plan === "trial" &&
          inviterSub?.expires_at &&
          new Date(inviterSub.expires_at) > new Date();

        if (!hasActivePremium && !hasActiveTrial) {
          // Stamp the first detection timestamp
          await adminClient
            .from("couples")
            .update({ trial_expired_notified_at: new Date().toISOString() })
            .eq("id", couple.id);

          // Send the first push notification to User A
          await sendPushToUser(
            adminClient,
            couple.user_a_id,
            "invite_trial_expired",
            couple.id
          );
          processedFirst++;
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

        // Double-check the inviter still doesn't have premium
        const { data: inviterSub } = await adminClient
          .from("subscriptions")
          .select("status, plan, expires_at")
          .eq("user_id", couple.user_a_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const hasActivePremium =
          inviterSub?.status === "active" &&
          inviterSub?.plan !== "trial" &&
          inviterSub?.expires_at &&
          new Date(inviterSub.expires_at) > new Date();

        if (!hasActivePremium) {
          await adminClient
            .from("couples")
            .update({ trial_expired_reminder_sent: true })
            .eq("id", couple.id);

          await sendPushToUser(
            adminClient,
            couple.user_a_id,
            "invite_trial_reminder",
            couple.id
          );
          processedReminders++;
        }
      }
    }

    // ── 3. Paired-couple trial expiry detection ──────────────────────────
    // Find couples where both partners are connected (user_b_id IS NOT NULL)
    // and the subscription owner's trial has expired, but neither partner has
    // been notified yet (trial_expired_notified_at IS NULL on a paired couple).
    let processedPaired = 0;

    const { data: pairedCouples, error: pairedError } = await adminClient
      .from("couples")
      .select("id, user_a_id, user_b_id, subscription_owner_id")
      .not("user_b_id", "is", null)
      .eq("active", true)
      .is("trial_expired_notified_at", null);

    if (pairedError) {
      console.error("[process-trial-expiry] paired query error:", pairedError.message);
    }

    if (pairedCouples && pairedCouples.length > 0) {
      for (const couple of pairedCouples) {
        const ownerId = couple.subscription_owner_id ?? couple.user_a_id;
        if (!ownerId) continue;

        const { data: ownerSub } = await adminClient
          .from("subscriptions")
          .select("status, plan, expires_at")
          .eq("user_id", ownerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const hasActivePremium =
          ownerSub?.status === "active" &&
          ownerSub?.plan !== "trial" &&
          ownerSub?.expires_at &&
          new Date(ownerSub.expires_at) > new Date();

        const hasActiveTrial =
          ownerSub?.status === "active" &&
          ownerSub?.plan === "trial" &&
          ownerSub?.expires_at &&
          new Date(ownerSub.expires_at) > new Date();

        if (!hasActivePremium && !hasActiveTrial) {
          await adminClient
            .from("couples")
            .update({ trial_expired_notified_at: new Date().toISOString() })
            .eq("id", couple.id);

          await sendPushToUser(adminClient, couple.user_a_id, "paired_trial_expired", couple.id);
          if (couple.user_b_id) {
            await sendPushToUser(adminClient, couple.user_b_id, "paired_trial_expired", couple.id);
          }
          processedPaired++;
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
