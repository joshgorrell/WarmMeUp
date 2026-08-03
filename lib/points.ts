import { supabase } from './supabase';

const DEFAULTS: Record<string, number> = {
  dare_accept: 5,
  dare_complete: 25,
  dice_accept: 5,
  dice_complete: 25,
  ask_sent: 5,
  ask_replied: 10,
  wish_sent: 5,
  wish_fulfilled: 20,
  chat_message: 1,
  chat_media: 10,
  vault_upload: 10,
  send_love: 1,
};

let configCache: Record<string, number> | null = null;
let configCachePromise: Promise<Record<string, number>> | null = null;

export async function getPointConfig(): Promise<Record<string, number>> {
  if (configCache) return configCache;
  if (configCachePromise) return configCachePromise;
  configCachePromise = (async (): Promise<Record<string, number>> => {
    const { data } = await supabase.from('point_config').select('event_key, points');
    const result: Record<string, number> = data && data.length > 0
      ? Object.fromEntries(data.map(r => [r.event_key, r.points]))
      : { ...DEFAULTS };
    configCache = result;
    configCachePromise = null;
    return result;
  })();
  return configCachePromise;
}

export function invalidatePointConfigCache() {
  configCache = null;
  configCachePromise = null;
}

export async function getPointValue(eventKey: string): Promise<number> {
  const cfg = await getPointConfig();
  return cfg[eventKey] ?? DEFAULTS[eventKey] ?? 0;
}

export async function awardPoints(
  coupleId: string,
  userId: string,
  points: number,
  reason: string,
  interactionId?: string
) {
  const { error: eventError } = await supabase.from('point_events').insert({
    couple_id: coupleId,
    user_id: userId,
    interaction_id: interactionId || null,
    points,
    reason,
  });
  if (eventError) return; // points are non-critical; never crash the caller

  const { data: existing } = await supabase
    .from('scores')
    .select('points')
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('scores')
      .update({ points: existing.points + points, updated_at: new Date().toISOString() })
      .eq('couple_id', coupleId)
      .eq('user_id', userId);
  } else {
    await supabase.from('scores').insert({
      couple_id: coupleId,
      user_id: userId,
      points,
    });
  }
}

export async function verifyCompletion(
  interactionId: string,
  coupleId: string,
  verifierId: string,
  receiverId: string,
  eventKey: 'dare_complete' | 'dice_complete'
) {
  await supabase
    .from('interactions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_verified_by: verifierId,
    })
    .eq('id', interactionId);

  const pts = await getPointValue(eventKey);
  await awardPoints(coupleId, receiverId, pts, `${eventKey === 'dare_complete' ? 'Dare' : 'Dice'} completed`, interactionId);
}

export async function incrementMonthlyCounter(
  coupleId: string,
  userId: string,
  field: string,
  pointsDelta = 0
) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data: existingRaw } = await supabase
    .from('monthly_scores')
    .select('id, points, ' + field)
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  const existing = existingRaw as { id: string; points: number; [key: string]: unknown } | null;

  if (existing) {
    await supabase
      .from('monthly_scores')
      .update({
        [field]: ((existing[field] as number) ?? 0) + 1,
        points: existing.points + pointsDelta,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('monthly_scores').insert({
      couple_id: coupleId,
      user_id: userId,
      year,
      month,
      [field]: 1,
      points: pointsDelta,
    });
  }
}

export async function reversePoints(
  interactionId: string,
  coupleId: string,
  userId: string
) {
  const { data: events } = await supabase
    .from('point_events')
    .select('points')
    .eq('interaction_id', interactionId)
    .eq('user_id', userId);

  if (!events?.length) return;

  const total = events.reduce((sum, e) => sum + (e.points ?? 0), 0);
  if (total === 0) return;

  const { data: existing } = await supabase
    .from('scores')
    .select('points')
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('scores')
      .update({ points: Math.max(0, existing.points - total), updated_at: new Date().toISOString() })
      .eq('couple_id', coupleId)
      .eq('user_id', userId);
  }

  await supabase.from('point_events').insert({
    couple_id: coupleId,
    user_id: userId,
    interaction_id: interactionId,
    points: -total,
    reason: 'Points reversed — roll deleted',
  });
}

export async function deactivatePreviousEphemeral(coupleId: string, senderId?: string) {
  let query = supabase
    .from('interactions')
    .update({ is_active: false, status: 'cancelled' })
    .eq('couple_id', coupleId)
    .is('deleted_at', null)
    .in('status', ['sent', 'accepted'])
    .in('type', ['dice', 'dare', 'tell_me']);
  if (senderId) query = query.eq('sender_id', senderId);
  await query;
}

// Lazy monthly reset — called on app load. Archives current scores into monthly_scores
// if the current month is newer than the last archived month, then resets scores to 0.
export async function maybeArchiveAndResetScores(coupleId: string, userId: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Check if we already have a row for this month
  const { data: existing } = await supabase
    .from('monthly_scores')
    .select('id')
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existing) return; // Already archived for this month

  // Check if there's anything from a previous month to archive
  const { data: lastMonth } = await supabase
    .from('monthly_scores')
    .select('year, month')
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get current score to snapshot
  const { data: currentScore } = await supabase
    .from('scores')
    .select('points')
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .maybeSingle();

  const currentPoints = currentScore?.points ?? 0;
  if (currentPoints === 0 && !lastMonth) return; // Nothing to archive

  // Gather stats for the period being closed. Use point_events to count by reason.
  const periodStart = lastMonth
    ? new Date(lastMonth.year, lastMonth.month - 1, 1).toISOString()
    : new Date(0).toISOString();

  const { data: events } = await supabase
    .from('point_events')
    .select('reason, points')
    .eq('couple_id', coupleId)
    .eq('user_id', userId)
    .gte('created_at', periodStart);

  const counts = {
    dares_accepted: 0, dares_completed: 0, dares_skipped: 0,
    dice_accepted: 0, dice_completed: 0, dice_skipped: 0,
    asks_sent: 0, asks_replied: 0,
    wishes_sent: 0, wishes_fulfilled: 0,
    chat_messages_sent: 0, media_sent: 0, vault_uploads: 0,
  };

  for (const e of events ?? []) {
    const r = e.reason ?? '';
    if (r.includes('Dare accepted')) counts.dares_accepted++;
    else if (r.includes('Dare completed')) counts.dares_completed++;
    else if (r.includes('Dare') && r.includes('participation')) counts.dares_skipped++;
    else if (r.includes('Dice') && r.includes('accepted')) counts.dice_accepted++;
    else if (r.includes('Dice completed')) counts.dice_completed++;
    else if (r.includes('Dice') && r.includes('participation')) counts.dice_skipped++;
    else if (r.includes('Ask') && r.includes('sent')) counts.asks_sent++;
    else if (r.includes('Ask') && r.includes('replied')) counts.asks_replied++;
    else if (r === 'Wish shared') counts.wishes_sent++;
    else if (r === 'Wish granted') counts.wishes_fulfilled++;
    else if (r === 'Chat message') counts.chat_messages_sent++;
    else if (r === 'Chat media') counts.media_sent++;
    else if (r.includes('Vault upload')) counts.vault_uploads++;
  }

  // Archive previous period into a new monthly_scores row (use last closed month)
  const archiveDate = lastMonth
    ? new Date(lastMonth.year, lastMonth.month, 1) // first of month after last archived
    : new Date(year, month - 1, 1); // current month

  const archiveYear = archiveDate.getFullYear();
  const archiveMonth = archiveDate.getMonth() + 1;

  await supabase.from('monthly_scores').upsert({
    couple_id: coupleId,
    user_id: userId,
    year: archiveYear,
    month: archiveMonth,
    points: currentPoints,
    ...counts,
  }, { onConflict: 'couple_id,user_id,year,month' });

  // Reset rolling score to 0
  await supabase
    .from('scores')
    .update({ points: 0, updated_at: new Date().toISOString() })
    .eq('couple_id', coupleId)
    .eq('user_id', userId);
}
