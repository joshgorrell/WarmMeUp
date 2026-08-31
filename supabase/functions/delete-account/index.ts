import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Verify the caller's JWT to get their user ID
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon client to verify JWT and extract the user
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for all privileged operations
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ── Admin-initiated deletion ───────────────────────────────────
    // If the request body includes a `targetUserId`, the caller must be a
    // super admin. Otherwise we fall back to deleting the caller's own
    // account (the standard self-serve flow).
    let userId = user.id;
    let body: { targetUserId?: string } | null = null;
    try {
      body = await req.json();
    } catch (_) { /* body is optional */ }

    if (body?.targetUserId && body.targetUserId !== user.id) {
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("is_super_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (!callerProfile?.is_super_admin) {
        return new Response(JSON.stringify({ error: "Forbidden: super admin required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = body.targetUserId;
    }

    // ── 1. Cancel non-Apple subscriptions via RevenueCat ───────────
    // Must happen before the auth user is deleted — RevenueCat needs the
    // user's app_user_id to find and cancel their subscription.
    // NOTE: Apple auto-renewable subscriptions cannot be cancelled
    // server-side; the user must cancel those through Apple's settings.
    // This call handles Google Play and other supported platforms.
    const rcSecret = Deno.env.get("REVENUECAT_SECRET_KEY");
    if (rcSecret) {
      try {
        await fetch(`https://api.revenuecat.com/v1/subscribers/${userId}/subscriptions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${rcSecret}`,
            "Content-Type": "application/json",
            "X-Platform": "ios",
          },
          body: JSON.stringify({
            expiry_at: Math.floor(Date.now() / 1000),
          }),
        });
      } catch (rcErr) {
        console.error("RevenueCat cancellation failed:", rcErr);
      }
    }

    // ── 2. Hard-delete the auth user ────────────────────────────────
    // Doing this before DB cleanup ensures we never leave an orphaned auth
    // record if the DB deletions below fail. The service role cascade in
    // Supabase handles auth.users → profiles FK automatically.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("auth.admin.deleteUser failed:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete auth user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Clean up storage files ──────────────────────────────────

    // Avatar
    try {
      const { data: avatarFiles } = await admin.storage
        .from("avatars")
        .list(userId, { limit: 100 });
      if (avatarFiles && avatarFiles.length > 0) {
        await admin.storage
          .from("avatars")
          .remove(avatarFiles.map((f) => `${userId}/${f.name}`));
      }
    } catch (_) { /* non-fatal */ }

    // Vault files uploaded by this user
    try {
      const { data: vaultItems } = await admin
        .from("vault_items")
        .select("storage_path, storage_bucket")
        .eq("uploaded_by_user_id", userId);

      if (vaultItems && vaultItems.length > 0) {
        const byBucket: Record<string, string[]> = {};
        for (const item of vaultItems) {
          if (item.storage_path && item.storage_bucket) {
            byBucket[item.storage_bucket] = byBucket[item.storage_bucket] ?? [];
            byBucket[item.storage_bucket].push(item.storage_path);
          }
        }
        for (const [bucket, paths] of Object.entries(byBucket)) {
          await admin.storage.from(bucket).remove(paths);
        }
      }
    } catch (_) { /* non-fatal */ }

    // Chat media sent by this user
    try {
      const { data: chatMediaRows } = await admin
        .from("chat_messages")
        .select("media_storage_path, media_storage_bucket")
        .eq("sender_id", userId)
        .not("media_storage_path", "is", null);

      if (chatMediaRows && chatMediaRows.length > 0) {
        const byBucket: Record<string, string[]> = {};
        for (const row of chatMediaRows) {
          if (row.media_storage_path && row.media_storage_bucket) {
            byBucket[row.media_storage_bucket] = byBucket[row.media_storage_bucket] ?? [];
            byBucket[row.media_storage_bucket].push(row.media_storage_path);
          }
        }
        for (const [bucket, paths] of Object.entries(byBucket)) {
          await admin.storage.from(bucket).remove(paths);
        }
      }
    } catch (_) { /* non-fatal */ }

    // ── 2. Delete rows in FK-safe order ───────────────────────────

    // subscription_events (FK → profiles)
    await admin.from("subscription_events").delete().eq("user_id", userId);

    // user_settings
    await admin.from("user_settings").delete().eq("user_id", userId);

    // Gamification rows linked to this user
    // scores has FK user_id → auth.users(id) ON DELETE CASCADE, so the
    // auth.admin.deleteUser call above already removed the scores row.
    await admin.from("monthly_scores").delete().eq("user_id", userId);
    await admin.from("point_events").delete().eq("user_id", userId);
    await admin.from("cash_in_events").delete().or(`winner_user_id.eq.${userId},loser_user_id.eq.${userId}`);

    // vault_screenshot_events
    await admin.from("vault_screenshot_events").delete().eq("detected_by_user_id", userId);

    // vault_items (cascade deletes related messages/screenshot_events)
    await admin.from("vault_items").delete().eq("uploaded_by_user_id", userId);

    // Chat messages
    await admin.from("chat_messages").delete().eq("sender_id", userId);
    await admin.from("messages").delete().eq("sender_id", userId);

    // Interactions
    await admin
      .from("interactions")
      .delete()
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    // Custom prompts created by this user
    await admin.from("tell_me_prompts").delete().eq("created_by_user_id", userId);
    await admin.from("dare_prompts").delete().eq("created_by_user_id", userId);
    await admin.from("dice_prompts").delete().eq("created_by_user_id", userId);

    // ── 3. Disconnect from couple ─────────────────────────────────
    // Identify the partner before dissolving the couple so we can reset their
    // celebration_seen flag — ensuring they see the celebration if they re-pair.
    const { data: coupleRow } = await admin
      .from("couples")
      .select("user_a_id, user_b_id")
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .maybeSingle();

    const partnerId = coupleRow
      ? coupleRow.user_a_id === userId
        ? coupleRow.user_b_id
        : coupleRow.user_a_id
      : null;

    if (partnerId) {
      await admin
        .from("user_settings")
        .update({ celebration_seen: false })
        .eq("user_id", partnerId);
    }

    // If user was user_a: deactivate and orphan the couple
    await admin
      .from("couples")
      .update({ active: false, user_b_id: null })
      .eq("user_a_id", userId);

    // If user was user_b: remove them from the couple
    await admin
      .from("couples")
      .update({ active: false, user_b_id: null })
      .eq("user_b_id", userId);

    // couple_hidden_prompts are couple-scoped; couples above handles deactivation.
    // But delete any that were created while user was user_a of a now-deleted couple.
    // The safest approach is to delete hidden prompts for couples this user owned.
    const { data: ownedCouples } = await admin
      .from("couples")
      .select("id")
      .eq("user_a_id", userId);
    if (ownedCouples && ownedCouples.length > 0) {
      const coupleIds = ownedCouples.map((c) => c.id);
      await admin.from("couple_hidden_prompts").delete().in("couple_id", coupleIds);
    }

    // ── 4. Delete the profile row ─────────────────────────────────
    await admin.from("profiles").delete().eq("id", userId);

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
