import { supabase } from '@/lib/supabase';
import { logDebugEvent } from '@/lib/debugLog';

export type JoinResult =
  | { ok: true; status: 'b_accepted'; coupleId: string; inviterName: string | null }
  | { ok: false; reason: 'not_found' | 'already_full' | 'self' | 'already_connected' | 'error' };

type JoinReason = 'not_found' | 'already_full' | 'self' | 'already_connected' | 'error';

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
 * Returns `{ ok: true, status: 'pending', coupleId }` when the request was
 * created. The caller should navigate to a "waiting for confirmation" state
 * and subscribe to the couple row via realtime for the accept/decline
 * transition, then call `finalizeJoin()` once accepted.
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

  return { ok: true, status: 'b_accepted', coupleId: result.couple_id, inviterName: result.user_a_id ?? null };
}

/**
 * Phase 2 of mutual-consent pairing. Runs the post-join cleanup that
 * previously ran immediately on join — subscription owner stamping,
 * solo-couple deletion, score seeding, and partner notification.
 *
 * Call this only after User A accepts the request (detected via realtime
 * or a manual refresh that shows `user_b_id` is now populated).
 */
export async function finalizeJoin(
  coupleId: string,
  userAId: string,
  userBId: string,
  onJoined?: () => Promise<void>,
): Promise<{ partnerName: string | null }> {
  // Stamp subscription_owner_id so the couple inherits whichever partner has an active paid plan.
  const [{ data: subA, error: subAError }, { data: subB, error: subBError }] = await Promise.all([
    supabase.from('subscriptions').select('id').eq('user_id', userAId).eq('status', 'active').maybeSingle(),
    supabase.from('subscriptions').select('id').eq('user_id', userBId).eq('status', 'active').maybeSingle(),
  ]);
  if (subAError) logDebugEvent('JOIN_SUB_QUERY_ERROR', { which: 'userA', message: subAError.message });
  if (subBError) logDebugEvent('JOIN_SUB_QUERY_ERROR', { which: 'userB', message: subBError.message });

  const subscriptionOwnerId = subA ? userAId : subB ? userBId : null;
  if (subscriptionOwnerId) {
    const { error: stampError } = await supabase
      .from('couples')
      .update({ subscription_owner_id: subscriptionOwnerId })
      .eq('id', coupleId);
    if (stampError) {
      logDebugEvent('JOIN_SUB_STAMP_ERROR', { coupleId, subscriptionOwnerId, message: stampError.message });
    }
  }

  // Clean up User B's own solo placeholder
  await supabase
    .from('couples')
    .delete()
    .eq('user_a_id', userBId)
    .is('user_b_id', null)
    .neq('id', coupleId);

  // Seed scores rows so the points system works from day one.
  const { error: scoresError } = await supabase.from('scores').upsert([
    { couple_id: coupleId, user_id: userAId, points: 0 },
    { couple_id: coupleId, user_id: userBId, points: 0 },
  ]);
  if (scoresError) {
    logDebugEvent('JOIN_SCORES_UPSERT_ERROR', { coupleId, message: scoresError.message });
  }

  const { data: partnerProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userAId)
    .maybeSingle();

  if (onJoined) {
    onJoined().catch(() => {});
  }

  return { partnerName: partnerProfile?.display_name ?? null };
}
