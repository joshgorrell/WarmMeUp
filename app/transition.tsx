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
const COUPLE_WAIT_MS = 2500;
// Maximum time to wait for subscription info — it's a separate async fetch.
const SUB_WAIT_MS = 3500;
// Absolute hard deadline — transition MUST resolve within this time no matter what.
const HARD_DEADLINE_MS = 5000;

export default function TransitionScreen() {
  const router = useRouter();
  const { couple, partnerProfile, settings, user, isAdmin, loading, subscriptionInfo } = useAuth();
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.5, 200);
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const routed = useRef(false);
  const animDone = useRef(false);
  const authReady = useRef(false);
  const coupleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = () => {
    if (routed.current) return;

    console.log('[transition] navigate called — loading:', loading, 'isAdmin:', isAdmin,
      'user:', user?.id ?? 'null',
      'couple:', couple ? `id=${couple.id} active=${couple.active}` : 'null',
      'sub.loading:', subscriptionInfo.loading,
      'sub.isPremium:', subscriptionInfo.isPremium,
      'sub.isOnTrial:', subscriptionInfo.isOnTrial,
      'settings.login_method:', settings?.login_method ?? 'null',
      'settings.lock_after_seconds:', settings?.lock_after_seconds ?? 'null',
    );

    // Admins bypass subscription checks entirely — never wait on sub loading.
    // If subscription info hasn't resolved yet for non-admins, defer to avoid
    // routing with the default isPremium:false while still loading.
    if (!isAdmin && subscriptionInfo.loading) {
      if (!subTimeoutRef.current) {
        subTimeoutRef.current = setTimeout(() => {
          subTimeoutRef.current = null;
          console.log('[transition] sub timeout fired — forcing navigate');
          navigate();
        }, SUB_WAIT_MS);
      }
      return;
    }

    if (coupleTimeoutRef.current) {
      clearTimeout(coupleTimeoutRef.current);
      coupleTimeoutRef.current = null;
    }
    if (subTimeoutRef.current) {
      clearTimeout(subTimeoutRef.current);
      subTimeoutRef.current = null;
    }
    if (hardDeadlineRef.current) {
      clearTimeout(hardDeadlineRef.current);
      hardDeadlineRef.current = null;
    }
    routed.current = true;
    Animated.timing(bgOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(async () => {
      // Admins bypass all subscription checks
      if (isAdmin) {
        console.log('[transition] → /(app)/(tabs) [admin]');
        router.replace('/(app)/(tabs)');
        return;
      }

      if (couple?.active) {
        // Check subscription access: isPremium covers active trial AND paid AND partner-paid
        if (!subscriptionInfo.isPremium) {
          const reason = subscriptionInfo.trialExpired ? 'expired_trial' : undefined;
          console.log('[transition] → subscription [not premium, reason:', reason ?? 'none', ']');
          router.replace({ pathname: '/(auth)/subscription', params: reason ? { reason } : {} });
          return;
        }

        const needsCelebration = !!couple.user_b_id && settings && !settings.celebration_seen;
        if (needsCelebration && user) {
          await supabase
            .from('user_settings')
            .update({ celebration_seen: true, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          console.log('[transition] → paired-celebration');
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: partnerProfile?.display_name || '' },
          });
          return;
        }
        const intent = pendingNotificationRoute.current;
        const notifDest = intent ? resolveNotificationRoute(intent) : null;
        if (intent) pendingNotificationRoute.current = null;
        console.log('[transition] → /(app)/(tabs)', notifDest ? `pendingTab=${notifDest}` : '');
        router.replace({
          pathname: '/(app)/(tabs)',
          params: notifDest ? { pendingTab: notifDest } : {},
        });
      } else {
        console.log('[transition] → /(auth)/pair [no active couple]');
        router.replace('/(auth)/pair');
      }
    });
  };

  const tryNavigate = () => {
    if (routed.current) return;
    if (!animDone.current || !authReady.current) return;

    console.log('[transition] tryNavigate — couple:', couple ? `id=${couple.id}` : 'null', 'user:', user?.id ?? 'null');

    // Couple arrives slightly after loading=false due to React batching.
    if (user && !couple) {
      if (!coupleTimeoutRef.current) {
        coupleTimeoutRef.current = setTimeout(() => {
          coupleTimeoutRef.current = null;
          console.log('[transition] couple timeout fired — forcing navigate');
          navigate();
        }, COUPLE_WAIT_MS);
      }
      return;
    }

    // navigate() itself will wait for subscriptionInfo to resolve.
    navigate();
  };

  useEffect(() => {
    // Hard deadline: if transition hasn't resolved within 5s, force safe fallback.
    hardDeadlineRef.current = setTimeout(() => {
      hardDeadlineRef.current = null;
      if (!routed.current) {
        console.warn('[transition] HARD DEADLINE reached — forcing /(app)/(tabs) fallback');
        routed.current = true;
        router.replace('/(app)/(tabs)');
      }
    }, HARD_DEADLINE_MS);

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
      if (subTimeoutRef.current) clearTimeout(subTimeoutRef.current);
      if (hardDeadlineRef.current) clearTimeout(hardDeadlineRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      authReady.current = true;
      tryNavigate();
    }
  }, [loading, couple?.id, couple?.active, user?.id, isAdmin, subscriptionInfo.loading, subscriptionInfo.isPremium]);

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
