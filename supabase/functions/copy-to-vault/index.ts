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

    // Verify the caller is authenticated
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
    const {
      source_bucket,
      source_path,
      vault_path,
      couple_id,
      media_type,
      chat_message_id,
      thumbnail_path,
    } = body;

    if (!source_bucket || !source_path || !vault_path || !couple_id || !chat_message_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The uploader is always the authenticated caller — never trust a client-supplied user_id
    const user_id = user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is a member of this couple
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

    // Source can be any couple member's media (auto-save own, manual save partner's).
    // Vault path must always be under the caller's own directory.
    if (
      source_bucket !== "chat_media" ||
      !source_path.startsWith(`${couple_id}/`) ||
      !vault_path.startsWith(`${couple_id}/${user_id}/`) ||
      source_path.includes("..") ||
      vault_path.includes("..")
    ) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The message must belong to the couple and point to the same source file.
    // Either partner's messages can be saved — the saver is always the caller.
    const { data: chatMessage, error: chatMessageError } = await adminClient
      .from("chat_messages")
      .select("id, couple_id, sender_id, media_storage_bucket, media_storage_path, media_type, deleted_at")
      .eq("id", chat_message_id)
      .maybeSingle();

    if (
      chatMessageError ||
      !chatMessage ||
      chatMessage.couple_id !== couple_id ||
      chatMessage.media_storage_bucket !== "chat_media" ||
      chatMessage.media_storage_path !== source_path ||
      chatMessage.deleted_at !== null
    ) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read the user's real privacy settings from the database — never trust client-supplied flags
    const { data: userSettings } = await adminClient
      .from("user_settings")
      .select("vault_allow_save_default, vault_allow_share_default")
      .eq("user_id", user_id)
      .maybeSingle();

    const allow_save = userSettings?.vault_allow_save_default ?? false;
    // Sharing is only allowed when saving is also enabled (enforced by DB triggers, but we enforce here too)
    const allow_share = allow_save ? (userSettings?.vault_allow_share_default ?? false) : false;
    const verifiedMediaType = chatMessage.media_type ?? media_type;

    // Copy the file server-side: source bucket -> vault bucket
    const { error: copyError } = await adminClient.storage
      .from(source_bucket)
      .copy(source_path, vault_path, { destinationBucket: "vault" });

    if (copyError) {
      return new Response(
        JSON.stringify({ error: "Copy failed", details: copyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If there's a thumbnail, copy it too
    let actualThumbnailPath: string | null = null;
    if (thumbnail_path) {
      // Derive the vault thumbnail path from the vault_path, not the chat thumbnail path
      const thumbVaultPath = vault_path.replace(/\.\w+$/, "_thumb.jpg");
      const { error: thumbCopyError } = await adminClient.storage
        .from(source_bucket)
        .copy(thumbnail_path, thumbVaultPath, { destinationBucket: "vault" });
      if (!thumbCopyError) {
        actualThumbnailPath = thumbVaultPath;
      }
    }

    // Insert the vault_items row with server-verified privacy flags
    const { data: vaultItem, error: insertError } = await adminClient
      .from("vault_items")
      .insert({
        couple_id,
        uploaded_by_user_id: user_id,
        media_type: verifiedMediaType,
        file_path: vault_path,
        storage_path: vault_path,
        storage_bucket: "vault",
        blurred_thumbnail_path: actualThumbnailPath,
        allow_screenshot: false,
        allow_save,
        allow_share,
        chat_message_id: chat_message_id ?? null,
      })
      .select("id")
      .single();

    if (insertError || !vaultItem) {
      // Clean up the copied file since we couldn't create the DB row
      adminClient.storage.from("vault").remove([vault_path]).catch(() => {});
      return new Response(
        JSON.stringify({ error: "Failed to create vault item", details: insertError?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Link the vault item back to the chat message
    if (chat_message_id) {
      await adminClient
        .from("chat_messages")
        .update({ vault_item_id: vaultItem.id })
        .eq("id", chat_message_id);
    }

    return new Response(
      JSON.stringify({ vault_item_id: vaultItem.id, storage_path: vault_path }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
