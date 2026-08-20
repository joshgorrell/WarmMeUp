import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Animated, ScrollView, Alert, useWindowDimensions,
} from 'react-native';
import AppText from '@/components/AppText';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleCheck as CheckCircle, Timer, UserPlus } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, deactivatePreviousEphemeral, getPointValue, verifyCompletion, incrementMonthlyCounter, reversePoints } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { Interaction } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import NeonDice, { NeonDiceHandle } from '@/components/NeonDice';
import ReceivedDiceChallengeCard from '@/components/ReceivedDiceChallengeCard';
import CustomizePromptsNotice from '@/components/CustomizePromptsNotice';
import { useLayout } from '@/hooks/useLayout';

function useSenderCountdown(expiresAt: string | null | undefined): string | null {
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!expiresAt) { setText(null); return; }
    const compute = () => {
      const secs = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
      if (secs <= 0) { setText('Expired'); return; }
      if (secs < 60) { setText(`${secs}s`); return; }
      const mins = Math.floor(secs / 60);
      if (mins < 60) { setText(`${mins}m`); return; }
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

type RolledFor = 'self' | 'partner';

export default function DiceTab() {
  const { user, couple, partnerProfile, settings } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { isTabletOrLarger } = useLayout();

  // Scale the ring: tablet gets up to 340pt, phone stays capped at 240pt
  const RING_MAX = isTabletOrLarger ? 340 : RING_SIZE_MAX;
  const ringSize = Math.min(RING_MAX, screenWidth - 80);
  const diceSize = Math.round(ringSize * (200 / 240));
  const radius = (ringSize - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  const { dice_id: deepLinkDiceId } = useLocalSearchParams<{ dice_id?: string }>();
  const hasPartner = !!couple?.user_b_id;
  const expiryHours = settings?.challenge_expiry_hours ?? 24;
  const expirySeconds = expiryHours * 3600;
  const [prompts, setPrompts] = useState<string[]>(FALLBACK_PROMPTS);
  const [hasCustomPrompts, setHasCustomPrompts] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [rolledFor, setRolledFor] = useState<RolledFor>('self');
  const [rolledForResult, setRolledForResult] = useState<RolledFor>('self');
  const [result, setResult] = useState<string | null>(null);
  const [resultLabel, setResultLabel] = useState<'you' | 'partner'>('you');
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(5);
  const [error, setError] = useState('');
  const [holding, setHolding] = useState(false);
  const [incomingChallenge, setIncomingChallenge] = useState<Interaction | null>(null);
  const [pendingVerification, setPendingVerification] = useState<Interaction | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [acceptPts, setAcceptPts] = useState(5);
  const [completePts, setCompletePts] = useState(25);
  const [ringOffset, setRingOffset] = useState(() => 2 * Math.PI * ((RING_SIZE_MAX - STROKE) / 2));
  const [sentDice, setSentDice] = useState<Interaction | null>(null);
  const senderCountdown = useSenderCountdown(sentDice?.expires_at);
  const [highlightChallenge, setHighlightChallenge] = useState(false);
  const handledDiceLinkRef = useRef<string | null>(null);

  // Tracks the id of the last self-roll interaction so we can delete it
  const lastSelfRollId = useRef<string | null>(null);

  const diceRef = useRef<NeonDiceHandle>(null);
  const sentOpacity = useRef(new Animated.Value(0)).current;
  const sentTranslate = useRef(new Animated.Value(10)).current;
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);
  const holdScale = useRef(new Animated.Value(1)).current;
  const completedRef = useRef(false);

  useEffect(() => {
    const id = holdProgress.addListener(({ value }) => {
      setRingOffset(circumference - value * circumference);
    });
    return () => holdProgress.removeListener(id);
  }, [holdProgress, circumference]);

  // Sync ring to full "empty" position when circumference changes (e.g. screen resize)
  useEffect(() => { setRingOffset(circumference); }, [circumference]);

  useEffect(() => {
    Promise.all([getPointValue('dice_accept'), getPointValue('dice_complete')]).then(([a, c]) => {
      setAcceptPts(a);
      setCompletePts(c);
    });
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
            ? supabase.from('couple_hidden_prompts').select('prompt_id').eq('couple_id', coupleId).eq('prompt_table', 'dice_prompts')
            : Promise.resolve({ data: [] }),
        ]);
        if (!promptsResult.data?.length) return;
        const hiddenIds = new Set((hiddenResult.data ?? []).map((r: { prompt_id: string }) => r.prompt_id));
        const visible = promptsResult.data.filter((d: { id: string; is_default: boolean }) => !d.is_default || !hiddenIds.has(d.id));
        if (visible.length > 0) setPrompts(visible.map((d: { text: string }) => d.text));
        const hasCustom = promptsResult.data.some((d: { is_default: boolean; couple_id?: string }) => !d.is_default && d.couple_id === coupleId);
        setHasCustomPrompts(hasCustom ? 'yes' : 'no');
      } finally {
        setPromptsLoaded(true);
      }
    })();
  }, [couple?.id]);

  const checkStates = useCallback(async () => {
    if (!couple?.id || !user?.id) return;

    const [incomingRes, pendingRes, mySentRes] = await Promise.all([
      supabase
        .from('interactions')
        .select('*')
        .eq('couple_id', couple.id)
        .eq('receiver_id', user.id)
        .eq('type', 'dice')
        .eq('rolled_for', 'partner')
        .in('status', ['sent', 'accepted', 'pending_verification'])
        .is('completed_at', null)
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
        .eq('status', 'pending_verification')
        .is('completed_at', null)
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
        .eq('status', 'sent')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const incoming = incomingRes.data;
    if (incoming && incoming.expires_at && new Date(incoming.expires_at) <= new Date()) {
      // Auto-reject expired incoming dice challenge silently
      await supabase.from('interactions').update({ status: 'rejected', is_active: false }).eq('id', incoming.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dice_skipped', 0);
      setIncomingChallenge(null);
    } else {
      setIncomingChallenge(incoming);
    }

    setPendingVerification(pendingRes.data);
    setSentDice(mySentRes.data ?? null);
  }, [couple?.id, user?.id]);

  useEffect(() => {
    if (!couple?.id || !user?.id) return;
    checkStates();
    const ch = supabase
      .channel(`dice_tab_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, (payload) => {
        const row = payload.new as Interaction;
        if (row.type !== 'dice') return;
        if (payload.eventType === 'INSERT' && row.sender_id !== user.id && row.rolled_for === 'partner') {
          showResult(row.content_text ?? '', 'partner');
        }
        checkStates();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, user?.id, checkStates]);

  // Deep-link: when dice_id param arrives, check if the roll is still active
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
      if (roll.status === 'sent' && incomingChallenge?.id === deepLinkDiceId) {
        setHighlightChallenge(true);
        setTimeout(() => setHighlightChallenge(false), 2000);
      } else if (!['sent'].includes(roll.status)) {
        Alert.alert('Roll already resolved', 'This dice roll has already been accepted or has expired.');
      }
    })();
  }, [deepLinkDiceId]);

  const showResult = useCallback((text: string, from: 'you' | 'partner') => {
    setResult(text);
    setResultLabel(from);
    sentOpacity.setValue(0);
    sentTranslate.setValue(10);
    Animated.parallel([
      Animated.timing(sentOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(sentTranslate, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true }),
    ]).start();
  }, [sentOpacity, sentTranslate]);

  const triggerRoll = async () => {
    if (rolling) return;
    setRolling(true);
    setHolding(false);
    setError('');
    setResult(null);
    sentOpacity.setValue(0);
    sentTranslate.setValue(10);

    const idx = Math.floor(Math.random() * prompts.length);
    const prompt = prompts[idx];
    const landFace = Math.ceil(Math.random() * 6);
    const forPartner = rolledFor === 'partner' && hasPartner;

    diceRef.current?.roll(
      (f) => setFace(f),
      async () => {
        setFace(landFace);
        setRolledForResult(forPartner ? 'partner' : 'self');
        try {
          if (couple?.id && user) {
            const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
            const receiverId = partnerId ?? user.id;
            await deactivatePreviousEphemeral(couple.id, user.id);
            const diceExpiresAt = forPartner
              ? new Date(Date.now() + expirySeconds * 1000).toISOString()
              : null;
            const { data: interaction, error: insertError } = await supabase
              .from('interactions')
              .insert({
                couple_id: couple.id,
                type: 'dice',
                sender_id: user.id,
                receiver_id: receiverId,
                content_text: prompt,
                status: 'sent',
                is_active: true,
                rolled_for: rolledFor,
                ...(diceExpiresAt ? { expires_at: diceExpiresAt } : {}),
              })
              .select()
              .single();
            if (insertError) throw insertError;
            if (interaction && !forPartner) {
              lastSelfRollId.current = interaction.id;
            } else {
              lastSelfRollId.current = null;
            }
            if (forPartner && partnerId) {
              notifyPartner({ event_type: 'dice_roll', couple_id: couple.id, target_route: '/(app)/(tabs)/dice', partnerUserId: partnerProfile?.id });
              await checkStates();
            }
          }
          showResult(prompt, 'you');
        } catch {
          setError('Could not send to your partner. Try again.');
          showResult(prompt, 'you');
        } finally {
          setRolling(false);
        }
      }
    );
  };

  const handleRespond = async (accepted: boolean) => {
    if (!incomingChallenge || !couple?.id || !user) return;
    if (accepted) {
      // Keep is_active true so the receiver can later tap "I Did It!"
      await supabase.from('interactions').update({ status: 'accepted', is_active: false }).eq('id', incomingChallenge.id);
      notifyPartner({ event_type: 'dice_accepted', couple_id: couple.id, target_route: '/(app)/(tabs)/dice', partnerUserId: partnerProfile?.id });
      const pts = await getPointValue('dice_accept');
      await awardPoints(couple.id, user.id, pts, 'Dice challenge accepted', incomingChallenge.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dice_accepted', pts);
      // Update local state to reflect accepted stage so card transitions
      setIncomingChallenge({ ...incomingChallenge, status: 'accepted' });
    } else {
      await supabase.from('interactions').update({ status: 'rejected', is_active: false }).eq('id', incomingChallenge.id);
      notifyPartner({ event_type: 'dice_roll', couple_id: couple.id, target_route: '/(app)/(tabs)/dice', partnerUserId: partnerProfile?.id });
      await awardPoints(couple.id, user.id, 1, 'Dice — participation', incomingChallenge.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dice_skipped', 0);
      setIncomingChallenge(null);
    }
  };

  const handleDiceComplete = async () => {
    if (!incomingChallenge || !couple?.id) return;
    await supabase.from('interactions').update({
      status: 'pending_verification',
      completion_requested_at: new Date().toISOString(),
      is_active: false,
    }).eq('id', incomingChallenge.id);
    notifyPartner({ event_type: 'dice_accepted', couple_id: couple.id, target_route: '/(app)/(tabs)/dice', partnerUserId: partnerProfile?.id });
    setIncomingChallenge({ ...incomingChallenge, status: 'pending_verification' });
  };

  const handleVerifyComplete = async () => {
    if (!pendingVerification || !couple?.id || !user) return;
    setVerifying(true);
    try {
      await verifyCompletion(
        pendingVerification.id,
        couple.id,
        user.id,
        pendingVerification.receiver_id,
        'dice_complete'
      );
      await incrementMonthlyCounter(couple.id, pendingVerification.receiver_id, 'dice_completed', completePts);
      notifyPartner({ event_type: 'dice_completed', couple_id: couple.id, target_route: '/(app)/(tabs)/dice', partnerUserId: partnerProfile?.id });
      setPendingVerification(null);
    } catch {
      setError('Could not verify. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const confirmDeleteRoll = (onConfirm: () => void) => {
    Alert.alert(
      'Remove this roll?',
      'This will remove the roll and any points earned from it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onConfirm },
      ]
    );
  };

  const handleDeleteSelfRoll = () => {
    const id = lastSelfRollId.current;
    if (!id || !couple?.id || !user?.id) return;
    confirmDeleteRoll(async () => {
      await supabase
        .from('interactions')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id);
      lastSelfRollId.current = null;
      setResult(null);
      setFace(5);
      sentOpacity.setValue(0);
      sentTranslate.setValue(10);
    });
  };

  const handleCancelSentRoll = () => {
    const id = sentDice?.id;
    if (!id || !couple?.id || !user?.id) return;
    confirmDeleteRoll(async () => {
      await supabase
        .from('interactions')
        .update({ deleted_at: new Date().toISOString(), is_active: false, status: 'rejected' })
        .eq('id', id);
      await reversePoints(id, couple.id, user.id);
      setSentDice(null);
      await checkStates();
    });
  };

  const onPressIn = () => {
    if (rolling) return;
    if (result) {
      setResult(null);
      setFace(5);
      sentOpacity.setValue(0);
      sentTranslate.setValue(10);
    }
    completedRef.current = false;
    setHolding(true);
    holdProgress.setValue(0);
    Animated.spring(holdScale, { toValue: 0.94, useNativeDriver: true, friction: 8 }).start();
    holdAnim.current = Animated.timing(holdProgress, { toValue: 1, duration: HOLD_DURATION, useNativeDriver: false });
    holdAnim.current.start(({ finished }) => {
      if (finished) {
        completedRef.current = true;
        holdProgress.setValue(0);
        Animated.spring(holdScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
        triggerRoll();
      }
    });
  };

  const onPressOut = () => {
    if (completedRef.current) return;
    setHolding(false);
    holdAnim.current?.stop();
    Animated.spring(holdScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    Animated.timing(holdProgress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const sentSubtitle = resultLabel === 'partner'
    ? 'Your partner rolled for you'
    : rolledForResult === 'partner'
      ? 'Rolled for your partner — waiting for them'
      : 'Just for you';

  const hintText = holding
    ? 'Keep holding…'
    : rolledFor === 'partner'
      ? 'Press & hold to roll for your partner'
      : 'Press & hold the dice to roll';

  return (
    <AppShell scrollable={false}>
      <TabHeader title="Dice" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!!(incomingChallenge || pendingVerification)}
        showsVerticalScrollIndicator={false}
      >
        {/* Incoming challenge card */}
        {incomingChallenge && (
          <View style={[styles.challengeSection, highlightChallenge && styles.challengeHighlight]}>
            <View style={[styles.pointsHint, { backgroundColor: 'rgba(255,179,71,0.08)', borderColor: 'rgba(255,179,71,0.25)' }]}>
              <AppText style={[styles.pointsHintText, { color: colors.textSecondary }]}>
                Accept = <AppText style={styles.pts}>+{acceptPts} ⚡</AppText> — Complete it = <AppText style={styles.pts}>+{completePts} ⚡</AppText>
              </AppText>
            </View>
            <ReceivedDiceChallengeCard
              text={incomingChallenge.content_text}
              status={incomingChallenge.status}
              expiresAt={incomingChallenge.expires_at}
              totalExpirySeconds={expirySeconds}
              onAccept={() => handleRespond(true)}
              onReject={() => handleRespond(false)}
              onComplete={handleDiceComplete}
              onTimeout={() => handleRespond(false)}
            />
          </View>
        )}

        {/* Pending verification */}
        {pendingVerification && (
          <View style={[styles.verifyCard, { backgroundColor: colors.card, borderColor: 'rgba(51,209,122,0.35)' }]}>
            <View style={styles.verifyHeader}>
              <CheckCircle color="#33D17A" size={20} strokeWidth={2} />
              <AppText style={[styles.verifyTitle, { color: colors.text }]}>Partner accepted your roll!</AppText>
            </View>
            {pendingVerification.content_text ? (
              <AppText style={[styles.verifyDareText, { color: colors.textSecondary }]}>
                "{pendingVerification.content_text}"
              </AppText>
            ) : null}
            <AppText style={[styles.verifySubtitle, { color: colors.textMuted }]}>
              When they complete it, confirm here — they earn <AppText style={[styles.pts, { color: '#33D17A' }]}>+{completePts} ⚡</AppText>
            </AppText>
            <TouchableOpacity
              style={styles.verifyBtn}
              onPress={handleVerifyComplete}
              disabled={verifying}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#33D17A', '#1A9E57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.verifyGrad}>
                <AppText style={styles.verifyBtnText}>{verifying ? 'Verifying…' : 'They Did It!'}</AppText>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Roll For toggle — only shown when a partner has joined */}
        {hasPartner && (
          <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            {(['self', 'partner'] as RolledFor[]).map((option) => {
              const active = rolledFor === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.toggleOption, active && styles.toggleOptionActive]}
                  onPress={() => { if (!rolling) setRolledFor(option); }}
                  activeOpacity={0.8}
                  disabled={rolling}
                >
                  {active && <View style={[StyleSheet.absoluteFill, styles.toggleActiveBg]} />}
                  <AppText style={[styles.toggleText, { color: active ? '#FFB347' : colors.textMuted }]}>
                    {option === 'self' ? 'For Me' : 'For My Partner'}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

          <View style={[styles.diceArea, { paddingTop: Spacing.md }]}>
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
                  <Circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} fill="none" />
                  <Circle
                    cx={ringSize / 2} cy={ringSize / 2} r={radius}
                    stroke="url(#ringGrad)" strokeWidth={STROKE} fill="none"
                    strokeDasharray={circumference} strokeDashoffset={ringOffset}
                    strokeLinecap="round" transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                  />
                </Svg>
              )}
              <Animated.View style={{ transform: [{ scale: holdScale }] }}>
                <TouchableOpacity
                activeOpacity={1}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={rolling}
                accessible
                accessibilityLabel="Hold to roll dice"
                accessibilityHint="Press and hold for 2 seconds to roll"
              >
                <View style={[styles.diceWrapper, { width: diceSize, height: diceSize }]}>
                  <NeonDice
                    ref={diceRef}
                    face={face}
                    size={diceSize}
                    challengeText={result}
                  />
                  {!result && !rolling && (
                    <View style={styles.hintOverlay} pointerEvents="none">
                      <AppText style={styles.hintText}>{hintText}</AppText>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Sent subtitle fades in below the die after a roll */}
          <Animated.View
            style={[styles.sentWrap, { opacity: sentOpacity, transform: [{ translateY: sentTranslate }] }]}
          >
            <AppText style={[styles.sent, { color: colors.textMuted }]}>{sentSubtitle}</AppText>
            {senderCountdown && rolledForResult === 'partner' && (
              <View style={styles.expiryRow}>
                <Timer color={colors.textMuted} size={12} strokeWidth={2} />
                <AppText style={[styles.expiryText, { color: colors.textMuted }]}>Expires in {senderCountdown}</AppText>
              </View>
            )}
            {/* Remove link for self-rolls */}
            {result && rolledForResult === 'self' && lastSelfRollId.current && (
              <TouchableOpacity onPress={handleDeleteSelfRoll} activeOpacity={0.7} style={styles.deleteLink}>
                <AppText style={[styles.deleteLinkText, { color: colors.textMuted }]}>Remove</AppText>
              </TouchableOpacity>
            )}
            {/* Cancel link for pending partner rolls */}
            {rolledForResult === 'partner' && sentDice && (
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
              <AppText style={[styles.soloNoticeText, { color: colors.textMuted }]}>
                Rolling for a partner requires{' '}
                <AppText style={[styles.soloNoticeLink, { color: '#FFB347' }]}>pairing up first</AppText>
              </AppText>
            </TouchableOpacity>
          )}

          {hasPartner && promptsLoaded && hasCustomPrompts === 'no' && (
            <CustomizePromptsNotice
              onPress={() => router.push('/(app)/customize-prompts?tab=dice')}
              accentColor="#FFB347"
            />
          )}

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,95,0.08)', borderColor: 'rgba(255,90,95,0.25)' }]}>
              <AppText style={{ color: colors.danger, fontSize: FontSize.sm, fontFamily: 'Inter-Medium', textAlign: 'center' }}>{error}</AppText>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.screen, paddingBottom: Spacing.xl },
  challengeSection: { gap: Spacing.sm, marginBottom: Spacing.sm },
  challengeHighlight: { borderRadius: Radius.lg, borderWidth: 2, borderColor: 'rgba(255,179,71,0.50)', padding: Spacing.sm, backgroundColor: 'rgba(255,179,71,0.07)' },
  pointsHint: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, alignItems: 'center' },
  pointsHintText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  pts: { fontFamily: 'Inter-Bold', color: '#33D17A' },
  verifyCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, gap: Spacing.sm, marginBottom: Spacing.md },
  verifyHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  verifyTitle: { fontSize: FontSize.body, fontFamily: 'Inter-Bold', flex: 1 },
  verifyDareText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', fontStyle: 'italic', lineHeight: 20 },
  verifySubtitle: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
  verifyBtn: { borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.xs },
  verifyGrad: { height: 50, alignItems: 'center', justifyContent: 'center' },
  verifyBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Bold' },
  toggleRow: { flexDirection: 'row', borderRadius: Radius.pill, borderWidth: 1, padding: 3, marginTop: Spacing.md, marginBottom: Spacing.lg },
  toggleOption: { flex: 1, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  toggleOptionActive: {},
  toggleActiveBg: { backgroundColor: 'rgba(255,179,71,0.15)', borderRadius: Radius.pill },
  toggleText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', letterSpacing: 0.2 },
  diceArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  diceContainer: { alignItems: 'center', justifyContent: 'center' },
  diceWrapper: { alignItems: 'center', justifyContent: 'center' },
  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    textAlign: 'center',
  },
  sentWrap: { alignItems: 'center', gap: 4 },
  sent: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', letterSpacing: 0.3 },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expiryText: { fontSize: 11, fontFamily: 'Inter-Regular' },
  deleteLink: { marginTop: 2, paddingVertical: 4, paddingHorizontal: 8 },
  deleteLinkText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textDecorationLine: 'underline', opacity: 0.6 },
  errorBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, width: '100%' },
  soloNotice: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.xs },
  soloNoticeText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', letterSpacing: 0.2 },
  soloNoticeLink: { fontFamily: 'Inter-Medium' },
});
