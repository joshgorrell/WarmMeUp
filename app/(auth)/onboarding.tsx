import { registerForPushNotifications, savePushToken } from '@/lib/notifications';
import { registrationComplete as isRegistrationComplete } from '@/lib/registration';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import OnboardingCarousel, { OnboardingFinishAction } from '@/components/OnboardingCarousel';
import AppText from '@/components/AppText';
import { loadPendingCode, savePendingCode, clearPendingCode } from '@/lib/inviteCode';
import { completePendingJoin, isDefinitiveJoinFailure } from '@/lib/coupleJoin';
import PrimaryButton from '@/components/PrimaryButton';

export default function OnboardingScreen() {
  const router = useRouter();
  const { pendingCode } = useLocalSearchParams<{ pendingCode?: string }>();
  const { user, couple, refreshCouple, refreshProfile, refreshSettings } = useAuth();

  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const alreadyPaired = !!(couple?.active && couple?.user_b_id);

  useEffect(() => {
    if (user) refreshCouple().catch(() => {});
  }, [user?.id, refreshCouple]);

  // Preserve the user's selected finish action across a failed save + retry
  // so "invite partner" doesn't silently become "enter app" on retry.
  const pendingActionRef = useRef<OnboardingFinishAction | undefined>(undefined);

  const savingRef = useRef(false);
  const handleComplete = useCallback(async (action?: OnboardingFinishAction) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setCompleting(true); setSaveError(false);
    pendingActionRef.current = action;
    try {
      if (!user) { router.replace('/(auth)/login'); return; }
      const code = pendingCode || (await loadPendingCode()) || '';
      if (code) await savePendingCode(code);
      const { data: prof, error: readError } = await supabase.from('profiles')
        .select('first_name,last_name,date_of_birth,age_verified_at,tos_accepted_at,onboarding_completed_at')
        .eq('id', user.id).single();
      if (readError) throw readError;
      if (!isRegistrationComplete(prof)) {
        router.replace({ pathname: '/(auth)/register', params: { oauthComplete: '1', ...(code ? { pendingCode: code } : {}) } });
        return;
      }
      const nowIso = new Date().toISOString();
      const { data: savedSettings, error: settingsError } = await supabase.from('user_settings')
        .update({ onboarding_seen: true, updated_at: nowIso }).eq('user_id', user.id).select('user_id').single();
      if (settingsError || !savedSettings) throw settingsError || new Error('Settings missing');
      const { data: savedProfile, error: profileError } = await supabase.from('profiles')
        .update({ onboarding_completed_at: nowIso }).eq('id', user.id).select('id').single();
      if (profileError || !savedProfile) throw profileError || new Error('Profile missing');
      await Promise.all([refreshProfile(), refreshSettings(), refreshCouple()]);
      if (!prof.onboarding_completed_at) {
        // Ask after registration is finished, once for a new account. Denial never blocks setup.
        void registerForPushNotifications().then(async token => {
          const { data } = await supabase.auth.getSession();
          if (token && data.session?.user.id === user.id) { await savePushToken(user.id, token); await refreshSettings(); }
        }).catch(() => {});
      }
      const { data: activeCouple, error: coupleError } = await supabase.from('couples')
        .select('id,user_b_id,active').eq('active', true)
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`).not('user_b_id', 'is', null).limit(1).maybeSingle();
      if (coupleError) throw coupleError;
      if (!activeCouple && code) {
        const result = await completePendingJoin(code);
        if (result.ok) {
          await clearPendingCode();
          await refreshCouple();
          router.replace({ pathname: '/(auth)/paired-celebration', params: { partnerName: result.inviterName || '', partnerAvatar: result.inviterAvatar || '' } });
          return;
        }
        if (isDefinitiveJoinFailure(result.reason)) await clearPendingCode();
        router.replace({ pathname: '/(auth)/pair', params: { prefilledCode: code } });
        return;
      }
      if (activeCouple) { if (code) await clearPendingCode(); router.replace('/transition'); }
      else router.replace('/(auth)/pair');
    } catch { setSaveError(true); }
    finally { savingRef.current = false; setCompleting(false); }
  }, [user, pendingCode, refreshCouple, refreshProfile, refreshSettings, router]);

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

  return <OnboardingCarousel mode="post-auth" alreadyPaired={alreadyPaired} busy={completing} onComplete={handleComplete} />;
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
