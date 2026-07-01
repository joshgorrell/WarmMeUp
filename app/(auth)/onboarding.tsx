import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';

// Maximum time to wait for subscription info before routing anyway.
// Every new user has a 7-day trial created by DB trigger, so if it takes
// longer than this to confirm, just let them into the app.
const SUB_WAIT_MS = 600;

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, settings, subscriptionInfo, refreshSubscription } = useAuth();

  // Safety net: if the user has already seen onboarding (e.g. they were sent here
  // by a stale navigation), redirect immediately rather than showing it again.
  useEffect(() => {
    if (settings?.onboarding_seen) {
      router.replace('/(app)/(tabs)');
    }
  }, [settings?.onboarding_seen]);

  // Pending completion flag: set when the user taps complete while sub is still loading.
  const pendingComplete = useRef(false);
  const [completing, setCompleting] = useState(false);

  // Once sub resolves after a pending complete, route appropriately.
  useEffect(() => {
    if (!pendingComplete.current) return;
    if (subscriptionInfo.loading) return;
    pendingComplete.current = false;
    router.replace('/(app)/(tabs)');
  }, [subscriptionInfo.loading, subscriptionInfo.isPremium]);

  const handleComplete = async (_action?: OnboardingFinishAction) => {
    if (completing) return;
    setCompleting(true);

    if (user) {
      await supabase
        .from('user_settings')
        .update({ onboarding_seen: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    // If sub is already resolved, route immediately.
    if (!subscriptionInfo.loading) {
      router.replace('/(app)/(tabs)');
      return;
    }

    // Sub still loading — trigger a refresh and wait up to SUB_WAIT_MS.
    // Every new user has a 7-day trial from the DB trigger, so we always
    // route to the app; the paywall is never the destination right after signup.
    refreshSubscription().catch(() => {});
    pendingComplete.current = true;

    setTimeout(() => {
      if (pendingComplete.current) {
        pendingComplete.current = false;
        router.replace('/(app)/(tabs)');
      }
    }, SUB_WAIT_MS);
  };

  return <OnboardingCarousel mode="post-auth" onComplete={handleComplete} />;
}
