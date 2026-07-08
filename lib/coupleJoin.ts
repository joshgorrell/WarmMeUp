import { supabase } from '@/lib/supabase';
import { logDebugEvent } from '@/lib/debugLog';

export type JoinResult =
  | { ok: true; partnerName: string | null; coupleId: string }
  | { ok: false; reason: 'not_found' | 'already_full' | 'self' | 'already_connected' | 'error' };

export async function completePendingJoin(
  userId: string,
  code: string,
  onJoined?: () => Promise<void>,
): Promise<JoinResult> {
  const { data: joinResult, error: joinError } = await supabase
    .rpc('join_couple', { invite_code: code.toUpperCase().trim() });

  if (joinError) return { ok: false, reason: 'error' };

  if (!joinResult.ok) {
    return { ok: false, reason: joinResult.reason as 'not_found' | 'already_full' | 'self' | 'already_connected' | 'error' };
  }

  const coupleId: string = joinResult.couple_id;
  const userAId: string = joinResult.user_a_id;

  // Stamp subscription_owner_id so the couple inherits whichever partner has an active paid plan.
  // Errors here are non-fatal: the join already succeeded. Log them for diagnostics.
  const [{ data: subA, error: subAError }, { data: subB, error: subBError }] = await Promise.all([
    supabase.from('subscriptions').select('id').eq('user_id', userAId).eq('status', 'active').maybeSingle(),
    supabase.from('subscriptions').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
  ]);
  if (subAError) logDebugEvent('JOIN_SUB_QUERY_ERROR', { which: 'userA', message: subAError.message });
  if (subBError) logDebugEvent('JOIN_SUB_QUERY_ERROR', { which: 'userB', message: subBError.message });

  const subscriptionOwnerId = subA ? userAId : subB ? userId : null;
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
    .eq('user_a_id', userId)
    .is('user_b_id', null)
    .neq('id', coupleId);

  // Seed scores rows so the points system works from day one.
  const { error: scoresError } = await supabase.from('scores').upsert([
    { couple_id: coupleId, user_id: userAId, points: 0 },
    { couple_id: coupleId, user_id: userId, points: 0 },
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

  return { ok: true, partnerName: partnerProfile?.display_name ?? null, coupleId };
}
