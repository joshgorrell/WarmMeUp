import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';

import { pendingNotificationRoute } from './_layout';
import type { NotificationData } from '@/lib/notifications';
import { logger } from '@/lib/logger';

function resolveNotificationRoute(data: NotificationData): string | null {
  // Screenshot alerts should open Activity, where the event already includes
  // the captured item's thumbnail/context and a tap-through to the exact media
  // when Warm Me Up can identify it reliably.
  if ((data.event_type as string) === 'screenshot_detected') {
    return '/(app)/activity';
  }

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

// Give cold-start verification enough room to complete. Returning users with
// already-known good state can resume immediately while the refresh finishes.
const HARD_DEADLINE_MS = 10000;

export default function TransitionScreen() {
  const router = useRouter();
  const {
    couple,
    coupleLoading,
    partnerProfile,
    profile,
    settings,
    user,
    isAdmin,
    isSuperAdmin,
    loading,
    subscriptionInfo,
  } = useAuth();
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.5, 200);
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const routed = useRef(false);
  const animDone = useRef(false);
  const authReady = useRef(false);
  const hardDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startMs = useRef(Date.now());
  const elapsed = () => Date.now() - startMs.current;

  // Returns true only when we have enough affirmatively-resolved data to make
  // a routing decision. A null couple is not meaningful until coupleLoading is
  // false; otherwise a paired user can briefly be mistaken for a solo user.
  const canRoute = (): boolean => {
    if (isAdmin || isSuperAdmin) return true;
    if (!profile) return false;
    if (coupleLoading) return false;

    const isSolo = !couple || couple.active === false || !couple.user_b_id;
    if (isSolo) return true;

    // refreshSubscription preserves the previous entitlement flags while it
    // sets loading=true. If the user was already verified premium, don't block
    // app resume just because the refresh is still running.
    if (subscriptionInfo.loading) return subscriptionInfo.isPremium === true;

    return true;
  };

  const navigate = () => {
    if (routed.current) return;
    if (!canRoute()) return;

    routed.current = true;

    if (__DEV__) logger.log(`[STARTUP] route to app +${elapsed()}ms`);

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
      coupleLoading,
      canInvite: subscriptionInfo.canInvite,
      subLoading: subscriptionInfo.loading,
      isPremium: subscriptionInfo.isPremium,
      isOnTrial: subscriptionInfo.isOnTrial,
      loginMethod: settings?.login_method ?? null,
    });

    Animated.timing(bgOpacity, { toValue: 0, duration: 260, useNativeDriver: true }).start(async () => {
      if (isPrivileged) {
        logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(app)/(tabs) [privileged]`, { elapsedMs: elapsed() });
        router.replace('/(app)/(tabs)');
        return;
      }

      if (couple?.active) {
        if (!couple.user_b_id) {
          logger.log(`[TRANSITION ROUTED] +${elapsed()}ms → /(auth)/pair [solo, no partner]`, { elapsedMs: elapsed() });
          router.replace('/(auth)/pair');
          return;
        }
        if (!subscriptionInfo.isPremium) {
          const reason = subscriptionInfo.trialExpired
            ? 'expired_trial'
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
            params: { partnerName: partnerProfile?.display_name || '', partnerAvatar: partnerProfile?.avatar_url || '' },
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
      coupleLoading,
      userId: user?.id ?? 'null',
      canRoute: canRoute(),
    });

    navigate();
  };

  useEffect(() => {
    logger.log('[TRANSITION START] +0ms');

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
    const startupReady = !loading && (isAdmin || isSuperAdmin || !coupleLoading);
    if (startupReady) {
      if (!authReady.current) {
        logger.log(`[TRANSITION AUTH READY] +${elapsed()}ms`, {
          elapsedMs: elapsed(),
          userId: user?.id ?? null,
          isAdmin,
          isSuperAdmin,
          coupleLoading,
        });
      }
      authReady.current = true;
      tryNavigate();
    }
  }, [loading, coupleLoading, couple?.id, couple?.active, couple?.user_b_id, user?.id, isAdmin, isSuperAdmin, profile?.id, subscriptionInfo.loading, subscriptionInfo.isPremium, subscriptionInfo.canInvite]);

  return (
    <Animated.View style={[styles.root, { opacity: bgOpacity }]}>
      <View>
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: 'center', gap: 8 }}>
          <WarmupLogo size={logoW} />
          <WarmupWordmark size={18} />
        </Animated.View>
      </View>
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
