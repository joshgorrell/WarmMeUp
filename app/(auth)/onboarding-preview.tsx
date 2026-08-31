import React from 'react';
import { useRouter } from 'expo-router';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';

export default function OnboardingPreviewScreen() {
  const router = useRouter();

  const handleComplete = (_action?: OnboardingFinishAction) => {
    // Both "Get Started" and "Invite Your Partner" land on register —
    // partner invitation happens after account creation.
    router.replace('/(auth)/register');
  };

  return <OnboardingCarousel mode="preview" onComplete={handleComplete} />;
}
