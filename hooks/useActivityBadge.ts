import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export function useActivityBadge(): number {
  const { user, couple } = useAuth();
  const [count, setCount] = useState(0);

  const fetch = useCallback(async () => {
    if (!couple?.id || !user?.id) return;
    const { count: c } = await supabase
      .from('interactions')
      .select('id', { count: 'exact', head: true })
      .eq('couple_id', couple.id)
      .eq('receiver_id', user.id)
      .eq('status', 'sent')
      .eq('is_active', true);
    setCount(c ?? 0);
  }, [couple?.id, user?.id]);

  useEffect(() => {
    if (!couple?.id || !user?.id) return;
    fetch();
    const ch = supabase
      .channel(`activity_badge_${couple.id}_${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'interactions',
        filter: `couple_id=eq.${couple.id}`,
      }, fetch)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'interactions',
        filter: `couple_id=eq.${couple.id}`,
      }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, user?.id, fetch]);

  return count;
}
