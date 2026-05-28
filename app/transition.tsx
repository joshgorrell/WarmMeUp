import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, TouchableOpacity, useWindowDimensions } from 'react-native';
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
const COUPLE_WAIT_MS = 1000;
// Maximum time to wait for subscription info — it's a separate async fetch.
const SUB_WAIT_MS = 1500;
// Absolute hard deadline — transition MUST resolve within this time no matter what.
const HARD_DEADLINE_MS = 2000;

const DEBUG_TAP_TARGET = 5;
const DEBUG_TAP_WINDOW_MS = 10000;

export default function TransitionScreen() {
  const router = useRouter();
  const { couple, partnerProfile, settings, user, isAdmin, isSuperAdmin, loading, subscriptionInfo, debugModeEnabled } = useAuth();
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
  // Kept current so the hard-deadline callback (empty-deps effect) reads latest values.
  const coupleRef = useRef(couple);
  const isAdminRef = useRef(isAdmin);
  coupleRef.current = couple;
  isAdminRef.current = isAdmin;
  const debugTapCount = useRef(0);
  const debugTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugModeRef = useRef(debugModeEnabled);
  debugModeRef.current = debugModeEnabled;
  // Timing reference for elapsed-ms logs
  const startMs = useRef(Date.now());
  const elapsed = () => Date.now() - startMs.current;

  const handleDebugTap = () => {
    const canDebug = __DEV__ || isAdminRef.current || debugModeRef.current || process.env.EXPO_PUBLIC_DEBUG_ALWAYS_ON === '1';
    if (!canDebug) return;
    debugTapCount.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    if (debugTapCount.current >= DEBUG_TAP_TARGET) {
      debugTapCount.current = 0;
      routed.current = true;
      router.replace('/debug');
      return;
    }
    debugTapTimer.current = setTimeout(() => {
      debugTapCount.current = 0;
    }, DEBUG_TAP_WINDOW_MS);
  };

  const navigate = () => {
    if (routed.current) return;

    // Admins and super-admins bypass subscription checks entirely.
    const isPrivileged = isAdmin || isSuperAdmin;

    // For non-privileged users, defer if subscription is still loading —
    // UNLESS there is no active couple, in which case the destination is
    // always /pair and subscription status doesn't matter.
    if (!isPrivileged && subscriptionInfo.loading) {
      const noCouple = !couple || couple.active === false;
      if (!noCouple) {
        if (!subTimeoutRef.current) {
          console.log(`[TRANSITION WAITING FOR] +${elapsed()}ms — subscriptionInfo.loading=true`);
          subTimeoutRef.current = setTimeout(() => {
            subTimeoutRef.current = null;
            console.log(`[TRANSITION WAITING FOR] +${elapsed()}ms — sub timeout fired, forcing navigate`);
            navigate();
          }, SUB_WAIT_MS);
        }
        return;
      }
    }

    if (coupleTimeoutRef.current) {
      clearTimeout(coupleTimeoutRef.current);
      coupleTimeoutRef.current = null;
    }
    if (subTimeoutRef.current) {
      clearTimeout(subTimeoutRef.current);
      subTimeoutRef.current = null;
    }
    routed.current = true;

    console.log(`[TRANSITION ROUTE DECISION] +${elapsed()}ms`, {
      userId: user?.id ?? null,
      isAdmin,
      isSuperAdmin,
      coupleId: couple?.id ?? null,
      coupleActive: couple?.active ?? null,
      subLoading: subscriptionInfo.loading,
      isPremium: subscriptionInfo.isPremium,
      isOnTrial: subscriptionInfo.isOnTrial,
      loginMethod: settings?.login_method ?? null,
    });

    Animated.timing(bgOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(async () => {
      // Clear the hard deadline only after we are inside the animation callback
      // and about to route. This ensures the deadline stays armed as a fallback
      // if the animation callback is silently dropped by the JS thread.
      if (hardDeadlineRef.current) {
        clearTimeout(hardDeadlineRef.current);
        hardDeadlineRef.current = null;
      }

      // Privileged users bypass all subscription checks
      if (isPrivileged) {
        console.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(app)/(tabs) [privileged]`);
        router.replace('/(app)/(tabs)');
        return;
      }

      if (couple?.active) {
        // Check subscription access: isPremium covers active trial AND paid AND partner-paid
        if (!subscriptionInfo.isPremium) {
          const reason = subscriptionInfo.trialExpired ? 'expired_trial' : undefined;
          console.log(`[TRANSITION ROUTED] +${elapsed()}ms → subscription [not premium]`);
          router.replace({ pathname: '/(auth)/subscription', params: reason ? { reason } : {} });
          return;
        }

        const needsCelebration = !!couple.user_b_id && settings && !settings.celebration_seen;
        if (needsCelebration && user) {
          await supabase
            .from('user_settings')
            .update({ celebration_seen: true, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          console.log(`[TRANSITION ROUTED] +${elapsed()}ms → paired-celebration`);
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: partnerProfile?.display_name || '' },
          });
          return;
        }
        const intent = pendingNotificationRoute.current;
        const notifDest = intent ? resolveNotificationRoute(intent) : null;
        if (intent) pendingNotificationRoute.current = null;
        console.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(app)/(tabs)`, notifDest ? `pendingTab=${notifDest}` : '');
        router.replace({
          pathname: '/(app)/(tabs)',
          params: notifDest ? { pendingTab: notifDest } : {},
        });
      } else {
        console.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(auth)/pair [no active couple]`);
        router.replace('/(auth)/pair');
      }
    });
  };

  const tryNavigate = () => {
    if (routed.current) return;
    if (!animDone.current || !authReady.current) return;

    console.log(`[TRANSITION ROUTE DECISION] +${elapsed()}ms — couple: ${couple ? `id=${couple.id}` : 'null'} user: ${user?.id ?? 'null'}`);

    // Couple arrives slightly after loading=false due to React batching.
    // Privileged users skip the couple wait — they go to app regardless.
    const isPrivileged = isAdmin || isSuperAdmin;
    if (user && !couple && !isPrivileged) {
      if (!coupleTimeoutRef.current) {
        console.log(`[TRANSITION WAITING FOR] +${elapsed()}ms — couple null after auth ready`);
        coupleTimeoutRef.current = setTimeout(() => {
          coupleTimeoutRef.current = null;
          console.log(`[TRANSITION WAITING FOR] +${elapsed()}ms — couple timeout fired, forcing navigate`);
          navigate();
        }, COUPLE_WAIT_MS);
      }
      return;
    }

    // navigate() itself will wait for subscriptionInfo to resolve.
    navigate();
  };

  useEffect(() => {
    console.log('[TRANSITION START] +0ms');

    // Hard deadline: if transition hasn't resolved, force safe fallback.
    hardDeadlineRef.current = setTimeout(() => {
      hardDeadlineRef.current = null;
      if (!routed.current) {
        routed.current = true;
        const hasActiveCouple = coupleRef.current?.active === true;
        const dest = isAdminRef.current || hasActiveCouple ? '/(app)/(tabs)' : '/(auth)/pair';
        console.warn(`[TRANSITION ROUTED] +${elapsed()}ms HARD DEADLINE — fallback to ${dest}`);
        router.replace(dest);
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
  }, [loading, couple?.id, couple?.active, user?.id, isAdmin, isSuperAdmin, subscriptionInfo.loading, subscriptionInfo.isPremium]);

  return (
    <Animated.View style={[styles.root, { opacity: bgOpacity }]}>
      <TouchableOpacity onPress={handleDebugTap} activeOpacity={1}>
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center', gap: 8 }}>
          <WarmupLogo size={logoW} />
          <WarmupWordmark size={18} />
        </Animated.View>
      </TouchableOpacity>
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
