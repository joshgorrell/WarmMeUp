import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * Archive old scores and reset both partners' points to zero.
 * Called when the user taps "Reset Points" in settings.
 */
export async function maybeArchiveAndResetScores(coupleId: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .rpc('archive_and_reset_scores', { p_couple_id: coupleId, p_user_id: userId });

    if (error) {
      logger.warn('[points] archive_and_reset_scores error:', error.message);
      return false;
    }

    return data ?? false;
  } catch (e: any) {
    logger.warn('[points] maybeArchiveAndResetScores failed:', e?.message);
    return false;
  }
}
