import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';
import AppText from '@/components/AppText';
import PrimaryButton from '@/components/PrimaryButton';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, refreshProfile, refreshSettings } = useAuth();

  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // Preserve the user's selected finish action across a failed save + retry
  // so "invite partner" doesn't silently become "enter app" on retry.
  const pendingActionRef = useRef<OnboardingFinishAction | undefined>(undefined);

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
    setSaveError(false);
    pendingActionRef.current = action;

    if (!user) {
      setCompleting(false);
      return;
    }

    // Independently verify that all required registration fields are present
    // before marking onboarding complete. If any are missing, route the user
    // back to registration completion instead of writing the timestamp.
    const { data: prof } = await supabase
      .from('profiles')
      .select('first_name, last_name, date_of_birth, age_verified_at, tos_accepted_at')
      .eq('id', user.id)
      .maybeSingle();

    const registrationComplete = !!(
      prof?.first_name &&
      prof?.last_name &&
      prof?.date_of_birth &&
      prof?.age_verified_at &&
      prof?.tos_accepted_at
    );

    if (!registrationComplete) {
      router.replace({ pathname: '/(auth)/register', params: { oauthComplete: '1' } });
      return;
    }

    const nowIso = new Date().toISOString();

    // Mark onboarding_seen on user_settings — checked write
    const { error: settingsError } = await supabase
      .from('user_settings')
      .update({ onboarding_seen: true, updated_at: nowIso })
      .eq('user_id', user.id);

    if (settingsError) {
      setSaveError(true);
      setCompleting(false);
      return;
    }

    // Mark onboarding_completed_at on profiles — checked write
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ onboarding_completed_at: nowIso })
      .eq('id', user.id);

    if (profileError) {
      setSaveError(true);
      setCompleting(false);
      return;
    }

    // Refresh in-memory state so routing uses current data
    await Promise.all([
      refreshProfile(),
      refreshSettings(),
    ]);

    finish(pendingActionRef.current);
  }, [completing, user, refreshProfile, refreshSettings, finish, router]);

  const handleRetry = useCallback(() => {
    handleComplete(pendingActionRef.current);
  }, [handleComplete]);

  if (saveError) {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorCard}>
          <AppText style={styles.errorTitle}>Could not save</AppText>
          <AppText style={styles.errorBody}>
            We could not save your progress. Please check your internet connection and try again.
          </AppText>
          <PrimaryButton label="Try Again" onPress={handleRetry} loading={completing} />
        </View>
      </View>
    );
  }

  return <OnboardingCarousel mode="post-auth" onComplete={handleComplete} />;
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#060406',
  },
  errorCard: {
    alignItems: 'center',
    gap: 16,
    maxWidth: 340,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Inter-Bold',
  },
  errorBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
});
