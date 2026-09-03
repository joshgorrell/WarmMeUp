import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AppText from '@/components/AppText';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CircleCheck as CheckCircle,
  CircleX as XCircle,
  Timer,
  UserPlus,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import {
  awardPoints,
  deactivatePreviousEphemeral,
  getPointValue,
  incrementMonthlyCounter,
} from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { Interaction } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import NeonDice, { NeonDiceHandle } from '@/components/NeonDice';
import ReceivedDiceChallengeCard from '@/components/ReceivedDiceChallengeCard';
import CustomizePromptsNotice from '@/components/CustomizePromptsNotice';
import { useLayout } from '@/hooks/useLayout';

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function useSenderCountdown(expiresAt: string | null | undefined): string | null {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setText(null);
      return;
    }

    const compute = () => {
      const secs = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
      if (secs <= 0) {
        setText('Expired');
        return;
      }
      if (secs < 60) {
        setText(`${secs}s`);
        return;
      }
      const mins = Math.floor(secs / 60);
      if (mins < 60) {
        setText(`${mins}m`);
        return;
      }
      const hrs = Math.floor(mins / 60);
      const m = mins % 60;
      setText(m === 0 ? `${hrs}h` : `${hrs}h ${m}m`);
    };

    compute();
    const id = setInterval(compute, 30000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return text;
}

const FALLBACK_PROMPTS = [
  'Send a playful note',
  'Ask them what they want',
  'Send a Dare',
  'Tell them something you like about them',
  'Share a private memory',
  'Send a Vault surprise',
  'Ask them to choose Give or Receive',
  'Tell them a secret',
  'Let them make the next move',
  'Send something sweet',
  'Challenge accepted?',
  'Make them smile',
  "Say what you're thinking",
  'Plan something for later',
  'Roll again',
];

const HOLD_DURATION = 2000;
const RING_SIZE_MAX = 240;
const STROKE = 6;

export default function DiceTab() {
  const { user, couple, partnerProfile, settings } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { isTabletOrLarger } = useLayout();
  const { dice_id: deepLinkDiceId } = useLocalSearchParams<{ dice_id?: string }>();

  const hasPartner = !!couple?.user_b_id;
  const expiryHours = settings?.challenge_expiry_hours ?? 24;
  const expirySeconds = expiryHours * 3600;
  const partnerFirstName =
    partnerProfile?.first_name?.trim() ||
    partnerProfile?.display_name?.trim().split(/\s+/)[0] ||
    undefined;

  const RING_MAX = isTabletOrLarger ? 340 : RING_SIZE_MAX;
  const ringSize = Math.min(RING_MAX, screenWidth - 80);
  const diceSize = Math.round(ringSize * (200 / 240));
  const radius = (ringSize - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  const [prompts, setPrompts] = useState<string[]>(FALLBACK_PROMPTS);
  const [hasCustomPrompts, setHasCustomPrompts] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<'you' | 'partner'>('you');
  const [draftRoll, setDraftRoll] = useState<string | null>(null);
  const [sendingRoll, setSendingRoll] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(5);
  const [error, setError] = useState('');
  const [holding, setHolding] = useState(false);
  const [incomingChallenge, setIncomingChallenge] = useState<Interaction | null>(null);
  const [sentDice, setSentDice] = useState<Interaction | null>(null);
  const [recentDice, setRecentDice] = useState<Interaction[]>([]);
  const [acceptPts, setAcceptPts] = useState(30);
  const [showDiceInstructions, setShowDiceInstructions] = useState(false);
  const [ringOffset, setRingOffset] = useState(
    () => 2 * Math.PI * ((RING_SIZE_MAX - STROKE) / 2),
  );
  const [highlightChallenge, setHighlightChallenge] = useState(false);

  const senderCountdown = useSenderCountdown(sentDice?.expires_at);
  const handledDiceLinkRef = useRef<string | null>(null);
  const diceRef = useRef<NeonDiceHandle>(null);
  const sentOpacity = useRef(new Animated.Value(0)).current;
  const sentTranslate = useRef(new Animated.Value(10)).current;
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);
  const holdScale = useRef(new Animated.Value(1)).current;
  const completedRef = useRef(false);

  const markDiceUsed = useCallback(() => {
    setShowDiceInstructions(false);
    if (user?.id) {
      SecureStore.setItemAsync(`dice_guidance_seen_${user.id}`, '1').catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    if (!user?.id) {
      setShowDiceInstructions(false);
      return () => {
        mounted = false;
      };
    }

    SecureStore.getItemAsync(`dice_guidance_seen_${user.id}`)
      .then(value => {
        if (mounted) setShowDiceInstructions(value !== '1');
      })
      .catch(() => {
        if (mounted) setShowDiceInstructions(true);
      });

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const id = holdProgress.addListener(({ value }) => {
      setRingOffset(circumference - value * circumference);
    });
    return () => holdProgress.removeListener(id);
  }, [holdProgress, circumference]);

  useEffect(() => {
    setRingOffset(circumference);
  }, [circumference]);

  useEffect(() => {
    getPointValue('dice_accept').then(a => setAcceptPts(a));
  }, []);

  useEffect(() => {
    const coupleId = couple?.id;
    const query = supabase
      .from('dice_prompts')
      .select('id, text, is_default, couple_id')
      .eq('is_active', true);
    const baseQuery = coupleId
      ? query.or(`is_default.eq.true,couple_id.eq.${coupleId}`)
      : query.eq('is_default', true);

    (async () => {
      try {
        const [promptsResult, hiddenResult] = await Promise.all([
          baseQuery,
          coupleId
            ? supabase
                .from('couple_hidden_prompts')
                .select('prompt_id')
                .eq('couple_id', coupleId)
                .eq('prompt_table', 'dice_prompts')
            : Promise.resolve({ data: [] }),
        ]);
        if (!promptsResult.data?.length) return;

        const hiddenIds = new Set(
          (hiddenResult.data ?? []).map((r: { prompt_id: string }) => r.prompt_id),
        );
        const visible = promptsResult.data.filter(
          (d: { id: string; is_default: boolean }) => !d.is_default || !hiddenIds.has(d.id),
        );
        if (visible.length > 0) setPrompts(visible.map((d: { text: string }) => d.text));

        const hasCustom = promptsResult.data.some(
          (d: { is_default: boolean; couple_id?: string }) =>
            !d.is_default && d.couple_id === coupleId,
        );
        setHasCustomPrompts(hasCustom ? 'yes' : 'no');
      } finally {
        setPromptsLoaded(true);
      }
    })();
  }, [couple?.id]);

  const checkStates = useCallback(async () => {
    if (!couple?.id || !user?.id) return;

    const [incomingRes, mySentRes] = await Promise.all([
      supabase
        .from('interactions')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('receiver_id', user.id)
        .eq('type', 'dice')
        .eq('rolled_for', 'partner')
        .in('status', ['sent', 'seen'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('interactions')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('sender_id', user.id)
        .eq('type', 'dice')
        .eq('rolled_for', 'partner')
        .in('status', ['sent', 'seen'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const expireIfOverdue = async (item: Interaction | null) => {
      if (!item?.expires_at || new Date(item.expires_at) > new Date()) return item;
      await supabase
        .from('interactions')
        .update({ status: 'expired', is_active: false })
        .eq('id', item.id)
        .in('status', ['sent', 'seen']);
      return null;
    };

    const incoming = await expireIfOverdue(incomingRes.data);
    const mySent = await expireIfOverdue(mySentRes.data);

    setIncomingChallenge(incoming);
    setSentDice(mySent);

    const { data: history } = await supabase
      .from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('type', 'dice')
      .eq('rolled_for', 'partner')
      .in('status', ['accepted', 'completed', 'rejected', 'cancelled', 'expired'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    setRecentDice(history ?? []);

    if (incoming || mySent || (history?.length ?? 0) > 0) {
      markDiceUsed();
    }
  }, [couple?.id, user?.id, markDiceUsed]);

  useEffect(() => {
    if (!couple?.id || !user?.id) return;
    checkStates();

    const ch = supabase
      .channel(`dice_tab_${couple.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` },
        payload => {
          const row = payload.new as Interaction;
          if (row.type !== 'dice') return;
          if (payload.eventType === 'INSERT' && row.sender_id !== user.id && row.rolled_for === 'partner') {
            setDraftRoll(null);
            showResult(row.content_text ?? '', 'partner');
          }
          checkStates();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [couple?.id, user?.id, checkStates]);

  useEffect(() => {
    if (!deepLinkDiceId || !couple?.id) return;
    if (handledDiceLinkRef.current === deepLinkDiceId) return;
    handledDiceLinkRef.current = deepLinkDiceId;

    (async () => {
      const { data: roll } = await supabase
        .from('interactions')
        .select('id, status, deleted_at')
        .eq('id', deepLinkDiceId)
        .maybeSingle();

      if (!roll || roll.deleted_at) {
        Alert.alert('Roll not found', 'This dice roll could not be found.');
        return;
      }

      const activeStatuses = ['sent', 'seen'];
      const isLoaded =
        incomingChallenge?.id === deepLinkDiceId;
      if (activeStatuses.includes(roll.status) && isLoaded) {
        setHighlightChallenge(true);
        setTimeout(() => setHighlightChallenge(false), 2000);
      }
    })();
  }, [deepLinkDiceId, couple?.id, incomingChallenge?.id]);

  const showResult = useCallback(
    (text: string, from: 'you' | 'partner') => {
      setResult(text);
      setResultLabel(from);
      sentOpacity.setValue(0);
      sentTranslate.setValue(10);
      Animated.parallel([
        Animated.timing(sentOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(sentTranslate, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true }),
      ]).start();
    },
    [sentOpacity, sentTranslate],
  );

  const triggerRoll = async () => {
    if (rolling || sendingRoll) return;
    if (!hasPartner) {
      setError('Pair with your partner before rolling.');
      return;
    }

    setRolling(true);
    setHolding(false);
    setError('');
    setDraftRoll(null);
    setResult(null);
    sentOpacity.setValue(0);
    sentTranslate.setValue(10);

    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    const landFace = Math.ceil(Math.random() * 6);

    diceRef.current?.roll(
      f => setFace(f),
      () => {
        setFace(landFace);
        setDraftRoll(prompt);
        showResult(prompt, 'you');
        markDiceUsed();
        setRolling(false);
      },
    );
  };

  const handleSendRoll = async () => {
    if (!draftRoll || !couple?.id || !user || sendingRoll) return;

    const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
    if (!partnerId) {
      setError('Pair with your partner before sending.');
      return;
    }

    setSendingRoll(true);
    setError('');
    try {
      await deactivatePreviousEphemeral(couple.id, user.id);
      const diceExpiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();
      const { error: insertError } = await supabase.from('interactions').insert({
        couple_id: couple.id,
        type: 'dice',
        sender_id: user.id,
        receiver_id: partnerId,
        content_text: draftRoll,
        status: 'sent',
        is_active: true,
        rolled_for: 'partner',
        expires_at: diceExpiresAt,
      });
      if (insertError) throw insertError;

      notifyPartner({
        event_type: 'dice_roll',
        couple_id: couple.id,
        target_route: '/(app)/(tabs)/dice',
        partnerUserId: partnerProfile?.id,
      });
      setDraftRoll(null);
      await checkStates();
    } catch {
      setError('Could not send to your partner. Try again.');
    } finally {
      setSendingRoll(false);
    }
  };

  const handleRespond = async (accepted: boolean) => {
    if (!incomingChallenge || !couple?.id || !user) return;

    if (accepted) {
      await supabase
        .from('interactions')
        .update({
          status: 'accepted',
          is_active: false,
          completed_at: new Date().toISOString(),
        })
        .eq('id', incomingChallenge.id);
      notifyPartner({
        event_type: 'dice_accepted',
        couple_id: couple.id,
        target_route: '/(app)/(tabs)/dice',
        partnerUserId: partnerProfile?.id,
      });
      const pts = await getPointValue('dice_accept');
      await awardPoints(couple.id, user.id, pts, 'Dice challenge accepted', incomingChallenge.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dice_accepted', pts);
      setIncomingChallenge(null);
    } else {
      await supabase
        .from('interactions')
        .update({ status: 'rejected', is_active: false })
        .eq('id', incomingChallenge.id);
      notifyPartner({
        event_type: 'dice_roll',
        couple_id: couple.id,
        target_route: '/(app)/(tabs)/dice',
        partnerUserId: partnerProfile?.id,
      });
      await awardPoints(couple.id, user.id, 1, 'Dice — participation', incomingChallenge.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dice_skipped', 0);
      setIncomingChallenge(null);
    }

    await checkStates();
  };

  const handleCancelSentRoll = () => {
    const id = sentDice?.id;
    if (!id || !user?.id) return;

    Alert.alert('Cancel this roll?', 'This ends the roll for both of you.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel roll',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('interactions')
            .update({ status: 'cancelled', is_active: false })
            .eq('id', id)
            .eq('sender_id', user.id);
          setSentDice(null);
          await checkStates();
        },
      },
    ]);
  };

  const onPressIn = () => {
    if (rolling || sendingRoll || !hasPartner) return;
    if (result) {
      setDraftRoll(null);
      setResult(null);
      setFace(5);
      sentOpacity.setValue(0);
      sentTranslate.setValue(10);
    }

    completedRef.current = false;
    setHolding(true);
    holdProgress.setValue(0);
    Animated.spring(holdScale, {
      toValue: 0.94,
      useNativeDriver: true,
      friction: 8,
    }).start();
    holdAnim.current = Animated.timing(holdProgress, {
      toValue: 1,
      duration: HOLD_DURATION,
      useNativeDriver: false,
    });
    holdAnim.current.start(({ finished }) => {
      if (finished) {
        completedRef.current = true;
        holdProgress.setValue(0);
        Animated.spring(holdScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 6,
        }).start();
        triggerRoll();
      }
    });
  };

  const onPressOut = () => {
    if (completedRef.current) return;
    setHolding(false);
    holdAnim.current?.stop();
    Animated.spring(holdScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
    }).start();
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const renderHistoryRow = (roll: Interaction) => {
    const isMine = roll.sender_id === user?.id;
    const accepted = roll.status === 'accepted' || roll.status === 'completed';
    const declined = roll.status === 'rejected';
    const expired = roll.status === 'expired';
    const title = accepted ? 'Accepted' : declined ? 'Declined' : expired ? 'Expired' : 'Cancelled';
    const relationship = isMine
      ? `You rolled for ${partnerFirstName ?? 'your partner'}`
      : `${partnerFirstName ?? 'Your partner'} rolled for you`;
    const dateValue = roll.completed_at ?? roll.created_at;
    const statusColor = accepted
      ? '#33D17A'
      : declined
        ? '#FF5A5F'
        : expired
          ? '#FFB347'
          : colors.textMuted;

    return (
      <View key={roll.id} style={[styles.historyRow, { borderBottomColor: colors.borderSubtle }]}>
        <View style={[styles.historyIcon, { borderColor: statusColor }]}>
          {accepted ? (
            <CheckCircle color={statusColor} size={18} strokeWidth={2.2} />
          ) : (
            <XCircle color={statusColor} size={18} strokeWidth={2.2} />
          )}
        </View>
        <View style={styles.historyMain}>
          <AppText style={[styles.historyTitle, { color: colors.text }]}>
            {title}{' '}
            <AppText style={[styles.historyRelationship, { color: colors.textMuted }]}>· {relationship}</AppText>
          </AppText>
          <AppText numberOfLines={2} style={[styles.historyText, { color: colors.textSecondary }]}>
            “{roll.content_text}”
          </AppText>
        </View>
        <View style={styles.historyMeta}>
          <AppText style={[styles.historyDate, { color: colors.textMuted }]}>{formatDate(dateValue)}</AppText>
          {accepted ? (
            <AppText style={styles.historyPoints}>+{acceptPts} pts</AppText>
          ) : declined ? (
            <AppText style={[styles.historyPoints, { color: colors.textMuted }]}>+1 pt</AppText>
          ) : (
            <AppText style={[styles.historyPoints, { color: colors.textMuted }]}>0 pts</AppText>
          )}
        </View>
      </View>
    );
  };

  const sentSubtitle =
    resultLabel === 'partner'
      ? `${partnerFirstName ?? 'Your partner'} rolled for you`
      : draftRoll
        ? 'You rolled it — send this one or roll again'
        : `Sent to ${partnerFirstName ?? 'your partner'} — waiting for them`;

  const hintText = holding
    ? 'Keep holding…'
    : hasPartner
      ? 'Press & hold'
      : 'Pair up first';

  return (
    <AppShell scrollable={false}>
      <TabHeader title="Dice" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        scrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <AppText style={styles.heroTitle}>
            <AppText style={styles.heroTitleWarm}>ROLL. </AppText>
            <AppText style={styles.heroTitleHot}>REVEAL.</AppText>
          </AppText>
          <AppText style={[styles.heroSubtitle, { color: colors.textSecondary }]}>A little surprise for {partnerFirstName ?? 'your partner'}.</AppText>
        </View>

        {showDiceInstructions && (
          <LinearGradient
            colors={['rgba(255,179,71,0.12)', 'rgba(255,46,138,0.08)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.introCard}
          >
            <AppText style={[styles.introTitle, { color: colors.text }]}>Roll it. Pick it. Send it.</AppText>
            <AppText style={[styles.introText, { color: colors.textSecondary }]}>Hold the dice to reveal a random prompt. Send the one you like, or roll again before your partner sees anything.</AppText>
          </LinearGradient>
        )}

        {incomingChallenge && (
          <View style={[styles.challengeSection, highlightChallenge && styles.challengeHighlight]}>
            <View
              style={[
                styles.pointsHint,
                {
                  backgroundColor: 'rgba(255,179,71,0.08)',
                  borderColor: 'rgba(255,179,71,0.25)',
                },
              ]}
            >
              <AppText style={[styles.pointsHintText, { color: colors.textSecondary }]}>Accept = <AppText style={styles.pts}>+{acceptPts} ⚡</AppText></AppText>
            </View>
            <ReceivedDiceChallengeCard
              text={incomingChallenge.content_text}
              status={incomingChallenge.status}
              expiresAt={incomingChallenge.expires_at}
              totalExpirySeconds={expirySeconds}
              partnerName={partnerFirstName}
              onAccept={() => handleRespond(true)}
              onReject={() => handleRespond(false)}
              onTimeout={checkStates}
            />
          </View>
        )}

        {showDiceInstructions && (
          <View style={[styles.howItWorksCard, { borderColor: colors.borderSubtle }]}>
            <AppText style={[styles.howItWorksTitle, { color: colors.textMuted }]}>HOW IT WORKS</AppText>
            <View style={styles.howItWorksRow}>
              <View style={styles.howStep}>
                <AppText style={styles.howStepNumber}>1</AppText>
                <AppText style={[styles.howStepTitle, { color: colors.text }]}>You roll</AppText>
                <AppText style={[styles.howStepText, { color: colors.textMuted }]}>Reveal a prompt</AppText>
              </View>
              <View style={[styles.howDivider, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.howStep}>
                <AppText style={styles.howStepNumber}>2</AppText>
                <AppText style={[styles.howStepTitle, { color: colors.text }]}>You choose</AppText>
                <AppText style={[styles.howStepText, { color: colors.textMuted }]}>Send or roll again</AppText>
              </View>
              <View style={[styles.howDivider, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.howStep}>
                <AppText style={styles.howStepNumber}>3</AppText>
                <AppText style={[styles.howStepTitle, { color: colors.text }]}>They play</AppText>
                <AppText style={[styles.howStepText, { color: colors.textMuted }]}>Accept or decline</AppText>
              </View>
            </View>
          </View>
        )}

        <View style={styles.diceArea}>
          <View style={styles.rollLabelWrap}>
            <AppText style={styles.rollLabel}>{holding ? 'KEEP HOLDING…' : 'PRESS & HOLD TO ROLL'}</AppText>
            <AppText style={[styles.rollExpiry, { color: colors.textMuted }]}>Sent rolls expire in {expiryHours}h</AppText>
          </View>

          <View style={[styles.diceContainer, { width: ringSize, height: ringSize }]}>
            {!rolling && (
              <Svg width={ringSize} height={ringSize} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Defs>
                  <SvgGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor="#FFB347" />
                    <Stop offset="0.5" stopColor="#FF5A3D" />
                    <Stop offset="1" stopColor="#FF2E8A" />
                  </SvgGradient>
                </Defs>
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={radius}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={STROKE}
                  fill="none"
                />
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={radius}
                  stroke="url(#ringGrad)"
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              </Svg>
            )}

            <Animated.View style={{ transform: [{ scale: holdScale }] }}>
              <TouchableOpacity
                activeOpacity={1}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={rolling || sendingRoll || !hasPartner}
                accessible
                accessibilityLabel="Hold to roll dice for your partner"
                accessibilityHint="Press and hold for 2 seconds to reveal a roll. You choose whether to send it."
              >
                <View style={[styles.diceWrapper, { width: diceSize, height: diceSize }]}>
                  <NeonDice ref={diceRef} face={face} size={diceSize} challengeText={result} />
                  {!result && !rolling && (
                    <View style={styles.hintOverlay} pointerEvents="none">
                      <AppText style={styles.hintText}>{hintText}</AppText>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          <Animated.View
            style={[styles.sentWrap, { opacity: sentOpacity, transform: [{ translateY: sentTranslate }] }]}
          >
            <AppText style={[styles.sent, { color: colors.textMuted }]}>{sentSubtitle}</AppText>

            {draftRoll && resultLabel === 'you' && (
              <View style={styles.draftActions}>
                <TouchableOpacity
                  style={styles.sendRollBtn}
                  onPress={handleSendRoll}
                  disabled={sendingRoll || rolling}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.sendRollGrad}
                  >
                    <AppText style={styles.sendRollText}>{sendingRoll ? 'Sending…' : `Send to ${partnerFirstName ?? 'Partner'}`}</AppText>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rollAgainBtn, { borderColor: colors.borderSubtle }]}
                  onPress={triggerRoll}
                  disabled={sendingRoll || rolling}
                  activeOpacity={0.75}
                >
                  <AppText style={[styles.rollAgainText, { color: colors.textSecondary }]}>Roll Again</AppText>
                </TouchableOpacity>
              </View>
            )}

            {senderCountdown && sentDice && !draftRoll && (
              <View style={styles.expiryRow}>
                <Timer color={colors.textMuted} size={12} strokeWidth={2} />
                <AppText style={[styles.expiryText, { color: colors.textMuted }]}>Expires in {senderCountdown}</AppText>
              </View>
            )}
            {sentDice && !draftRoll && (
              <TouchableOpacity onPress={handleCancelSentRoll} activeOpacity={0.7} style={styles.deleteLink}>
                <AppText style={[styles.deleteLinkText, { color: colors.textMuted }]}>Cancel roll</AppText>
              </TouchableOpacity>
            )}
          </Animated.View>

          {!hasPartner && (
            <TouchableOpacity
              style={styles.soloNotice}
              onPress={() => router.push('/(app)/account')}
              activeOpacity={0.75}
            >
              <UserPlus color={colors.textMuted} size={13} strokeWidth={2} />
              <AppText style={[styles.soloNoticeText, { color: colors.textMuted }]}>Dice is for the two of you — <AppText style={[styles.soloNoticeLink, { color: '#FFB347' }]}>pair up first</AppText></AppText>
            </TouchableOpacity>
          )}

          {hasPartner && promptsLoaded && hasCustomPrompts === 'no' && (
            <CustomizePromptsNotice
              onPress={() => router.push('/(app)/customize-prompts?tab=dice')}
              accentColor="#FFB347"
            />
          )}

          {error ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: 'rgba(255,90,95,0.08)',
                  borderColor: 'rgba(255,90,95,0.25)',
                },
              ]}
            >
              <AppText
                style={{
                  color: colors.danger,
                  fontSize: FontSize.sm,
                  fontFamily: 'Inter-Medium',
                  textAlign: 'center',
                }}
              >
                {error}
              </AppText>
            </View>
          ) : null}
        </View>

        {recentDice.length > 0 && (
          <View style={styles.previousSection}>
            <View style={styles.previousHeader}>
              <AppText style={[styles.sectionTitle, { color: colors.text }]}>Previous Rolls</AppText>
              {recentDice.length >= 5 && <AppText style={styles.viewAllText}>Recent 5</AppText>}
            </View>
            <View
              style={[
                styles.historyCard,
                { backgroundColor: colors.card, borderColor: colors.borderSubtle },
              ]}
            >
              {recentDice.map(renderHistoryRow)}
            </View>
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.xl,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.7,
  },
  heroTitleWarm: {
    color: '#FFB347',
  },
  heroTitleHot: {
    color: '#FF2E8A',
  },
  heroSubtitle: {
    marginTop: 5,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  introCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.28)',
    padding: 15,
    marginBottom: 14,
  },
  introTitle: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  introText: {
    marginTop: 5,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  challengeSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  challengeHighlight: {
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,179,71,0.50)',
    padding: Spacing.sm,
    backgroundColor: 'rgba(255,179,71,0.07)',
  },
  pointsHint: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  pointsHintText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  pts: {
    fontFamily: 'Inter-Bold',
    color: '#33D17A',
  },
  howItWorksCard: {
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 12,
    marginBottom: 10,
  },
  howItWorksTitle: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: 10,
  },
  howItWorksRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  howStep: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  howStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
    color: '#FFB347',
    backgroundColor: 'rgba(255,179,71,0.12)',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    marginBottom: 6,
  },
  howStepTitle: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  howStepText: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  howDivider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  diceArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  rollLabelWrap: {
    alignItems: 'center',
    gap: 3,
  },
  rollLabel: {
    color: '#FFB347',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.8,
  },
  rollExpiry: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  diceContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  diceWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    textAlign: 'center',
  },
  sentWrap: {
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  sent: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  draftActions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: 4,
  },
  sendRollBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  sendRollGrad: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendRollText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Bold',
  },
  rollAgainBtn: {
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  rollAgainText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  deleteLink: {
    marginTop: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteLinkText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textDecorationLine: 'underline',
    opacity: 0.6,
  },
  errorBanner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    width: '100%',
  },
  soloNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
  },
  soloNoticeText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    letterSpacing: 0.2,
  },
  soloNoticeLink: {
    fontFamily: 'Inter-Medium',
  },
  previousSection: {
    marginTop: 26,
  },
  previousHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
  },
  viewAllText: {
    color: '#FF2E8A',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  historyCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 13,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMain: {
    flex: 1,
    minWidth: 0,
  },
  historyTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  historyRelationship: {
    fontFamily: 'Inter-Regular',
  },
  historyText: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
    fontStyle: 'italic',
  },
  historyMeta: {
    alignItems: 'flex-end',
    gap: 3,
    marginLeft: 4,
  },
  historyDate: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
  },
  historyPoints: {
    color: '#33D17A',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
});
