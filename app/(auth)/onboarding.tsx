import React from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';

export default function OnboardingScreen() {
  const router = useRouter();
  const { paired } = useLocalSearchParams<{ paired?: string }>();
  const isPaired = paired === '1';
  const { user } = useAuth();

  const handleComplete = async (_action?: OnboardingFinishAction) => {
    if (user) {
      await supabase
        .from('user_settings')
        .update({ onboarding_seen: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }
    if (isPaired) {
      router.replace('/(app)/(tabs)');
    } else {
      router.replace('/(auth)/subscription');
    }
  };

  return <OnboardingCarousel mode="post-auth" onComplete={handleComplete} />;
}
