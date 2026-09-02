import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';

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

  const [completing, setCompleting] = useState(false);

  const finish = useCallback((action?: OnboardingFinishAction) => {
    if (action === 'invite-partner') {
      router.replace('/(auth)/pair');
    } else {
      router.replace('/(app)/(tabs)');
    }
  }, [router]);

  const handleComplete = useCallback(async (action?: OnboardingFinishAction) => {
    if (completing) return;
    setCompleting(true);

    // Mark onboarding as seen so the tour never reappears
    if (user) {
      await supabase
        .from('user_settings')
        .update({ onboarding_seen: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      // Mark onboarding as completed on the profile so the router can
      // distinguish "never finished onboarding" from "returning user."
      await supabase
        .from('profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    // If subscription info is still loading, give it a brief moment before launching
    if (!subscriptionInfo.loading) {
      finish(action);
      return;
    }
    refreshSubscription().catch(() => {});
    setTimeout(() => {
      setCompleting(prev => {
        if (prev) finish(action);
        return false;
      });
    }, 600);
  }, [completing, user, subscriptionInfo.loading, refreshSubscription, finish]);

  return <OnboardingCarousel mode="post-auth" onComplete={handleComplete} />;
}
