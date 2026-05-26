import { supabase } from '@/lib/supabase';
import { isCodeExpired } from '@/lib/inviteCode';

export type JoinResult =
  | { ok: true; partnerName: string | null; coupleId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_full' | 'self' | 'already_connected' | 'error' };

export async function completePendingJoin(
  userId: string,
  code: string,
  onJoined?: () => Promise<void>,
): Promise<JoinResult> {
  const { data: existingCouple } = await supabase
    .from('couples')
    .select('id, active')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .eq('active', true)
    .maybeSingle();
  if (existingCouple) return { ok: false, reason: 'already_connected' };

  const { data: targetCouple, error: fetchError } = await supabase
    .rpc('get_couple_by_invite_code', { code: code.toUpperCase().trim() });

  if (fetchError || !targetCouple) return { ok: false, reason: 'not_found' };

  if (targetCouple.user_a_id === userId) return { ok: false, reason: 'self' };

  if (isCodeExpired(targetCouple.invite_code_expires_at)) return { ok: false, reason: 'expired' };

  if (targetCouple.user_b_id && targetCouple.user_b_id !== userId) {
    return { ok: false, reason: 'already_full' };
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('couples')
    .update({ user_b_id: userId, active: true, invite_code_used_at: now })
    .eq('id', targetCouple.id)
    .is('user_b_id', null);

  if (updateError) {
    const { data: refetched } = await supabase
      .from('couples')
      .select('user_b_id')
      .eq('id', targetCouple.id)
      .maybeSingle();
    if (refetched?.user_b_id && refetched.user_b_id !== userId) {
      return { ok: false, reason: 'already_full' };
    }
    return { ok: false, reason: 'error' };
  }

  const { data: subA } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', targetCouple.user_a_id)
    .eq('status', 'active')
    .maybeSingle();
  const { data: subB } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  const subscriptionOwnerId = subA ? targetCouple.user_a_id : subB ? userId : null;
  if (subscriptionOwnerId) {
    const { error: subUpdateError } = await supabase
      .from('couples')
      .update({ subscription_owner_id: subscriptionOwnerId })
      .eq('id', targetCouple.id);
    if (subUpdateError) {
      console.warn('[completePendingJoin] subscription_owner_id update failed:', subUpdateError.message);
    }
  }

  await supabase
    .from('couples')
    .delete()
    .eq('user_a_id', userId)
    .is('user_b_id', null)
    .neq('id', targetCouple.id);

  await supabase.from('scores').upsert([
    { couple_id: targetCouple.id, user_id: targetCouple.user_a_id, points: 0 },
    { couple_id: targetCouple.id, user_id: userId, points: 0 },
  ]);

  const { data: partnerProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', targetCouple.user_a_id)
    .maybeSingle();

  // Notify caller (typically refreshSubscription) so User B immediately inherits partner's sub
  if (onJoined) {
    onJoined().catch(() => {});
  }

  return { ok: true, partnerName: partnerProfile?.display_name ?? null, coupleId: targetCouple.id };
}
