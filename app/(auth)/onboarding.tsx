import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, settings, subscriptionInfo } = useAuth();

  // Safety net: if the user has already seen onboarding (e.g. they were sent here
  // by a stale navigation), redirect immediately rather than showing it again.
  useEffect(() => {
    if (settings?.onboarding_seen) {
      router.replace('/(app)/(tabs)');
    }
  }, [settings?.onboarding_seen]);

  const handleComplete = async (_action?: OnboardingFinishAction) => {
    if (user) {
      await supabase
        .from('user_settings')
        .update({ onboarding_seen: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }
    if (subscriptionInfo.isPremium) {
      router.replace('/(app)/(tabs)');
    } else {
      router.replace('/(auth)/subscription');
    }
  };

  return <OnboardingCarousel mode="post-auth" onComplete={handleComplete} />;
}
