import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';

import { pendingNotificationRoute } from './_layout';
import type { NotificationData } from '@/lib/notifications';
import { logger } from '@/lib/logger';

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
    case 'send_love':
      return '/(app)/(tabs)/note';
    default:
      return null;
  }
}

// Absolute hard deadline — if verification hasn't affirmatively resolved by
// this point, route to the verify-retry screen instead of guessing.
const HARD_DEADLINE_MS = 5000;

const DEBUG_TAP_TARGET = 5;
const DEBUG_TAP_WINDOW_MS = 10000;

export default function TransitionScreen() {
  const router = useRouter();
  const { couple, partnerProfile, profile, settings, user, isAdmin, isSuperAdmin, loading, subscriptionInfo, debugModeEnabled, globalDebugAccessEnabled } = useAuth();
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.5, 200);
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const routed = useRef(false);
  const animDone = useRef(false);
  const authReady = useRef(false);
  const hardDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugTapCount = useRef(0);
  const debugTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debugModeRef = useRef(debugModeEnabled);
  debugModeRef.current = debugModeEnabled;
  const globalDebugRef = useRef(globalDebugAccessEnabled);
  globalDebugRef.current = globalDebugAccessEnabled;
  const startMs = useRef(Date.now());
  const elapsed = () => Date.now() - startMs.current;

  const handleDebugTap = () => {
    const canDebug = __DEV__ || isAdmin || isSuperAdmin || debugModeRef.current || globalDebugRef.current || process.env.EXPO_PUBLIC_DEBUG_ALWAYS_ON === '1';
    if (!canDebug) return;
    debugTapCount.current += 1;
    if (debugTapTimer.current) clearTimeout(debugTapTimer.current);
    if (debugTapCount.current >= DEBUG_TAP_TARGET) {
      debugTapCount.current = 0;
      routed.current = true;
      router.replace(globalDebugRef.current ? '/debug-access' : '/debug');
      return;
    }
    debugTapTimer.current = setTimeout(() => {
      debugTapCount.current = 0;
    }, DEBUG_TAP_WINDOW_MS);
  };

  // Returns true only when we have enough affirmatively-resolved data to make
  // a routing decision. Unresolved state never counts as authorization.
  const canRoute = (): boolean => {
    // Admins/super-admins bypass subscription checks — but only when the
    // profile has actually loaded and confirmed the admin flag.
    if (isAdmin || isSuperAdmin) return true;

    // Solo users (no couple, inactive couple, or no partner) go to /pair.
    // This destination doesn't depend on subscription verification.
    const isSolo = !couple || couple.active === false || !couple.user_b_id;
    if (isSolo) return true;

    // Paired users: both profile and subscription must be resolved.
    // An unresolved state is never treated as authorized or unauthorized.
    if (!profile) return false;
    if (subscriptionInfo.loading) return false;

    return true;
  };

  const navigate = () => {
    if (routed.current) return;

    // If we don't have enough resolved data, do NOT route — let the effect
    // re-trigger when data arrives, or let the hard deadline catch the case
    // where data never resolves.
    if (!canRoute()) return;

    routed.current = true;

    if (hardDeadlineRef.current) {
      clearTimeout(hardDeadlineRef.current);
      hardDeadlineRef.current = null;
    }

    const isPrivileged = isAdmin || isSuperAdmin;

    logger.log(`[TRANSITION ROUTE DECISION] +${elapsed()}ms`, {
      elapsedMs: elapsed(),
      userId: user?.id ?? null,
      isAdmin,
      isSuperAdmin,
      coupleId: couple?.id ?? null,
      coupleActive: couple?.active ?? null,
      canInvite: subscriptionInfo.canInvite,
      subLoading: subscriptionInfo.loading,
      isPremium: subscriptionInfo.isPremium,
      isOnTrial: subscriptionInfo.isOnTrial,
      loginMethod: settings?.login_method ?? null,
    });

    Animated.timing(bgOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(async () => {
      // Privileged users bypass all subscription checks
      if (isPrivileged) {
        logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(app)/(tabs) [privileged]`, { elapsedMs: elapsed() });
        router.replace('/(app)/(tabs)');
        return;
      }

      if (couple?.active) {
        // Solo users (no partner yet) should go to /pair to enter an invite code,
        // not the paywall — their partner's subscription will cover them once paired.
        if (!couple.user_b_id) {
          logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(auth)/pair [solo, no partner]`, { elapsedMs: elapsed() });
          router.replace('/(auth)/pair');
          return;
        }
        // Paired users: check subscription access (isPremium covers active trial, paid, partner-paid)
        if (!subscriptionInfo.isPremium) {
          const reason = subscriptionInfo.trialExpired
            ? 'expired_trial'
            : subscriptionInfo.grantExpired
            ? 'expired_entitlement'
            : undefined;
          logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → subscription [not premium, paired]`, { elapsedMs: elapsed() });
          router.replace({ pathname: '/(auth)/subscription', params: reason ? { reason } : {} });
          return;
        }

        const needsCelebration = !!couple.user_b_id && settings && !settings.celebration_seen;
        if (needsCelebration && user) {
          await supabase
            .from('user_settings')
            .update({ celebration_seen: true, updated_at: new Date().toISOString() })
            .eq('user_id', user.id);
          logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → paired-celebration`, { elapsedMs: elapsed() });
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: partnerProfile?.display_name || '' },
          });
          return;
        }
        const intent = pendingNotificationRoute.current;
        const notifDest = intent ? resolveNotificationRoute(intent) : null;
        if (intent) pendingNotificationRoute.current = null;
        logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(app)/(tabs)`, { elapsedMs: elapsed(), pendingTab: notifDest ?? undefined });
        router.replace({
          pathname: '/(app)/(tabs)',
          params: notifDest ? { pendingTab: notifDest } : {},
        });
      } else if (subscriptionInfo.canInvite) {
        // User has no active partner yet but holds a valid subscription — route into app.
        logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(app)/(tabs) [canInvite, no partner]`, { elapsedMs: elapsed() });
        router.replace('/(app)/(tabs)');
      } else {
        logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(auth)/pair [no active couple]`, { elapsedMs: elapsed() });
        router.replace('/(auth)/pair');
      }
    });
  };

  const tryNavigate = () => {
    if (routed.current) return;
    if (!animDone.current || !authReady.current) return;

    logger.log(`[TRANSITION TRY NAVIGATE] +${elapsed()}ms`, {
      elapsedMs: elapsed(),
      couple: couple ? `id=${couple.id}` : 'null',
      userId: user?.id ?? 'null',
      canRoute: canRoute(),
    });

    navigate();
  };

  useEffect(() => {
    logger.log('[TRANSITION START] +0ms');

    // Hard deadline: if verification hasn't affirmatively resolved, route to
    // the verify-retry screen instead of guessing. Unresolved network/database
    // state is never treated as authorization.
    hardDeadlineRef.current = setTimeout(() => {
      hardDeadlineRef.current = null;
      if (!routed.current) {
        routed.current = true;
        logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /verify-retry [HARD DEADLINE — verification unresolved]`, { elapsedMs: elapsed() });
        router.replace('/verify-retry');
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
      if (hardDeadlineRef.current) clearTimeout(hardDeadlineRef.current);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!authReady.current) {
        logger.log(`[TRANSITION AUTH READY] +${elapsed()}ms`, { elapsedMs: elapsed(), userId: user?.id ?? null, isAdmin, isSuperAdmin });
      }
      authReady.current = true;
      tryNavigate();
    }
  }, [loading, couple?.id, couple?.active, couple?.user_b_id, user?.id, isAdmin, isSuperAdmin, profile?.id, subscriptionInfo.loading, subscriptionInfo.isPremium, subscriptionInfo.canInvite]);

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
