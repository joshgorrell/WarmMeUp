import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SubscriptionRow {
  user_id: string;
  plan: string;
  status: string;
  expires_at: string | null;
  trial_started_at: string | null;
}

interface AdminGrantRow {
  user_id: string;
  entitlement_type: string;
  expires_at: string | null;
  active: boolean;
}

function isActive(row: SubscriptionRow | null): boolean {
  if (!row) return false;
  if (row.status !== "active") return false;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return false;
  return true;
}

function isPaidPlan(plan: string): boolean {
  return plan === "monthly" || plan === "yearly";
}

function isGrantActive(grant: AdminGrantRow | null): boolean {
  if (!grant) return false;
  if (!grant.active) return false;
  if (grant.expires_at && new Date(grant.expires_at) < new Date()) return false;
  return true;
}

// Returns true if the given user has any form of active premium access:
// admin flag, super_admin flag, active subscription, or active admin_grant.
async function userHasPremiumAccess(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<{ hasPremium: boolean; source: string; plan: string | null; expiresAt: string | null }> {
  // 1. Admin / super_admin flags
  const { data: profile } = await adminClient
    .from("profiles")
    .select("is_admin, is_super_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_super_admin === true) {
    return { hasPremium: true, source: "super_admin", plan: "admin", expiresAt: null };
  }
  if (profile?.is_admin === true) {
    return { hasPremium: true, source: "admin", plan: "admin", expiresAt: null };
  }

  // 2. Active subscription
  const { data: sub } = await adminClient
    .from("subscriptions")
    .select("user_id, plan, status, expires_at, trial_started_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (isActive(sub) && isPaidPlan(sub!.plan)) {
    return { hasPremium: true, source: "self", plan: sub!.plan, expiresAt: sub!.expires_at };
  }

  // 3. Admin grant
  const { data: grant } = await adminClient
    .from("admin_grants")
    .select("user_id, entitlement_type, expires_at, active")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (isGrantActive(grant)) {
    return { hasPremium: true, source: "admin_grant", plan: grant!.entitlement_type, expiresAt: grant!.expires_at };
  }

  return { hasPremium: false, source: "none", plan: null, expiresAt: null };
}

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // --- Check current user's own access (admin flags, subscription, admin_grant) ---
    const ownAccess = await userHasPremiumAccess(adminClient, user.id);

    if (ownAccess.hasPremium) {
      const isAdminSource = ownAccess.source === "admin" || ownAccess.source === "super_admin";
      return new Response(
        JSON.stringify({
          isPremium: true,
          source: ownAccess.source,
          plan: ownAccess.plan,
          expiresAt: ownAccess.expiresAt,
          isOnTrial: false,
          trialExpiresAt: null,
          canInvite: true,
          trialExpired: false,
          checkedSuperAdmin: true,
          checkedAdminGrant: !isAdminSource,
          adminGrantFound: ownAccess.source === "admin_grant",
          finalSource: ownAccess.source,
          finalCanInvite: true,
          finalIsPremium: true,
          _v: "2026-06-21",
          _ts: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Check own trial subscription (for trialExpired flag) ---
    const { data: ownSub } = await adminClient
      .from("subscriptions")
      .select("user_id, plan, status, expires_at, trial_started_at")
      .eq("user_id", user.id)
      .maybeSingle();

    // --- Check partner's access via active couple ---
    // Partner access includes: admin flags, active paid subscription, OR admin_grant.
    // This ensures User B gets premium when User A holds any form of active entitlement.
    const { data: couple } = await adminClient
      .from("couples")
      .select("user_a_id, user_b_id")
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
      .eq("active", true)
      .maybeSingle();

    if (couple) {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      if (partnerId) {
        const partnerAccess = await userHasPremiumAccess(adminClient, partnerId);
        if (partnerAccess.hasPremium) {
          return new Response(
            JSON.stringify({
              isPremium: true,
              source: "partner",
              plan: partnerAccess.plan,
              expiresAt: partnerAccess.expiresAt,
              isOnTrial: false,
              trialExpiresAt: null,
              canInvite: false,
              trialExpired: false,
              checkedSuperAdmin: true,
              checkedAdminGrant: true,
              adminGrantFound: false,
              partnerAccessSource: partnerAccess.source,
              finalSource: "partner",
              finalCanInvite: false,
              finalIsPremium: true,
              _v: "2026-06-21",
              _ts: new Date().toISOString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // --- No active subscription from any source ---
    const trialExpired = ownSub !== null && !isActive(ownSub);

    return new Response(
      JSON.stringify({
        isPremium: false,
        source: "none",
        plan: null,
        expiresAt: null,
        isOnTrial: false,
        trialExpiresAt: ownSub?.expires_at ?? null,
        canInvite: false,
        trialExpired,
        checkedSuperAdmin: true,
        checkedAdminGrant: true,
        adminGrantFound: false,
        finalSource: "none",
        finalCanInvite: false,
        finalIsPremium: false,
        _v: "2026-06-21",
        _ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", _detail: String(err), _v: "2026-06-21", _ts: new Date().toISOString() }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
