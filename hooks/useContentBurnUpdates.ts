import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { clearGalleryItems, evictAllCachedUrls } from '@/lib/mediaGalleryStore';
import { clearLocalImageCache } from '@/lib/mediaCache';

export function useContentBurnUpdates(coupleId: string | undefined, reload: () => void | Promise<void>): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    if (!coupleId) return;
    let busy=false, disposed=false;
    let revision: number | null | undefined;
    const refresh=async()=>{
      if (busy || disposed || AppState.currentState!=='active') return;
      busy=true;
      try {
        clearGalleryItems(); evictAllCachedUrls(); await clearLocalImageCache();
        if (!disposed) await reloadRef.current();
      } finally { busy=false; }
    };
    const channel=supabase.channel(uniqueRealtimeTopic(`burns_${coupleId}`))
      .on('postgres_changes',{event:'*',schema:'public',table:'couple_content_changes',filter:`couple_id=eq.${coupleId}`},(payload)=>{ revision=(payload.new as {revision?:number}).revision ?? null; refresh().catch(()=>{}) })
      .subscribe();
    // Recover from missed realtime events/reconnects without exposing any
    // unrelated couple's deletion IDs through a global DELETE subscription.
    const poll=async()=>{
      if (disposed || AppState.currentState!=='active') return;
      const {data,error}=await supabase.from('couple_content_changes').select('revision').eq('couple_id',coupleId).maybeSingle();
      if (error || disposed) return;
      const next=data?.revision ?? null;
      if (revision !== undefined && revision !== next) await refresh();
      revision=next;
    };
    poll().catch(()=>{});
    const timer=setInterval(()=>{poll().catch(()=>{})},15_000);
    const appState=AppState.addEventListener('change',state=>{if(state==='active')poll().catch(()=>{})});
    return ()=>{disposed=true;clearInterval(timer);appState.remove();supabase.removeChannel(channel)};
  },[coupleId]);
}
