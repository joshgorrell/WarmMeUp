import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, UserPlus, Lock, X, Copy, RefreshCw, Check, Circle as XCircle, Circle as HelpCircle, Sparkles } from 'lucide-react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import {
  validateCodeFormat,
  savePendingCode,
  sanitizeInviteCode,
} from '@/lib/inviteCode';
import { previewInvite, getPendingPartnerProfile, getMyPendingJoin, recordTrialExpired, type PendingJoinStatus } from '@/lib/coupleJoin';
import { logDebugEvent } from '@/lib/debugLog';
import { logger } from '@/lib/logger';
import { ensureConfigured, ensureRevenueCatUser } from '@/lib/purchases';
import { MONTHLY_PRODUCT_ID, ANNUAL_PRODUCT_ID } from '@/lib/productIds';
import PairHelpModal from '@/components/PairHelpModal';

const DEEP_LINK_SCHEME = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME ?? 'warmup';
const JOIN_COOLDOWN_MS = 3000;

const PLANS: {
  id: 'monthly' | 'yearly';
  label: string;
  price: string;
  period: string;
  sub: string;
}[] = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: '$9.99',
    period: 'per month',
    sub: 'Billed monthly · cancel anytime',
  },
  {
    id: 'yearly',
    label: 'Yearly',
    price: '$99.99',
    period: 'per year',
    sub: 'Save 17% · just $8.33/mo',
  },
];

type ActiveModal = 'invite' | 'join' | null;
type HelpVariant = 'inviter' | 'joiner' | null;

function HeartOutline({
  size,
  gradientId,
  colorA,
  colorB,
}: {
  size: number;
  gradientId: string;
  colorA: string;
  colorB: string;
}) {
  return (
    <Svg width={size} height={size * 0.92} viewBox="0 0 100 92">
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colorA} />
          <Stop offset="1" stopColor={colorB} />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M50 85 C50 85 8 54 8 27 C8 14 18 5 30 5 C39 5 46 10 50 18 C54 10 61 5 70 5 C82 5 92 14 92 27 C92 54 50 85 50 85 Z"
        stroke={`url(#${gradientId})`}
        strokeWidth="7.5"
        fill="none"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function PairScreen() {
  const router = useRouter();
  const { prefilledCode } = useLocalSearchParams<{ prefilledCode?: string }>();
  const { user, couple, refreshCouple, settings, subscriptionInfo, refreshSubscription, profile } = useAuth();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();
  const headingSize = Math.min(Math.round(width * 0.086), 36);
  const codeFontSize = Math.min(Math.round((width - 64) / 7.5), 40);
  const codeLetterSpacing = Math.min(Math.round(codeFontSize * 0.22), 10);
  const glowWidth = Math.min(width - Spacing.xl * 2, 420);
  const scrollPaddingTop = Math.max(Math.round(height * 0.08), 56);
  const heartsHeight = Math.min(Math.round(height * 0.22), 200);
  const heartSize = Math.round(heartsHeight * 0.68);
  const heartOverlap = -Math.round(heartSize * 0.34);
  const minSheetHeight = Math.round(height * 0.52);
  const isAuthed = !!user;

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  const [myCode, setMyCode] = useState('');
  const [inviteError, setInviteError] = useState('');
  const displayCode = myCode || couple?.invite_code || '';
  const [joinCode, setJoinCode] = useState(sanitizeInviteCode(prefilledCode ?? ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(prefilledCode ? 'join' : null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const lastJoinAttemptRef = useRef(0);
  const [inviterName, setInviterName] = useState<string | null>(null);
  const [inviterAvatar, setInviterAvatar] = useState<string | null>(null);
  const [preAuthPreview, setPreAuthPreview] = useState<{ name: string } | null>(null);
  const [pendingPartnerName, setPendingPartnerName] = useState<string | null>(null);
  const [pendingPartnerAvatar, setPendingPartnerAvatar] = useState<string | null>(null);
  const [helpVisible, setHelpVisible] = useState(false);
  const [helpVariant, setHelpVariant] = useState<HelpVariant>('joiner');
  const [resumeChecked, setResumeChecked] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');
  const [packages, setPackages] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!user) return;
    // Refresh subscription first so admin grants / trial status is current
    // before loadOrCreateCouple checks premium access.
    (async () => {
      await refreshSubscription();
      // Before loading the couple, check whether the user has a pending join request
      // from a previous session. If so, resume straight into the waiting state.
      const pending = await getMyPendingJoin();
      if (pending.ok && (pending.status === 'accepted' || pending.status === 'b_accepted' || pending.status === 'pending')) {
        // request_join auto-finalizes pairing immediately. Any of these statuses
        // means the connection is already complete — navigate to the app.
        // Stale 'b_accepted' or 'pending' (from before the auto-finalize migration)
        // are also treated as complete.
        await refreshCouple();
        refreshSubscription().catch(() => {});
        if (!settings?.celebration_seen) {
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: pending.inviterName || '' },
          });
        } else {
          router.replace('/(app)/(tabs)');
        }
        setResumeChecked(true);
        return;
      }
      setResumeChecked(true);
      loadOrCreateCouple();
    })();
  }, [user]);

  // User A: fetch pending partner's profile when a request arrives
  useEffect(() => {
    if (!couple?.pending_partner_id || !couple?.pending_partner_status ||
        (couple.pending_partner_status !== 'pending' && couple.pending_partner_status !== 'b_accepted')) {
      setPendingPartnerName(null);
      setPendingPartnerAvatar(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await getPendingPartnerProfile();
      if (!cancelled && result.ok) {
        setPendingPartnerName(result.partnerName);
        setPendingPartnerAvatar(result.partnerAvatar);
      }
    })();
    return () => { cancelled = true; };
  }, [couple?.pending_partner_id, couple?.pending_partner_status]);

  useEffect(() => {
    if (couple?.user_b_id) {
      router.replace('/(app)/(tabs)');
    }
  }, [couple?.user_b_id]);

  // User A: subscribe to the couple row so pending partner requests appear
  // immediately without needing to close and reopen the screen.
  useEffect(() => {
    if (!user || !couple?.id) return;
    const channelName = `pair-couple:${couple.id}`;
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === channelName) supabase.removeChannel(ch);
    });
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${couple.id}` },
          async (payload: any) => {
            const newStatus = payload?.new?.pending_partner_status;
            if (newStatus === 'pending' || newStatus === 'b_accepted' || newStatus === 'declined') {
              await refreshCouple();
            }
          },
        )
        .subscribe();
    } catch {}
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [user, couple?.id]);

  // User A: cancel a pending invite they sent
  const handleCancelInvite = async () => {
    if (!couple?.id || acceptLoading) return;
    setAcceptLoading(true);
    try {
      const { error } = await supabase.rpc('cancel_pending_partner');
      if (error) {
        setError('Could not cancel right now. Try again.');
        return;
      }
      await refreshCouple();
    } catch (e: any) {
      logger.warn('[pair] error:', e?.message);
      setError('Something went wrong. Please try again.');
    } finally {
      setAcceptLoading(false);
    }
  };

  // Inline subscribe-and-invite: purchase a plan without leaving the modal,
  // then auto-generate the invite code so the user sees it immediately.
  const handleSubscribeAndInvite = async () => {
    if (subscribing) return;

    if (Platform.OS === 'web') {
      setActiveModal(null);
      router.push('/(auth)/subscription');
      return;
    }

    setSubscribing(true);
    setSubscribeError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const Purchases = userId
        ? await ensureRevenueCatUser(userId)
        : await ensureConfigured();
      if (!Purchases) {
        setSubscribeError('Purchases are not available on this device.');
        return;
      }

      // Load offerings if not already loaded
      let pkgMap = packages;
      if (Object.keys(pkgMap).length === 0) {
        const offerings = await Purchases.getOfferings();
        const current = offerings.current;
        if (current) {
          pkgMap = {};
          for (const pkg of current.availablePackages) {
            const id = pkg.product.identifier;
            if (id === ANNUAL_PRODUCT_ID) pkgMap['yearly'] = pkg;
            else if (id === MONTHLY_PRODUCT_ID) pkgMap['monthly'] = pkg;
          }
          setPackages(pkgMap);
        }
      }

      const pkg = pkgMap[selectedPlan];
      if (!pkg) {
        setSubscribeError('This plan is currently unavailable. Please try again later.');
        return;
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const entitlement = customerInfo.entitlements.active['premium'];
      if (!entitlement) {
        setSubscribeError('Purchase completed but premium was not activated. Please try again.');
        return;
      }

      // Confirm with server so the subscriptions table updates
      if (session?.access_token) {
        const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
        await fetch(`${baseUrl}/functions/v1/confirm-subscription`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }).catch(() => {});
      }

      await refreshSubscription();

      // Now generate the invite code — server will allow it since we have premium
      const { data: result, error: rpcError } = await supabase.rpc('generate_invite_code', { force_new: false });
      if (rpcError) {
        if ((rpcError as any)?.message === 'already_paired') {
          router.replace('/(app)/(tabs)');
          return;
        }
        setSubscribeError('Purchase succeeded but code generation failed. Tap refresh.');
        return;
      }
      const newCode = (result as any)?.invite_code ?? null;
      if (newCode) {
        setMyCode(newCode);
        await refreshCouple();
      }
    } catch (e: any) {
      if (e?.code === '1') return; // user cancelled
      setSubscribeError(e?.message ?? 'Purchase failed. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  // Auto-submit when a full 6-character code is entered
  const autoSubmitRef = useRef<string | null>(null);
  useEffect(() => {
    if (joinCode.length !== 6) return;
    // Guard against double-fire for the same code
    if (autoSubmitRef.current === joinCode) return;
    autoSubmitRef.current = joinCode;
    if (user) {
      handleJoin();
    } else {
      handlePreAuthJoin();
    }
  }, [joinCode, user]);

  const loadOrCreateCouple = async () => {
    if (!user) return;

    setCodeLoading(true);
    logDebugEvent('INVITE CREATE START', { userId: user.id });

    // If user already has an active partner, skip straight to the app.
    // Require active=true so historical/inactive paired rows don't trigger a redirect.
    try {
      const { data: paired } = await supabase
        .from('couples')
        .select('id')
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .not('user_b_id', 'is', null)
        .eq('active', true)
        .maybeSingle();
      if (paired) {
        router.replace('/(app)/(tabs)');
        return;
      }

      // Single code path: RPC finds or creates the solo couple and returns the invite code.
      // Pass force_new: false so the existing code is returned as-is (no regeneration).
      const { data: result, error: rpcError } = await supabase.rpc('generate_invite_code', { force_new: false });
      if (rpcError) {
        // RPC refuses when the user is already paired — redirect to app instead of showing an error.
        if ((rpcError as any)?.message === 'already_paired') {
          router.replace('/(app)/(tabs)');
          return;
        }
        logDebugEvent('INVITE CREATE ERROR', {
          userId: user.id,
          code: rpcError?.code ?? null,
          message: rpcError?.message ?? null,
        });
        setInviteError(
          `Could not generate invite code.\n` +
          `Code: ${rpcError?.code ?? 'n/a'}\n` +
          `Message: ${rpcError?.message ?? 'Unknown error'}`
        );
        return;
      }
      // Server enforces subscription — if no subscription, retry once after a brief
      // delay to handle the race where the trial trigger hasn't committed yet.
      // For older accounts, refresh subscription (which now includes the entitlement
      // grant fallback) and retry up to 3 more times before showing a visible error.
      if ((result as any)?.success === false && (result as any)?.reason === 'no_subscription') {
        let lastRetryResult: any = result;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const delay = attempt === 1 ? 1000 : attempt === 2 ? 1500 : 2000;
          await new Promise(r => setTimeout(r, delay));
          await refreshSubscription();
          const { data: retry } = await supabase.rpc('generate_invite_code', { force_new: false });
          lastRetryResult = retry;
          if ((retry as any)?.success !== false || (retry as any)?.reason !== 'no_subscription') {
            const retryCode = (retry as any)?.invite_code ?? null;
            if (retryCode) {
              logDebugEvent('INVITE CREATE SUCCESS', { source: `rpc_retry_${attempt}`, inviteCode: retryCode });
              setMyCode(retryCode);
              await refreshCouple();
              return;
            }
          }
        }
        logDebugEvent('INVITE CREATE NO_SUBSCRIPTION', { source: 'retry_exhausted', userId: user.id, canInvite: subscriptionInfo.canInvite });
        // If the couple already has an invite code from the signup trigger, show it
        // rather than showing an error — the code is valid even if generate_invite_code failed.
        if (couple?.invite_code) {
          logDebugEvent('INVITE CREATE SUCCESS', { source: 'fallback_existing_code', inviteCode: couple.invite_code });
          setMyCode(couple.invite_code);
          return;
        }
        setInviteError('Your free trial is being set up. Please reopen the app in a moment and try again.');
        return;
      }
      const inviteCode = (result as any)?.invite_code ?? null;
      if (!inviteCode) {
        logDebugEvent('INVITE CREATE ERROR', {
          userId: user.id,
          reason: 'rpc_returned_no_invite_code',
          result: JSON.stringify(result),
        });
        setInviteError('Invite code generation failed — no code returned. Please try again.');
        return;
      }
      logDebugEvent('INVITE CREATE SUCCESS', { source: 'rpc', inviteCode });
      setMyCode(inviteCode);
      await refreshCouple();
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCopy = async () => {
    const deepLink = `${DEEP_LINK_SCHEME}://invite/${displayCode}`;
    const shareText = `Join me on Warm Me Up!\n\nTap to connect: ${deepLink}\n\nOr enter code: ${displayCode}`;
    if (Platform.OS !== 'web') {
      await Share.share({ message: shareText, url: deepLink });
    } else {
      try {
        await navigator.clipboard.writeText(displayCode);
      } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefreshCode = async () => {
    if (refreshing || couple?.user_b_id) return;
    // Wait for subscription info to load before gating on canInvite — otherwise
    // a brand-new trial user whose info hasn't loaded yet gets wrongly sent to
    // the paywall.
    if (subscriptionInfo.loading) {
      await new Promise<void>(resolve => {
        const unsub = setInterval(() => {
          if (!subscriptionInfo.loading) { clearInterval(unsub); resolve(); }
        }, 200);
        setTimeout(() => { clearInterval(unsub); resolve(); }, 3000);
      });
    }
    if (!subscriptionInfo.canInvite && !subscriptionInfo.loading) {
      router.push('/(auth)/subscription');
      return;
    }
    setRefreshing(true);
    setInviteError('');
    logDebugEvent('INVITE CREATE START', { source: 'handleRefreshCode', userId: user?.id ?? null });
    const { data: result, error: rpcError } = await supabase.rpc('generate_invite_code', { force_new: true });
    if (rpcError) {
      // RPC refuses when the user is already paired — redirect rather than surface an error.
      if ((rpcError as any)?.message === 'already_paired') {
        router.replace('/(app)/(tabs)');
        setRefreshing(false);
        return;
      }
      logDebugEvent('INVITE CREATE ERROR', {
        source: 'handleRefreshCode',
        code: rpcError?.code ?? null,
        message: rpcError?.message ?? null,
        hint: (rpcError as any)?.hint ?? null,
      });
      setInviteError(`[${rpcError?.code ?? 'ERR'}] ${rpcError?.message ?? 'Unknown error'}`);
    } else {
      if ((result as any)?.success === false && (result as any)?.reason === 'no_subscription') {
        setRefreshing(false);
        return;
      }
      const newCode = (result as any)?.invite_code ?? null;
      if (!newCode) {
        setInviteError('Refresh failed — no code returned. Please try again.');
      } else {
        logDebugEvent('INVITE CREATE SUCCESS', { source: 'handleRefreshCode', inviteCode: newCode });
        setMyCode(newCode);
        await refreshCouple();
      }
    }
    setRefreshing(false);
  };

  const handleJoin = async () => {
    const normalized = sanitizeInviteCode(joinCode);
    if (!normalized || !user) return;

    if (!validateCodeFormat(normalized)) {
      setError('Codes are 6 characters (letters and numbers). Double-check and try again.');
      return;
    }

    const now = Date.now();
    if (now - lastJoinAttemptRef.current < JOIN_COOLDOWN_MS) {
      setError('Please wait a moment before trying again.');
      return;
    }
    lastJoinAttemptRef.current = now;

    setError('');
    setLoading(true);
    try {
      // Preview inviter name first so we can show it in the celebration overlay.
      // If preview fails, still attempt the join — request_join has its own
      // validation and cleanup, and a stale pending request shouldn't block a
      // valid join.
      let previewName: string | null = null;
      let previewAvatar: string | null = null;
      const preview = await previewInvite(normalized);
      if (preview.ok) {
        previewName = preview.inviterName;
        previewAvatar = preview.inviterAvatar;
        setInviterName(preview.inviterName);
        setInviterAvatar(preview.inviterAvatar);
      }

      const { data: joinResult, error: joinError } = await supabase
        .rpc('request_join', { invite_code: normalized });

      if (joinError) {
        setError('Something went wrong. Please try again.');
        return;
      }

      if (!joinResult.ok) {
        switch (joinResult.reason) {
          case 'already_connected':
            setError("You're already connected to a partner. Disconnect your current partner before connecting with someone else.");
            break;
          case 'not_found':
            setError('Invalid code. Check with your partner.');
            break;
          case 'self':
            setError("That's your own code! Share it with your partner.");
            break;
          case 'rate_limited':
            setError('Too many attempts. Wait a moment and try again.');
            break;
          default:
            setError('Something went wrong. Please try again.');
        }
        return;
      }

      // Connection finalized immediately — navigate to celebration.
      setActiveModal(null);
      await refreshCouple();
      refreshSubscription().catch(() => {});

      // Notify partner that the connection is complete
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token && joinResult.couple_id) {
        fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event_type: 'partner_joined', couple_id: joinResult.couple_id }),
        }).catch(() => {});
      }

      // Prefer inviter info from the request_join result (authoritative),
      // fall back to preview data, then any previously fetched name.
      const partnerName = joinResult.inviter_name || previewName || inviterName || '';
      if (joinResult.inviter_avatar) {
        setInviterAvatar(joinResult.inviter_avatar);
      }
      if (!settings?.celebration_seen) {
        router.replace({
          pathname: '/(auth)/paired-celebration',
          params: { partnerName },
        });
      } else {
        router.replace('/(app)/(tabs)');
      }
    } catch (e: any) {
      logger.warn('[pair] error:', e?.message);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreAuthJoin = async () => {
    const normalized = sanitizeInviteCode(joinCode);
    if (!normalized) {
      setError('Please enter the code your partner sent you.');
      return;
    }
    if (!validateCodeFormat(normalized)) {
      setError('Codes are 6 characters (letters and numbers). Double-check and try again.');
      return;
    }

    // If already previewed, proceed to registration
    if (preAuthPreview) {
      await savePendingCode(normalized);
      router.push({ pathname: '/(auth)/register', params: { pendingCode: normalized } });
      return;
    }

    const now = Date.now();
    if (now - lastJoinAttemptRef.current < JOIN_COOLDOWN_MS) {
      setError('Please wait a moment before trying again.');
      return;
    }
    lastJoinAttemptRef.current = now;

    setError('');
    setLoading(true);
    try {
      const result = await previewInvite(normalized);
      if (!result.ok) {
        // If the code format is valid but preview failed (function error,
        // rate limit, or genuinely not found), still save the code and send
        // the user to registration. The code will be validated by request_join
        // after they create an account. This prevents a dead-end where a
        // valid code can't be used because the preview function errored.
        await savePendingCode(normalized);
        router.push({ pathname: '/(auth)/register', params: { pendingCode: normalized } });
        return;
      }
      setPreAuthPreview({ name: result.inviterName });
    } catch (e: any) {
      logger.warn('[pair] preview error, falling back to registration:', e?.message);
      await savePendingCode(normalized);
      router.push({ pathname: '/(auth)/register', params: { pendingCode: normalized } });
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthed) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#060406', '#0A060A', '#0E080E']}
          style={StyleSheet.absoluteFill}
        />

        <TouchableOpacity
          style={[styles.backBtn, { top: insets.top + 12 }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
        </TouchableOpacity>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop, flexGrow: 1, justifyContent: 'center' }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={centerStyle}>
              <View style={[styles.heartsWrap, { height: heartsHeight * 0.7 }]} pointerEvents="none">
                <View style={styles.heartsGlowWrap}>
                  <LinearGradient
                    colors={['transparent', 'rgba(255,80,30,0.22)', 'rgba(255,46,138,0.28)', 'rgba(255,80,30,0.22)', 'transparent']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.heartsGlow, { width: glowWidth, height: glowWidth * 0.42 }]}
                  />
                </View>
                <View style={styles.heartsRow}>
                  <View style={[styles.heartContainer, { marginRight: heartOverlap, zIndex: 1 }]}>
                    <View style={styles.heartGlowOrange} />
                    <HeartOutline size={heartSize * 0.72} gradientId="heartL2" colorA="#FFB347" colorB="#FF5A3D" />
                  </View>
                  <View style={[styles.heartContainer, { marginLeft: heartOverlap, zIndex: 2 }]}>
                    <View style={styles.heartGlowPink} />
                    <HeartOutline size={heartSize * 0.72} gradientId="heartR2" colorA="#FF5A3D" colorB="#FF2E8A" />
                  </View>
                </View>
              </View>

              <View style={[styles.headerRow, { marginBottom: Spacing.sm }]}>
                <AppText style={[styles.heading, { fontSize: headingSize }]}>Enter your{'\n'}partner's code</AppText>
                <TouchableOpacity
                  style={styles.helpBtn}
                  onPress={() => { setHelpVariant('joiner'); setHelpVisible(true); }}
                  activeOpacity={0.7}
                >
                  <HelpCircle color="rgba(255,255,255,0.45)" size={22} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
              <AppText style={[styles.sub, { marginBottom: Spacing.xl }]}>Type the 6-character code they sent you.</AppText>

              {preAuthPreview ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewAvatarRow}>
                    <View style={styles.previewAvatarCircle}>
                      <HeartOutline size={28} gradientId="previewHeart" colorA="#FF7B00" colorB="#FF2E8A" />
                    </View>
                    <View style={styles.previewTextWrap}>
                      <AppText style={styles.previewLabel}>You're connecting with</AppText>
                      <AppText style={styles.previewName} numberOfLines={1} ellipsizeMode="tail">{preAuthPreview.name}</AppText>
                    </View>
                  </View>
                  <AppText style={styles.previewNote}>
                    Tap Continue to create your account. You'll be connected instantly.
                  </AppText>
                </View>
              ) : null}

              <View style={styles.inlineJoin}>
                <AppTextInput
                  style={[styles.codeInput, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}
                  value={joinCode}
                  onChangeText={(t) => { setJoinCode(sanitizeInviteCode(t)); setError(''); }}
                  placeholder="AB12CD"
                  placeholderTextColor="rgba(255,255,255,0.20)"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  maxLength={6}
                  autoFocus
                />

                {error ? <AppText style={styles.joinError}>{error}</AppText> : null}

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handlePreAuthJoin}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.actionGrad}
                  >
                    <AppText style={styles.actionLabel}>{loading ? 'Checking...' : preAuthPreview ? 'Continue' : 'Continue'}</AppText>
                  </LinearGradient>
                </TouchableOpacity>

                <AppText style={styles.preAuthNote}>
                  {preAuthPreview
                    ? "You'll be connected as soon as you create your account."
                    : "You'll see who's inviting you, then create your account."}
                </AppText>
              </View>

              <TouchableOpacity
                style={styles.skipRow}
                onPress={() => router.replace('/(auth)/register')}
                activeOpacity={0.6}
              >
                <AppText style={styles.skipText}>Register without a code</AppText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#060406', '#0A060A', '#0E080E']}
        style={StyleSheet.absoluteFill}
      />

      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 12 }]} onPress={() => router.back()} activeOpacity={0.7}>
        <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop }]} showsVerticalScrollIndicator={false}>
        <View style={centerStyle}>
          <View style={[styles.headerRow, { marginBottom: Spacing.sm }]}>
            <AppText style={[styles.heading, { fontSize: headingSize }]}>Connect with{'\n'}your partner</AppText>
            <TouchableOpacity
              style={styles.helpBtn}
              onPress={() => { setHelpVariant('inviter'); setHelpVisible(true); }}
              activeOpacity={0.7}
            >
              <HelpCircle color="rgba(255,255,255,0.45)" size={22} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
          <AppText style={styles.sub}>This space is just for{'\n'}the two of you.</AppText>

          <View style={[styles.heartsWrap, { height: heartsHeight }]} pointerEvents="none">
            <View style={styles.heartsGlowWrap}>
              <LinearGradient
                colors={['transparent', 'rgba(255,80,30,0.22)', 'rgba(255,46,138,0.28)', 'rgba(255,80,30,0.22)', 'transparent']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.heartsGlow, { width: glowWidth, height: glowWidth * 0.42 }]}
              />
            </View>

            <View style={styles.heartsRow}>
              <View style={[styles.heartContainer, { marginRight: heartOverlap, zIndex: 1 }]}>
                <View style={styles.heartGlowOrange} />
                <HeartOutline size={heartSize} gradientId="heartL" colorA="#FFB347" colorB="#FF5A3D" />
              </View>
              <View style={[styles.heartContainer, { marginLeft: heartOverlap, zIndex: 2 }]}>
                <View style={styles.heartGlowPink} />
                <HeartOutline size={heartSize} gradientId="heartR" colorA="#FF5A3D" colorB="#FF2E8A" />
              </View>
            </View>

            <AppText style={[styles.sparkle, { top: 8, left: '22%', fontSize: 12 }]}>✦</AppText>
            <AppText style={[styles.sparkle, { top: 4, right: '20%', fontSize: 7 }]}>✦</AppText>
            <AppText style={[styles.sparkle, { bottom: 14, left: '14%', fontSize: 8 }]}>✦</AppText>
            <AppText style={[styles.sparkle, { bottom: 20, right: '15%', fontSize: 6 }]}>✦</AppText>
          </View>

          <View style={styles.cards}>
            <TouchableOpacity
              style={styles.optionCard}
              activeOpacity={0.8}
              onPress={() => setActiveModal('invite')}
            >
              <View style={styles.optionIconOuter}>
                <LinearGradient
                  colors={['rgba(255,90,60,0.42)', 'rgba(255,46,138,0.30)']}
                  style={styles.optionIconCircle}
                >
                  <UserPlus color="#FF6B3D" size={22} strokeWidth={1.8} />
                </LinearGradient>
              </View>
              <View style={styles.optionText}>
                <AppText style={styles.optionTitle}>Invite via code</AppText>
                <AppText style={styles.optionDesc}>Send them your code{'\n'}to invite.</AppText>
              </View>
              <ChevronRight color="rgba(255,255,255,0.28)" size={20} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              activeOpacity={0.8}
              onPress={() => { setJoinCode(''); setError(''); setActiveModal('join'); }}
            >
              <View style={styles.optionIconOuter}>
                <LinearGradient
                  colors={['rgba(255,90,60,0.42)', 'rgba(255,46,138,0.30)']}
                  style={styles.optionIconCircle}
                >
                  <Lock color="#FF6B3D" size={22} strokeWidth={1.8} />
                </LinearGradient>
              </View>
              <View style={styles.optionText}>
                <AppText style={styles.optionTitle}>I have a code</AppText>
                <AppText style={styles.optionDesc}>Enter the code they{'\n'}sent you.</AppText>
              </View>
              <ChevronRight color="rgba(255,255,255,0.28)" size={20} />
            </TouchableOpacity>
          </View>

          {!subscriptionInfo.canInvite && !subscriptionInfo.loading && (
            <View style={styles.noSubHint}>
              <AppText style={styles.noSubHintText}>
                Don't have a subscription? No problem — tap "I have a code" to enter your partner's invite code and join them for free.
              </AppText>
            </View>
          )}

          {/* Pending invite card — shown if User A has a stale pending request.
              With auto-finalize, this should rarely appear, but if it does,
              User A can cancel the invite. */}
          {(couple?.pending_partner_status === 'pending' || couple?.pending_partner_status === 'b_accepted') && (
            <View style={styles.pendingRequestCard}>
              <View style={styles.pendingRequestHeader}>
                {pendingPartnerAvatar ? (
                  <Image source={{ uri: pendingPartnerAvatar }} style={styles.pendingAvatar} resizeMode="cover" />
                ) : (
                  <View style={styles.pendingAvatarFallback}>
                    <AppText style={styles.pendingAvatarText}>
                      {(pendingPartnerName ?? '?')[0]?.toUpperCase()}
                    </AppText>
                  </View>
                )}
                <AppText style={styles.pendingRequestTitle} numberOfLines={1} ellipsizeMode="tail">
                  {pendingPartnerName ? `${pendingPartnerName} wants to connect` : 'A partner wants to connect'}
                </AppText>
              </View>
              <AppText style={styles.pendingRequestDesc}>
                {pendingPartnerName
                  ? `${pendingPartnerName} entered your invite code. The connection should complete automatically — if it hasn't, ask them to enter it again.`
                  : `Someone entered your invite code. The connection should complete automatically — if it hasn't, ask them to enter it again.`}
              </AppText>
              {error ? <AppText style={styles.joinError}>{error}</AppText> : null}
              <View style={styles.pendingRequestActions}>
                <TouchableOpacity
                  style={[styles.pendingBtn, styles.declineBtn]}
                  onPress={handleCancelInvite}
                  activeOpacity={0.8}
                  disabled={acceptLoading}
                >
                  {acceptLoading ? (
                    <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
                  ) : (
                    <>
                      <XCircle color="rgba(255,255,255,0.7)" size={16} />
                      <AppText style={styles.declineBtnText}>Cancel invite</AppText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.noteRow}>
            <Lock color="rgba(255,255,255,0.22)" size={13} strokeWidth={1.5} />
            <AppText style={styles.noteText}>Only one partner connection at a time.</AppText>
          </View>

          <TouchableOpacity
            style={styles.skipRow}
            onPress={() => router.replace('/(app)/(tabs)')}
            activeOpacity={0.6}
          >
            <AppText style={styles.skipText}>Skip for now</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Invite modal */}
      <Modal visible={activeModal === 'invite'} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 36, minHeight: minSheetHeight }]}>
            <LinearGradient colors={['#18101C', '#100810']} style={StyleSheet.absoluteFill} />
            <TouchableOpacity style={styles.modalClose} onPress={() => setActiveModal(null)}>
              <X color="rgba(255,255,255,0.80)" size={20} />
            </TouchableOpacity>
            <AppText style={styles.modalTitle}>Your invite code</AppText>

            {subscriptionInfo.loading ? (
              <>
                <AppText style={styles.modalSub}>Checking access...</AppText>
                <View style={styles.codeBox}>
                  <ActivityIndicator color="rgba(255,255,255,0.45)" size="small" />
                </View>
              </>
            ) : subscriptionInfo.canInvite ? (
              <>
                <AppText style={styles.modalSub}>
                  Share this with your partner to connect.{'\n'}One subscription covers both of you.
                </AppText>

                {subscriptionInfo.isOnTrial && subscriptionInfo.trialExpiresAt && (
                  <View style={styles.trialBanner}>
                    <Sparkles color="#FFB84D" size={14} strokeWidth={2} />
                    <AppText style={styles.trialBannerText}>
                      Free trial active · expires {new Date(subscriptionInfo.trialExpiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </AppText>
                  </View>
                )}

                <View style={styles.codeBox}>
                  {(refreshing || codeLoading) ? (
                    <ActivityIndicator color="rgba(255,255,255,0.6)" size="small" />
                  ) : (
                    <AppText style={[styles.codeDisplayText, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]} selectable>
                      {displayCode || '------'}
                    </AppText>
                  )}
                  <TouchableOpacity
                    style={styles.refreshBtn}
                    onPress={handleRefreshCode}
                    activeOpacity={0.7}
                    disabled={refreshing || codeLoading}
                  >
                    <RefreshCw
                      color={(refreshing || codeLoading) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)'}
                      size={15}
                      strokeWidth={2}
                    />
                  </TouchableOpacity>
                </View>

                {!!inviteError && (
                  <AppText style={styles.inviteErrorText}>{inviteError}</AppText>
                )}

                <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} activeOpacity={0.85} disabled={!displayCode || codeLoading}>
                  <LinearGradient
                    colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.actionGrad}
                  >
                    <Copy color="#fff" size={16} />
                    <AppText style={styles.actionLabel}>{copied ? 'Copied!' : 'Copy & Share Code'}</AppText>
                  </LinearGradient>
                </TouchableOpacity>

                <AppText style={styles.waitingText}>Waiting for your partner to join...</AppText>

                {(couple?.pending_partner_status === 'pending' || couple?.pending_partner_status === 'b_accepted') && (
                  <TouchableOpacity
                    style={[styles.pendingBtn, styles.declineBtn, { marginTop: 12, alignSelf: 'center', paddingHorizontal: 20 }]}
                    onPress={handleCancelInvite}
                    activeOpacity={0.8}
                    disabled={acceptLoading}
                  >
                    {acceptLoading ? (
                      <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
                    ) : (
                      <>
                        <XCircle color="rgba(255,255,255,0.7)" size={16} />
                        <AppText style={styles.declineBtnText}>Cancel invite</AppText>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <AppText style={styles.modalSub}>
                  Subscribe to invite your partner.{'\n'}They join at no extra cost.
                </AppText>

                <View style={styles.lockedCodeBox}>
                  <Lock color="rgba(255,255,255,0.25)" size={28} strokeWidth={1.5} />
                  <AppText style={styles.lockedCodeText}>Subscribe to unlock</AppText>
                </View>

                <View style={styles.inlinePlanList}>
                  {PLANS.map((plan) => {
                    const active = selectedPlan === plan.id;
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        style={[styles.inlinePlanCard, active && styles.inlinePlanCardActive]}
                        onPress={() => setSelectedPlan(plan.id)}
                        activeOpacity={0.8}
                        disabled={subscribing}
                      >
                        <View style={[styles.inlineRadio, active && styles.inlineRadioActive]}>
                          {active && <View style={styles.inlineRadioDot} />}
                        </View>
                        <View style={styles.inlinePlanInfo}>
                          <AppText style={[styles.inlinePlanLabel, active && styles.inlinePlanLabelActive]}>
                            {plan.label}
                          </AppText>
                          <AppText style={styles.inlinePlanSub}>{plan.sub}</AppText>
                        </View>
                        <View style={styles.inlinePlanPriceWrap}>
                          <AppText style={[styles.inlinePlanPrice, active && styles.inlinePlanPriceActive]}>
                            {plan.price}
                          </AppText>
                          <AppText style={styles.inlinePlanPeriod}>{plan.period}</AppText>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {subscribeError ? <AppText style={styles.joinError}>{subscribeError}</AppText> : null}

                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleSubscribeAndInvite}
                  activeOpacity={0.85}
                  disabled={subscribing}
                >
                  <LinearGradient
                    colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.actionGrad}
                  >
                    {subscribing ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <AppText style={styles.actionLabel}>
                        {`Subscribe — ${PLANS.find(p => p.id === selectedPlan)!.price}/${selectedPlan === 'monthly' ? 'mo' : 'yr'}`}
                      </AppText>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipRow}
                  onPress={() => { setActiveModal(null); router.push('/(auth)/subscription'); }}
                  activeOpacity={0.6}
                >
                  <AppText style={styles.skipText}>View all plans</AppText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Join modal */}
      <Modal visible={activeModal === 'join'} transparent animationType="slide" onRequestClose={() => { setActiveModal(null); setError(''); }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 36, minHeight: minSheetHeight }]}>
              <LinearGradient colors={['#18101C', '#100810']} style={StyleSheet.absoluteFill} />
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => { setActiveModal(null); setError(''); }}
              >
                <X color="rgba(255,255,255,0.80)" size={20} />
              </TouchableOpacity>
              <AppText style={styles.modalTitle}>Enter partner's code</AppText>
              <AppText style={styles.modalSub}>Ask your partner for their 6-character invite code.</AppText>

              <AppTextInput
                style={[styles.codeInput, { fontSize: codeFontSize, letterSpacing: codeLetterSpacing }]}
                value={joinCode}
                onChangeText={(t) => { setJoinCode(sanitizeInviteCode(t)); setError(''); }}
                placeholder="e.g. AB12CD"
                placeholderTextColor="rgba(255,255,255,0.20)"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                maxLength={6}
                autoFocus
              />

              {error ? <AppText style={styles.joinError}>{error}</AppText> : null}

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleJoin}
                activeOpacity={0.85}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.actionGrad}
                >
                  <AppText style={styles.actionLabel}>{loading ? 'Connecting...' : 'Connect'}</AppText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PairHelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        variant={helpVariant ?? 'joiner'}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060406' },
  headerRow: {
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    left: Spacing.xl,
    zIndex: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 50,
  },
  heading: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    lineHeight: 44,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  sub: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  heartsWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    position: 'relative',
  },
  heartsGlowWrap: {
    position: 'absolute',
    top: '10%',
    left: -20,
    right: -20,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartsGlow: {
    borderRadius: 80,
  },
  heartsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heartGlowOrange: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,110,50,0.28)',
    shadowColor: '#FF6030',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 0,
  },
  heartGlowPink: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,46,138,0.28)',
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 0,
  },
  sparkle: {
    position: 'absolute',
    color: 'rgba(255,180,60,0.85)',
  },
  cards: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,80,60,0.15)',
    padding: Spacing.md,
    paddingVertical: 20,
    gap: Spacing.md,
  },
  optionIconOuter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,90,60,0.45)',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.50,
    shadowRadius: 12,
    elevation: 8,
  },
  optionIconCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 3,
  },
  optionDesc: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  noSubHint: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255, 200, 100, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 100, 0.15)',
    marginBottom: Spacing.md,
  },
  noSubHintText: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255, 220, 180, 0.8)',
    textAlign: 'center',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  noteText: {
    color: 'rgba(255,255,255,0.26)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  skipRow: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
  },
  skipText: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,255,255,0.20)',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    overflow: 'hidden',
    gap: Spacing.md,
  },
  modalClose: {
    alignSelf: 'flex-end',
    padding: 4,
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  modalSub: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    marginBottom: Spacing.sm,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,184,77,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,77,0.25)',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: Spacing.sm,
  },
  trialBannerText: {
    color: 'rgba(255,220,180,0.90)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Medium',
  },
  codeBox: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    position: 'relative',
  },
  refreshBtn: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -10,
    padding: 4,
  },
  codeDisplayText: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
  },
  actionBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 16,
    elevation: 8,
  },
  actionGrad: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: Radius.pill,
  },
  actionLabel: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
  waitingText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  lockedCodeBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockedCodeText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  inlinePlanList: {
    gap: 8,
    marginBottom: Spacing.sm,
  },
  inlinePlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 12,
    gap: 10,
  },
  inlinePlanCardActive: {
    borderColor: 'rgba(255,90,61,0.55)',
    backgroundColor: 'rgba(255,90,61,0.07)',
  },
  inlineRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  inlineRadioActive: {
    borderColor: '#FF5A3D',
  },
  inlineRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5A3D',
  },
  inlinePlanInfo: {
    flex: 1,
    minWidth: 0,
  },
  inlinePlanLabel: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  inlinePlanLabelActive: {
    color: '#fff',
  },
  inlinePlanSub: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  inlinePlanPriceWrap: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  inlinePlanPrice: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
  inlinePlanPriceActive: {
    color: '#fff',
  },
  inlinePlanPeriod: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    borderRadius: Radius.lg,
    color: '#fff',
    fontFamily: 'Inter-Bold',
    paddingHorizontal: Spacing.md,
    paddingVertical: 18,
    textAlign: 'center',
  },
  joinError: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  inviteErrorText: {
    color: '#FF5A5F',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 16,
  },
  inlineJoin: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  preAuthNote: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  helpBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexShrink: 0,
    zIndex: 10,
  },
  previewCard: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: 'rgba(255,122,69,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,69,0.25)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 6,
  },
  previewAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,122,69,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,69,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  previewTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  previewLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  previewName: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
  },
  previewNote: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  pendingRequestCard: {
    marginTop: Spacing.md,
    backgroundColor: 'rgba(255,107,61,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.25)',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  pendingRequestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    flexShrink: 0,
  },
  pendingAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,122,69,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pendingAvatarText: {
    color: '#FF6B3D',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
  },
  pendingRequestTitle: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
    minWidth: 0,
  },
  pendingRequestDesc: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  pendingRequestActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  pendingBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  declineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  declineBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  acceptGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  acceptSubscribeBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  acceptSubscribeGrad: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptSubscribeText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
});
