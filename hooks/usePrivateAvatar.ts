import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

/** Stored public-format URLs are locators only; private Storage authorizes signatures. */
export function usePrivateAvatar(uri?: string | null): string | null {
  const { user } = useAuth();
  const [resolved,setResolved] = useState<string | null>(null);
  useEffect(() => {
    let cancelled=false;
    setResolved(null);
    if (!uri || !user) return;
    if (/^(file:|ph:|content:|blob:|data:)/.test(uri)) { setResolved(uri); return; }
    let path: string;
    try {
      const locator=new URL(uri), project=new URL(process.env.EXPO_PUBLIC_SUPABASE_URL!);
      if (locator.origin!==project.origin) return;
      const match=locator.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/avatars\/(.+)$/);
      if (!match) return;
      path=decodeURIComponent(match[1]);
    } catch { return; }
    const refresh=async()=>{
      const {data,error}=await supabase.storage.from('avatars').createSignedUrl(path,5*60);
      if (!cancelled) setResolved(!error ? data?.signedUrl ?? null : null);
    };
    refresh();
    const timer=setInterval(refresh,4*60_000);
    return ()=>{cancelled=true;clearInterval(timer)};
  },[uri,user?.id]);
  return resolved;
}
