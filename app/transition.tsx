import React, { useEffect, useRef } from 'react';
import { Image, StyleSheet, Animated, useWindowDimensions, View } from 'react-native';
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
    case 'dice_roll':
    case 'dice_accepted':
    case 'dice_completed':
      return '/(app)/(tabs)/dice';
    default:
      return null;
  }
}

const SLOGAN_SOURCE = require('@/assets/images/image_(2).png');

export default function TransitionScreen() {
  const router = useRouter();
  const { couple, partnerProfile, settings, user, isAdmin, loading } = useAuth();
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.5, 200);
  const sloganW = Math.min(width * 0.78, 320);
  const sloganH = sloganW * 0.5;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const routed = useRef(false);
  const animDone = useRef(false);
  const authReady = useRef(false);

  const tryNavigate = () => {
    if (!animDone.current || !authReady.current) return;
    if (routed.current) return;
    routed.current = true;
    Animated.timing(bgOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(async () => {
      if (couple?.active || isAdmin) {
        // Show the celebration screen once for user A (who shared the code) when
        // the couple first becomes active and they haven't seen it yet.
        const needsCelebration = couple?.active && !isAdmin && settings && !settings.celebration_seen;
        if (needsCelebration && user) {
          // Mark as seen before navigating so a reload doesn't re-show it.
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
        // After gates are cleared, honour any pending notification deep-link.
        // Pass the destination as a param rather than calling router.push() 100ms
        // later — that setTimeout races the replace and can crash the navigator.
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

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(bgOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1.0, friction: 8, tension: 80, useNativeDriver: true }),
      ]),
      Animated.timing(sloganOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      animDone.current = true;
      tryNavigate();
    });
  }, []);

  useEffect(() => {
    if (!loading) {
      authReady.current = true;
      tryNavigate();
    }
  }, [loading, couple, isAdmin]);

  return (
    <Animated.View style={[styles.root, { opacity: bgOpacity }]}>
      <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center', gap: 8 }}>
        <WarmupLogo size={logoW} />
        <WarmupWordmark size={18} />
      </Animated.View>
      <Animated.Image
        source={SLOGAN_SOURCE}
        style={[{ width: sloganW, height: sloganH }, { opacity: sloganOpacity }]}
        resizeMode="contain"
      />
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
