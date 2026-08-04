import { supabase } from '@/lib/supabase';
import { logDebugEvent } from '@/lib/debugLog';

export type JoinResult =
  | { ok: true; status: 'b_accepted'; coupleId: string; inviterName: string | null }
  | { ok: false; reason: 'not_found' | 'self' | 'already_connected' | 'rate_limited' | 'error' };

type JoinReason = 'not_found' | 'self' | 'already_connected' | 'rate_limited' | 'error';

export type PendingJoinStatus = 'accepted' | 'b_accepted' | 'pending';

export type PendingJoinResult =
  | { ok: true; status: PendingJoinStatus; coupleId: string; inviterName: string | null; inviterAvatar: string | null; inviterPremiumActive: boolean }
  | { ok: false };

/**
 * Check whether the current user has a pending join request or has been accepted.
 * Used to resume the waiting state after app restart and as a polling fallback.
 */
export async function getMyPendingJoin(): Promise<PendingJoinResult> {
  const { data, error } = await supabase
    .rpc('get_my_pending_join') as { data: any; error: any };

  if (error || !data?.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    status: data.status as PendingJoinStatus,
    coupleId: data.couple_id as string,
    inviterName: data.inviter_name ?? null,
    inviterAvatar: data.inviter_avatar ?? null,
    inviterPremiumActive: data.inviter_premium_active ?? true,
  };
}

/**
 * Record that the inviter's trial has expired, so the server can schedule
 * reminder notifications. Returns is_first=true if this was the first time
 * the expiry was detected (so the client knows to fire the initial push).
 */
export async function recordTrialExpired(coupleId: string): Promise<{ ok: boolean; isFirst: boolean }> {
  const { data, error } = await supabase
    .rpc('record_trial_expired_notification', { p_couple_id: coupleId }) as { data: any; error: any };

  if (error || !data?.ok) {
    return { ok: false, isFirst: false };
  }

  return { ok: true, isFirst: data.is_first === true };
}

/**
 * Preview an invite code without creating a pending request.
 * Returns the inviter's display name and avatar so User B can see
 * who they are connecting with before committing.
 */
export async function previewInvite(
  code: string,
): Promise<{ ok: true; inviterName: string; inviterAvatar: string | null } | { ok: false; reason: string }> {
  const { data, error } = await supabase
    .rpc('preview_invite', { invite_code: code.toUpperCase().trim() }) as { data: any; error: any };

  if (error || !data?.ok) {
    return { ok: false, reason: data?.reason ?? 'error' };
  }

  return {
    ok: true,
    inviterName: data.inviter_name ?? 'Your partner',
    inviterAvatar: data.inviter_avatar ?? null,
  };
}

/**
 * Fetch the pending partner's profile (name + avatar) for User A.
 * User A calls this to see who accepted their invite before confirming.
 */
export async function getPendingPartnerProfile(): Promise<
  { ok: true; partnerName: string; partnerAvatar: string | null } | { ok: false }
> {
  const { data, error } = await supabase
    .rpc('get_pending_partner_profile') as { data: any; error: any };

  if (error || !data?.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    partnerName: data.partner_name ?? 'Your partner',
    partnerAvatar: data.partner_avatar ?? null,
  };
}

/**
 * Phase 1 of mutual-consent pairing. Sends a join request to the couple
 * identified by `code`. Does NOT form a couple — it sets a pending request
 * that User A must accept via `accept_partner()` before any couple-scoped
 * data becomes accessible.
 *
 * Finalization (subscription stamping, scores seeding, solo-couple cleanup)
 * now runs server-side inside `accept_partner()`, so the client no longer
 * needs to call a separate finalize step.
 *
 * Returns `{ ok: true, status: 'b_accepted', coupleId, inviterName }` when
 * the request was created. The caller should navigate to a "waiting for
 * confirmation" state and subscribe to the couple row via realtime for the
 * accept/decline transition.
 */
export async function completePendingJoin(
  _userId: string,
  code: string,
): Promise<JoinResult> {
  const { data: result, error: joinError } = await supabase
    .rpc('request_join', { invite_code: code.toUpperCase().trim() }) as { data: any; error: any };

  if (joinError) return { ok: false, reason: 'error' };

  if (!result?.ok) {
    return { ok: false, reason: (result?.reason as JoinReason) ?? 'error' };
  }

  // Notify User A that a request is pending (fire-and-forget)
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (token) {
    fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_type: 'partner_request', couple_id: result.couple_id }),
    }).catch(() => {});
  }

  return {
    ok: true,
    status: 'b_accepted',
    coupleId: result.couple_id,
    inviterName: result.inviter_name ?? null,
  };
}
