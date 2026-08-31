import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';

export type CustomPromptNoticeState = 'unknown' | 'yes' | 'no';

export function useCustomPromptNotice(
  coupleId: string | null | undefined,
  table: 'dice_prompts' | 'dare_prompts',
): CustomPromptNoticeState {
  const [state, setState] = useState<CustomPromptNoticeState>('unknown');

  useFocusEffect(
    useCallback(() => {
      if (!coupleId) {
        setState('unknown');
        return;
      }

      let cancelled = false;
      setState('unknown');

      (async () => {
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .eq('couple_id', coupleId)
          .eq('is_default', false)
          .eq('is_active', true)
          .limit(1);

        if (!cancelled && !error) {
          setState(data?.length ? 'yes' : 'no');
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [coupleId, table]),
  );

  return state;
}
