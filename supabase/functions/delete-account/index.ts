import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { processAccountBurn } from '../_shared/contentBurn.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parsePemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function generateAppleClientSecret(
  clientId: string,
  teamId: string,
  keyId: string,
  privateKeyPem: string,
): Promise<string> {
  const keyData = parsePemToPkcs8(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 15777000,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    enc.encode(signingInput),
  );

  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });

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

    // ── 1b. Revoke Sign in with Apple authorization (if applicable) ──
    // Read the stored Apple refresh token and send it to Apple's revoke
    // endpoint before deleting the user. If revocation fails, log the error
    // but continue with deletion — the account is still fully removed.
    try {
      const { data: settingsRow } = await admin
        .from("user_settings")
        .select("apple_refresh_token")
        .eq("user_id", userId)
        .maybeSingle();

      const appleRefreshToken = settingsRow?.apple_refresh_token;
      if (appleRefreshToken) {
        const appleClientId = Deno.env.get("APPLE_CLIENT_ID");
        const appleTeamId = Deno.env.get("APPLE_TEAM_ID");
        const appleKeyId = Deno.env.get("APPLE_KEY_ID");
        const applePrivateKey = Deno.env.get("APPLE_PRIVATE_KEY");

        if (appleClientId && appleTeamId && appleKeyId && applePrivateKey) {
          const clientSecret = await generateAppleClientSecret(appleClientId, appleTeamId, appleKeyId, applePrivateKey);
          const revokeParams = new URLSearchParams({
            client_id: appleClientId,
            client_secret: clientSecret,
            token: appleRefreshToken,
            token_type_hint: "refresh_token",
          });
          const revokeRes = await fetch("https://appleid.apple.com/auth/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: revokeParams.toString(),
          });
          if (!revokeRes.ok) {
            const errText = await revokeRes.text();
            console.error(`[delete-account] Apple token revocation failed (${revokeRes.status}) for user ${userId}:`, errText);
          }
        } else {
          console.warn(`[delete-account] Apple secrets not configured — skipping revocation for user ${userId}`);
        }
      }
    } catch (appleRevokeErr) {
      console.error(`[delete-account] Apple revocation error for user ${userId}:`, appleRevokeErr);
    }

    const { error: prepareError } = await admin.rpc('prepare_account_burn', { p_user: userId });
    if (prepareError) throw prepareError;
    // Block fresh sessions while the durable worker retries storage deletion.
    const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    if (banError) throw banError;
    let deleted = false;
    try { deleted = await processAccountBurn(admin,userId); } catch { /* durable worker retries */ }
    return new Response(JSON.stringify({ deleted, pending: !deleted }), {
      status: deleted ? 200 : 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
