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
      user_id,
      media_type,
      allow_screenshot,
      allow_save,
      allow_share,
      chat_message_id,
      thumbnail_path,
    } = body;

    if (!source_bucket || !source_path || !vault_path || !couple_id || !user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is a member of this couple
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

    // Verify the source file belongs to this couple (path starts with couple_id)
    if (!source_path.startsWith(`${couple_id}/`)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    let actualThumbnailPath = thumbnail_path ?? null;
    if (thumbnail_path) {
      const thumbVaultPath = thumbnail_path.replace(
        /\.(mp4|mov|m4v|quicktime)$/i,
        "_thumb.jpg"
      ).replace(/^chat_media\//, "");
      const { error: thumbCopyError } = await adminClient.storage
        .from(source_bucket)
        .copy(thumbnail_path, thumbVaultPath, { destinationBucket: "vault" });
      if (!thumbCopyError) {
        actualThumbnailPath = thumbVaultPath;
      }
    }

    // Insert the vault_items row
    const { data: vaultItem, error: insertError } = await adminClient
      .from("vault_items")
      .insert({
        couple_id,
        uploaded_by_user_id: user_id,
        media_type,
        file_path: vault_path,
        storage_path: vault_path,
        storage_bucket: "vault",
        blurred_thumbnail_path: actualThumbnailPath,
        allow_screenshot: allow_screenshot ?? false,
        allow_save: allow_save ?? false,
        allow_share: allow_share ?? false,
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
