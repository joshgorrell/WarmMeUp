import { supabase } from './supabase';
import { clearGalleryItems, evictAllCachedUrls } from './mediaGalleryStore';
import { clearLocalImageCache } from './mediaCache';

export type BurnCategory = 'all' | 'chat' | 'vault' | 'wish' | 'dice' | 'dare' | 'activity' | 'points';
export async function burnContent(coupleId: string, kind: 'chat' | 'vault' | 'wish' | 'categories',
  ids: string[] = [], categories: BurnCategory[] = []): Promise<void> {
  let body: Record<string, unknown> = { couple_id: coupleId, kind, ids, categories };
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.functions.invoke('burn-content', { body });
    if (error) throw new Error('Could not confirm deletion. Reconnect and try again.');
    if (!data?.job_id || !['pending','complete'].includes(data.state)) throw new Error('Could not confirm deletion.');
    // Accepted requests have removed database content. Clear our own managed
    // caches even when physical file cleanup is still pending.
    clearGalleryItems(); evictAllCachedUrls(); await clearLocalImageCache();
    if (data.state === 'complete') return;
    body = { job_id: data.job_id };
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Content removed from the app. File cleanup is still pending and will retry automatically; deletion is not yet confirmed complete.');
}
