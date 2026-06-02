import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { MediaReaction } from '@/lib/types';

export type ReactionsMap = Record<string, MediaReaction[]>;

export function useMediaReactions(
  coupleId: string | undefined,
  userId: string | undefined,
  sourceTable: 'chat_messages' | 'vault_items',
  sourceIds: string[],
) {
  const [reactionsMap, setReactionsMap] = useState<ReactionsMap>({});
  const sourceIdsRef = useRef<string[]>(sourceIds);
  sourceIdsRef.current = sourceIds;

  const fetchReactions = useCallback(async () => {
    if (!coupleId || sourceIdsRef.current.length === 0) return;
    const { data } = await supabase
      .from('media_reactions')
      .select('*')
      .eq('couple_id', coupleId)
      .eq('source_table', sourceTable)
      .in('source_id', sourceIdsRef.current);
    if (!data) return;
    const map: ReactionsMap = {};
    for (const r of data) {
      if (!map[r.source_id]) map[r.source_id] = [];
      map[r.source_id].push(r as MediaReaction);
    }
    setReactionsMap(map);
  }, [coupleId, sourceTable]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // Re-fetch when the set of IDs changes (new messages loaded)
  const prevIdsKey = sourceIds.join(',');
  useEffect(() => {
    fetchReactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevIdsKey]);

  // Realtime subscription
  useEffect(() => {
    if (!coupleId) return;
    const channel = supabase
      .channel(`media_reactions_${coupleId}_${sourceTable}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'media_reactions',
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as MediaReaction | null;
          if (!row || row.source_table !== sourceTable) return;
          setReactionsMap(prev => {
            const next = { ...prev };
            if (payload.eventType === 'DELETE') {
              const old = payload.old as MediaReaction;
              next[old.source_id] = (next[old.source_id] ?? []).filter(r => r.id !== old.id);
            } else if (payload.eventType === 'INSERT') {
              const r = payload.new as MediaReaction;
              const existing = (next[r.source_id] ?? []).filter(x => x.user_id !== r.user_id);
              next[r.source_id] = [...existing, r];
            } else if (payload.eventType === 'UPDATE') {
              const r = payload.new as MediaReaction;
              const existing = (next[r.source_id] ?? []).filter(x => x.id !== r.id);
              next[r.source_id] = [...existing, r];
            }
            return next;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [coupleId, sourceTable]);

  const react = useCallback(async (
    sourceId: string,
    emoji: string,
    contentOwnerUserId: string,
    vaultItemId?: string,
  ) => {
    if (!coupleId || !userId) return;
    const current = (reactionsMap[sourceId] ?? []).find(r => r.user_id === userId);

    if (current?.emoji === emoji) {
      // Toggle off — delete
      await supabase.from('media_reactions').delete().eq('id', current.id);
    } else {
      // Upsert (replaces previous reaction for this user)
      await supabase.from('media_reactions').upsert(
        { couple_id: coupleId, user_id: userId, source_table: sourceTable, source_id: sourceId, emoji },
        { onConflict: 'user_id,source_table,source_id' }
      );

      // Log activity event only when reacting to someone else's content
      if (userId !== contentOwnerUserId) {
        const mediaType = vaultItemId ? 'photo' : undefined;
        await supabase.from('activity_events').insert({
          couple_id: coupleId,
          actor_user_id: userId,
          target_user_id: contentOwnerUserId,
          event_type: 'media_reaction',
          vault_item_id: vaultItemId ?? null,
          metadata: {
            emoji,
            source_table: sourceTable,
            source_id: sourceId,
            ...(mediaType ? { media_type: mediaType } : {}),
          },
        });
      }
    }
  }, [coupleId, userId, sourceTable, reactionsMap]);

  return { reactionsMap, react, refetch: fetchReactions };
}
