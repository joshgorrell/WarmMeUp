import { supabase } from './supabase';

export type ActivityViewItem = {
  sourceTable: 'interactions' | 'chat_messages' | 'activity_events';
  sourceId: string;
};

export async function markViewed(
  item: ActivityViewItem,
  coupleId: string,
  userId: string,
) {
  await supabase.from('activity_views').insert({
    couple_id: coupleId,
    user_id: userId,
    source_table: item.sourceTable,
    source_id: item.sourceId,
  }).then(() => {});
}

export async function markAllViewed(
  items: ActivityViewItem[],
  coupleId: string,
  userId: string,
) {
  if (!items.length) return;
  const rows = items.map(item => ({
    couple_id: coupleId,
    user_id: userId,
    source_table: item.sourceTable,
    source_id: item.sourceId,
  }));
  await supabase.from('activity_views').upsert(rows, {
    onConflict: 'user_id,source_table,source_id',
    ignoreDuplicates: true,
  }).then(() => {});
}
