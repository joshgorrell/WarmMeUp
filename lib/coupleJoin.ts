import { supabase } from '@/lib/supabase';

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

  const { data: subA } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userAId)
    .eq('status', 'active')
    .maybeSingle();
  const { data: subB } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  const subscriptionOwnerId = subA ? userAId : subB ? userId : null;
  if (subscriptionOwnerId) {
    await supabase
      .from('couples')
      .update({ subscription_owner_id: subscriptionOwnerId })
      .eq('id', coupleId);
  }

  await supabase
    .from('couples')
    .delete()
    .eq('user_a_id', userId)
    .is('user_b_id', null)
    .neq('id', coupleId);

  await supabase.from('scores').upsert([
    { couple_id: coupleId, user_id: userAId, points: 0 },
    { couple_id: coupleId, user_id: userId, points: 0 },
  ]);

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
