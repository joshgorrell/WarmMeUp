import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';

export default function OnboardingScreen() {
  const router = useRouter();
  const { settings } = useAuth();

  // Safety net: if the user has already seen onboarding (e.g. they were sent here
  // by a stale navigation), redirect immediately rather than showing it again.
  useEffect(() => {
    if (settings?.onboarding_seen) {
      router.replace('/(app)/(tabs)');
    }
  }, [settings?.onboarding_seen]);

  const [completing, setCompleting] = useState(false);

  const handleComplete = (_action?: OnboardingFinishAction) => {
    if (completing) return;
    setCompleting(true);
    router.replace('/(auth)/complete-profile');
  };

  return <OnboardingCarousel mode="post-auth" onComplete={handleComplete} />;
}
