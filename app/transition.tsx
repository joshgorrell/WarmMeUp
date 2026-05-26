import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';
import { pendingNotificationRoute } from './_layout';
import type { NotificationData } from '@/lib/notifications';

function resolveNotificationRoute(data: NotificationData): string | null {
  switch (data.event_type) {
    case 'new_message':
      return '/(app)/(tabs)/note';
    case 'new_vault_item':
      return '/(app)/(tabs)/vault';
    case 'new_dare':
    case 'dare_accepted':
    case 'dare_rejected':
    case 'dare_completed':
      return '/(app)/(tabs)/dare';
    case 'new_ask':
    case 'ask_answered':
      return '/(app)/(tabs)/ask';
    case 'new_wish':
    case 'wish_fulfilled':
      return '/(app)/(tabs)/wish';
    case 'dice_roll':
    case 'dice_accepted':
    case 'dice_completed':
      return '/(app)/(tabs)/dice';
    default:
      return null;
  }
}

// Maximum time to wait for couple data to arrive after auth is ready.
// If couple is still null after this, we proceed to /(auth)/pair.
const COUPLE_WAIT_MS = 2500;

export default function TransitionScreen() {
  const router = useRouter();
  const { couple, partnerProfile, settings, user, isAdmin, loading } = useAuth();
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.5, 200);
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const routed = useRef(false);
  const animDone = useRef(false);
  const authReady = useRef(false);
  const coupleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = () => {
    if (routed.current) return;
    if (coupleTimeoutRef.current) {
      clearTimeout(coupleTimeoutRef.current);
      coupleTimeoutRef.current = null;
    }
    routed.current = true;
    Animated.timing(bgOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(async () => {
      if (couple?.active || isAdmin) {
        const needsCelebration = couple?.active && !!couple?.user_b_id && !isAdmin && settings && !settings.celebration_seen;
        if (needsCelebration && user) {
          await supabase
            .from('user_settings')
            .update({ celebration_seen: true, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: partnerProfile?.display_name || '' },
          });
          return;
        }
        const intent = pendingNotificationRoute.current;
        const notifDest = intent ? resolveNotificationRoute(intent) : null;
        if (intent) pendingNotificationRoute.current = null;
        router.replace({
          pathname: '/(app)/(tabs)',
          params: notifDest ? { pendingTab: notifDest } : {},
        });
      } else {
        router.replace('/(auth)/pair');
      }
    });
  };

  const tryNavigate = () => {
    if (routed.current) return;
    if (!animDone.current || !authReady.current) return;

    // Couple arrives slightly after loading=false due to React batching.
    // Wait up to COUPLE_WAIT_MS; if still null after that, proceed anyway.
    if (user && !couple) {
      if (!coupleTimeoutRef.current) {
        coupleTimeoutRef.current = setTimeout(() => {
          coupleTimeoutRef.current = null;
          navigate();
        }, COUPLE_WAIT_MS);
      }
      return;
    }

    navigate();
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1.0, friction: 8, tension: 80, useNativeDriver: true }),
    ]).start(() => {
      animDone.current = true;
      tryNavigate();
    });

    return () => {
      if (coupleTimeoutRef.current) clearTimeout(coupleTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      authReady.current = true;
      tryNavigate();
    }
  }, [loading, couple?.id, couple?.active, user?.id, isAdmin]);

  return (
    <Animated.View style={[styles.root, { opacity: bgOpacity }]}>
      <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center', gap: 8 }}>
        <WarmupLogo size={logoW} />
        <WarmupWordmark size={18} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050507',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
