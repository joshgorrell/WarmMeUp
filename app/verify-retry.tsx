import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { logger } from '@/lib/logger';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';
import PrimaryButton from '@/components/PrimaryButton';
import AppText from '@/components/AppText';

export default function VerifyRetryScreen() {
  const router = useRouter();
  const { refreshSubscription, refreshProfile, refreshCouple } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const autoRetryStarted = useRef(false);

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    logger.log('[VERIFY-RETRY] retry triggered');
    try {
      await Promise.all([refreshProfile(), refreshCouple(), refreshSubscription()]);
      // Only return to transition after the refresh itself succeeds. This avoids
      // looping between transition and this screen during a genuine outage.
      router.replace('/transition');
    } catch (err) {
      logger.log('[VERIFY-RETRY] retry error:', String(err));
      setRetrying(false);
    }
  }, [refreshProfile, refreshCouple, refreshSubscription, retrying, router]);

  useEffect(() => {
    if (autoRetryStarted.current) return;
    autoRetryStarted.current = true;

    // Most visits to this screen are a cold/resume timing race. Retry once
    // automatically so a healthy account does not require a manual tap.
    const timer = setTimeout(() => {
      handleRetry();
    }, 300);

    return () => clearTimeout(timer);
  }, [handleRetry]);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <WarmupLogo size={72} />
        <WarmupWordmark size={16} />
        <View style={{ height: 28 }} />
        <AppText style={styles.title}>We&apos;re having trouble verifying your account.</AppText>
        <AppText style={styles.subtitle}>
          {retrying ? 'Reconnecting…' : 'Check your connection and try again.'}
        </AppText>
        <View style={{ height: 24 }} />
        {retrying ? (
          <ActivityIndicator color="#FF2E8A" size="small" />
        ) : (
          <PrimaryButton label="Retry" onPress={handleRetry} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050507',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    lineHeight: 24,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
