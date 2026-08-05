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
import { ChevronLeft, ChevronRight, UserPlus, Lock, X, Copy, RefreshCw, Check, Circle as XCircle, Hourglass, Circle as HelpCircle, Sparkles } from 'lucide-react-native';
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
import { ensureConfigured } from '@/lib/purchases';
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
type WaitingState = 'idle' | 'waiting' | 'accepted' | 'declined' | 'trial_expired';
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
  const [waitingState, setWaitingState] = useState<WaitingState>('idle');
  const [waitingCoupleId, setWaitingCoupleId] = useState<string | null>(null);
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
  const trialExpiredNotifiedRef = useRef(false);
  const trialReminderSentRef = useRef(false);
  const [showAcceptSubscribeBtn, setShowAcceptSubscribeBtn] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Refresh subscription first so admin grants / trial status is current
    // before loadOrCreateCouple checks premium access.
    (async () => {
      await refreshSubscription();
      // Before loading the couple, check whether the user has a pending join request
      // from a previous session. If so, resume straight into the waiting state.
      const pending = await getMyPendingJoin();
      if (pending.ok && (pending.status === 'b_accepted' || pending.status === 'pending')) {
        setWaitingState('waiting');
        setWaitingCoupleId(pending.coupleId);
        setInviterName(pending.inviterName);
        setInviterAvatar(pending.inviterAvatar);
        if (!pending.inviterPremiumActive) {
          setWaitingState('trial_expired');
        }
        setActiveModal(null);
        setResumeChecked(true);
        return;
      }
      if (pending.ok && pending.status === 'accepted') {
        // Already accepted — refresh and let the couple redirect handle navigation.
        await refreshCouple();
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

  // Resolve the waiting state: navigate to celebration or mark declined.
  const resolveWaiting = async (status: 'accepted' | 'declined') => {
    if (status === 'accepted') {
      setWaitingState('accepted');
      await refreshCouple();
      // Refresh subscription so User B immediately picks up partner-shared premium
      // without needing a full app restart.
      refreshSubscription().catch(() => {});
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token && waitingCoupleId) {
        fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event_type: 'partner_joined', couple_id: waitingCoupleId }),
        }).catch(() => {});
      }
      if (!settings?.celebration_seen) {
        router.replace({
          pathname: '/(auth)/paired-celebration',
          params: { partnerName: inviterName || '' },
        });
      } else {
        router.replace('/(app)/(tabs)');
      }
    } else {
      setWaitingState('declined');
    }
  };

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

  // User B: subscribe to the couple row for accept/decline transitions while waiting.
  useEffect(() => {
    if (waitingState !== 'waiting' || !waitingCoupleId) return;
    const channelName = `waiting:${waitingCoupleId}`;
    // Clean up any stale channel with the same name to avoid "already subscribed" crashes.
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === channelName) supabase.removeChannel(ch);
    });
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${waitingCoupleId}` },
          async (payload: any) => {
            const newStatus = payload?.new?.pending_partner_status;
            const newUserB = payload?.new?.user_b_id;
            if (newUserB && user) {
              await resolveWaiting('accepted');
            } else if (newStatus === 'declined') {
              await resolveWaiting('declined');
            }
          },
        )
        .subscribe();
    } catch {
      // Polling fallback (below) will still catch status changes if realtime setup fails.
    }
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [waitingState, waitingCoupleId, user, settings?.celebration_seen, inviterName]);

  // User B: polling fallback — if realtime drops, poll every 4s for status changes.
  // Uses a two-strike rule for decline detection: the first `getMyPendingJoin`
  // failure is treated as a transient blip and re-checked immediately. Only a
  // second consecutive failure is treated as a real decline. This prevents
  // false "declined" resolutions from momentary network errors.
  useEffect(() => {
    if (waitingState !== 'waiting' || !user) return;
    let cancelled = false;
    let consecutiveFailures = 0;
    const poll = async () => {
      const result = await getMyPendingJoin();
      if (cancelled) return;
      if (result.ok && result.status === 'accepted') {
        await resolveWaiting('accepted');
      } else if (result.ok && (result.status === 'b_accepted' || result.status === 'pending')) {
        // Still waiting — reset failure counter and keep polling.
        consecutiveFailures = 0;
        return;
      } else if (!result.ok) {
        consecutiveFailures += 1;
        // Two-strike rule: only resolve as declined after two consecutive
        // failures. A single failure could be a transient network blip.
        if (consecutiveFailures >= 2) {
          await resolveWaiting('declined');
        }
      }
    };
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [waitingState, waitingCoupleId, user, inviterName]);

  // User A: accept a pending request
  const handleAccept = async () => {
    if (!couple?.id || acceptLoading) return;
    setAcceptLoading(true);
    setShowAcceptSubscribeBtn(false);
    try {
      const { data: result, error } = await supabase.rpc('accept_partner');
      if (error || !result?.ok) {
        if (result?.reason === 'no_subscription') {
          setError('Your trial has ended. Subscribe to confirm your partner.');
          setShowAcceptSubscribeBtn(true);
        } else {
          setError('Could not accept right now. Try again.');
        }
        return;
      }
      await refreshCouple();
      // Realtime will pick up user_b_id and redirect
    } catch (e: any) {
      logger.warn('[pair] error:', e?.message);
      setError('Something went wrong. Please try again.');
    } finally {
      setAcceptLoading(false);
    }
  };

  // User A: decline a pending request
  const handleDecline = async () => {
    if (!couple?.id || acceptLoading) return;
    setAcceptLoading(true);
    try {
      const { error } = await supabase.rpc('decline_partner');
      if (error) {
        setError('Could not decline right now. Try again.');
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
      const Purchases = await ensureConfigured();
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
      const { data: { session } } = await supabase.auth.getSession();
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
      const { data: result, error: rpcError } = await supabase.rpc('generate_invite_code');
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

  // User B: cancel their own pending request
  const handleCancelRequest = async () => {
    try {
      await supabase.rpc('cancel_request');
      setWaitingState('idle');
      setWaitingCoupleId(null);
      setJoinCode('');
      setActiveModal(null);
      await refreshCouple();
    } catch {}
  };

  // Auto-submit when a full 6-character code is entered
  useEffect(() => {
    if (joinCode.length !== 6) return;
    if (user) {
      handleJoin();
    } else {
      handlePreAuthJoin();
    }
  }, [joinCode]);

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
      // This avoids a split between "DB query" and "RPC fallback" that could diverge.
      const { data: result, error: rpcError } = await supabase.rpc('generate_invite_code');
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
      // grant fallback) and retry once more before showing a visible error.
      if ((result as any)?.success === false && (result as any)?.reason === 'no_subscription') {
        const profileAge = profile?.created_at ? Date.now() - new Date(profile.created_at).getTime() : Infinity;
        if (profileAge < 30_000) {
          await new Promise(r => setTimeout(r, 1000));
          await refreshSubscription();
          const { data: retry } = await supabase.rpc('generate_invite_code');
          if ((retry as any)?.success === false && (retry as any)?.reason === 'no_subscription') {
            logDebugEvent('INVITE CREATE NO_SUBSCRIPTION', { source: 'new_profile_retry_failed', userId: user.id });
            setInviteError('Your free trial is being set up. Please reopen the app in a moment.');
            return;
          }
          const retryCode = (retry as any)?.invite_code ?? null;
          if (retryCode) {
            logDebugEvent('INVITE CREATE SUCCESS', { source: 'rpc_retry', inviteCode: retryCode });
            setMyCode(retryCode);
            await refreshCouple();
            return;
          }
        }
        // Older account — the entitlement grant fallback in refreshSubscription
        // may not have been applied yet. Refresh and retry once.
        logDebugEvent('INVITE CREATE NO_SUBSCRIPTION', { source: 'old_profile_retry', userId: user.id });
        await refreshSubscription();
        await new Promise(r => setTimeout(r, 500));
        const { data: retry2 } = await supabase.rpc('generate_invite_code');
        if ((retry2 as any)?.success === false && (retry2 as any)?.reason === 'no_subscription') {
          logDebugEvent('INVITE CREATE NO_SUBSCRIPTION', { source: 'old_profile_retry_failed', userId: user.id, canInvite: subscriptionInfo.canInvite });
          setInviteError('Could not generate an invite code. If you have an active subscription or entitlement, please try again or contact support.');
          return;
        }
        const retryCode2 = (retry2 as any)?.invite_code ?? null;
        if (retryCode2) {
          logDebugEvent('INVITE CREATE SUCCESS', { source: 'rpc_old_profile_retry', inviteCode: retryCode2 });
          setMyCode(retryCode2);
          await refreshCouple();
          return;
        }
        setInviteError('Invite code generation failed. Please try again.');
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
      // Preview inviter name first so we can show it in the waiting overlay
      const preview = await previewInvite(normalized);
      if (!preview.ok) {
        setError('Invalid code. Check with your partner.');
        return;
      }
      setInviterName(preview.inviterName);
      setInviterAvatar(preview.inviterAvatar);

      const { data: joinResult, error: joinError } = await supabase
        .rpc('request_join', { invite_code: normalized });

      if (joinError) {
        setError('Something went wrong. Please try again.');
        return;
      }

      if (!joinResult.ok) {
        switch (joinResult.reason) {
          case 'already_connected':
            setError("You're already connected to a partner.");
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

      // Request created — move to waiting state. Realtime handles accept/decline.
      setWaitingState('waiting');
      setWaitingCoupleId(joinResult.couple_id);
      setActiveModal(null);
      await refreshCouple();

      // Notify User A that a request is pending (with retry)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (token) {
        const notifyUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`;
        const notifyBody = JSON.stringify({ event_type: 'partner_request', couple_id: joinResult.couple_id });
        const notifyHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
        // Retry up to 3 times with backoff so a transient edge function failure
        // doesn't leave User A unaware of the pending request.
        (async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const res = await fetch(notifyUrl, { method: 'POST', headers: notifyHeaders, body: notifyBody });
              if (res.ok) return;
            } catch {}
            await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
          }
        })();
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
        setError('Invalid code. Check with your partner.');
        return;
      }
      setPreAuthPreview({ name: result.inviterName });
    } catch (e: any) {
      logger.warn('[pair] error:', e?.message);
      setError('Something went wrong. Please try again.');
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
            contentContainerStyle={[styles.scroll, { paddingTop: scrollPaddingTop }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={centerStyle}>
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
                    <HeartOutline size={heartSize} gradientId="heartL2" colorA="#FFB347" colorB="#FF5A3D" />
                  </View>
                  <View style={[styles.heartContainer, { marginLeft: heartOverlap, zIndex: 2 }]}>
                    <View style={styles.heartGlowPink} />
                    <HeartOutline size={heartSize} gradientId="heartR2" colorA="#FF5A3D" colorB="#FF2E8A" />
                  </View>
                </View>
                <AppText style={[styles.sparkle, { top: 8, left: '22%', fontSize: 12 }]}>✦</AppText>
                <AppText style={[styles.sparkle, { top: 4, right: '20%', fontSize: 7 }]}>✦</AppText>
                <AppText style={[styles.sparkle, { bottom: 14, left: '14%', fontSize: 8 }]}>✦</AppText>
                <AppText style={[styles.sparkle, { bottom: 20, right: '15%', fontSize: 6 }]}>✦</AppText>
              </View>

              <View style={[styles.headerRow, { justifyContent: 'space-between', marginBottom: Spacing.sm }]}>
                <AppText style={[styles.heading, { fontSize: headingSize }]}>Enter your{'\n'}partner's code</AppText>
                <TouchableOpacity
                  style={styles.helpBtn}
                  onPress={() => { setHelpVariant('joiner'); setHelpVisible(true); }}
                  activeOpacity={0.7}
                >
                  <HelpCircle color="rgba(255,255,255,0.45)" size={22} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
              <AppText style={styles.sub}>Type in the invite code they sent you.</AppText>

              {preAuthPreview ? (
                <View style={styles.previewCard}>
                  <AppText style={styles.previewLabel}>You're connecting with</AppText>
                  <AppText style={styles.previewName}>{preAuthPreview.name}</AppText>
                  <AppText style={styles.previewNote}>
                    Tap Continue to create your account. Your partner will confirm the connection after you join.
                  </AppText>
                </View>
              ) : null}

              <View style={styles.inlineJoin}>
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
                    ? 'Your partner will confirm the connection after you create your account.'
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
          <View style={[styles.headerRow, { justifyContent: 'space-between', marginBottom: Spacing.sm }]}>
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
              onPress={() => setActiveModal('join')}
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

          {/* Pending request card — shown on the main screen so User A sees it
              even without premium access. Previously this was buried inside the
              invite modal's canInvite branch, making it invisible to users whose
              subscription info hadn't loaded or who lacked premium. */}
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
                  {pendingPartnerName ? `${pendingPartnerName} accepted your invite!` : 'A partner wants to connect'}
                </AppText>
              </View>
              <AppText style={styles.pendingRequestDesc}>
                {pendingPartnerName
                  ? `${pendingPartnerName} is ready to join you on Warm Me Up! Confirm to open your shared space.`
                  : 'Someone entered your invite code.\nConfirm only if they\'re your partner.'}
              </AppText>
              {error ? <AppText style={styles.joinError}>{error}</AppText> : null}
              {showAcceptSubscribeBtn ? (
                <TouchableOpacity
                  style={styles.acceptSubscribeBtn}
                  onPress={() => router.push('/(auth)/subscription')}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.acceptSubscribeGrad}
                  >
                    <AppText style={styles.acceptSubscribeText}>Subscribe now</AppText>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
              <View style={styles.pendingRequestActions}>
                <TouchableOpacity
                  style={[styles.pendingBtn, styles.declineBtn]}
                  onPress={handleDecline}
                  activeOpacity={0.8}
                  disabled={acceptLoading}
                >
                  <XCircle color="rgba(255,255,255,0.7)" size={16} />
                  <AppText style={styles.declineBtnText}>Decline</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pendingBtn}
                  onPress={handleAccept}
                  activeOpacity={0.85}
                  disabled={acceptLoading}
                >
                  <LinearGradient
                    colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.acceptGrad}
                  >
                    {acceptLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Check color="#fff" size={16} />
                        <AppText style={styles.acceptBtnText}>Accept</AppText>
                      </>
                    )}
                  </LinearGradient>
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

      {/* User B: Waiting for User A to accept */}
      <Modal
        visible={waitingState === 'waiting'}
        transparent
        animationType="fade"
        onRequestClose={handleCancelRequest}
      >
        <View style={styles.waitingOverlay}>
          <View style={styles.waitingCard}>
            <View style={styles.waitingIconWrap}>
              <Hourglass color="#FF6B3D" size={32} strokeWidth={1.8} />
            </View>
            <AppText style={styles.waitingOverlayTitle}>Waiting for confirmation</AppText>
            <AppText style={styles.waitingOverlayDesc}>
              {inviterName
                ? `${inviterName} needs to confirm the connection.\nAsk them to open the app and accept.`
                : 'Your partner needs to confirm the connection.\nAsk them to open the app and accept.'}
            </AppText>
            <ActivityIndicator color="#FF6B3D" size="small" style={{ marginTop: Spacing.md }} />
            <TouchableOpacity
              style={styles.cancelWaitingBtn}
              onPress={handleCancelRequest}
              activeOpacity={0.7}
            >
              <AppText style={styles.cancelWaitingText}>Cancel request</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PairHelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        variant={helpVariant ?? 'joiner'}
      />

      {/* User B: Inviter's trial expired */}
      <Modal
        visible={waitingState === 'trial_expired'}
        transparent
        animationType="fade"
        onRequestClose={handleCancelRequest}
      >
        <View style={styles.waitingOverlay}>
          <View style={styles.waitingCard}>
            <View style={styles.waitingIconWrap}>
              <Hourglass color="#FFB84D" size={32} strokeWidth={1.8} />
            </View>
            <AppText style={styles.waitingOverlayTitle}>Partner's trial ended</AppText>
            <AppText style={styles.waitingOverlayDesc}>
              {inviterName
                ? `${inviterName}'s free trial has ended. They've been notified to subscribe and confirm your connection.`
                : "Your partner's free trial has ended. They've been notified to subscribe and confirm your connection."}
            </AppText>
            <TouchableOpacity
              style={styles.cancelWaitingBtn}
              onPress={handleCancelRequest}
              activeOpacity={0.7}
            >
              <AppText style={styles.cancelWaitingText}>Cancel request</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* User B: Declined */}
      <Modal
        visible={waitingState === 'declined'}
        transparent
        animationType="fade"
        onRequestClose={() => { setWaitingState('idle'); setWaitingCoupleId(null); }}
      >
        <View style={styles.waitingOverlay}>
          <View style={styles.waitingCard}>
            <View style={styles.waitingIconWrap}>
              <XCircle color="#FF5A5F" size={32} strokeWidth={1.8} />
            </View>
            <AppText style={styles.waitingOverlayTitle}>Request declined</AppText>
            <AppText style={styles.waitingOverlayDesc}>
              Your partner declined the connection, or their trial may have ended.{'\n'}Ask them to subscribe and try again.
            </AppText>
            <TouchableOpacity
              style={styles.cancelWaitingBtn}
              onPress={() => { setWaitingState('idle'); setWaitingCoupleId(null); setJoinCode(''); }}
              activeOpacity={0.7}
            >
              <AppText style={styles.cancelWaitingText}>OK</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060406' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexShrink: 0,
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
  waitingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.88)',
    padding: Spacing.xl,
  },
  waitingCard: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  waitingIconWrap: {
    marginBottom: Spacing.xs,
  },
  waitingOverlayTitle: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  waitingOverlayDesc: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelWaitingBtn: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  cancelWaitingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
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
