import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Image, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { pendingNotificationRoute } from './_layout';
import type { NotificationData } from '@/lib/notifications';

const SLOGAN = require('@/assets/images/WMU_Stay_Playful_copy.PNG');
// Image natural dimensions: ~774 × 228 px → aspect ratio ≈ 0.2948
const SLOGAN_ASPECT = 228 / 774;

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

export default function TransitionScreen() {
  const router = useRouter();
  const { couple, partnerProfile, settings, user, isAdmin, loading } = useAuth();
  const { width } = useWindowDimensions();
  const sloganW = Math.min(width * 0.72, 320);
  const sloganH = Math.round(sloganW * SLOGAN_ASPECT);
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const sloganScale = useRef(new Animated.Value(0.94)).current;
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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(sloganOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(sloganScale, { toValue: 1.0, friction: 8, tension: 80, useNativeDriver: true }),
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
      <Animated.View style={{ transform: [{ scale: sloganScale }], opacity: sloganOpacity }}>
        <Image
          source={SLOGAN}
          style={{ width: sloganW, height: sloganH }}
          resizeMode="contain"
        />
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
  },
});
