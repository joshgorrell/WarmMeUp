import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Animated, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, CircleCheck as CheckCircle, RotateCcw, Timer, Eye, CircleX as XCircle } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, deactivatePreviousEphemeral, getPointValue, verifyCompletion, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { Interaction } from '@/lib/types';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import WarmTextInput from '@/components/WarmTextInput';
import PromptChip from '@/components/PromptChip';
import AppShell from '@/components/AppShell';
import ReceivedDareCard from '@/components/ReceivedDareCard';
import CustomizePromptsNotice from '@/components/CustomizePromptsNotice';
import TabHeader from '@/components/TabHeader';
import { FontSize, Spacing, Radius } from '@/constants/theme';

function useSenderCountdown(expiresAt: string | null | undefined): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
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

const FALLBACK_DARES = [
  'Say what you want without explaining it',
  'Send me a look',
  "Tell me exactly what you're thinking",
  'Make me laugh right now',
  "Give me a compliment I'll remember",
  'Ask me anything',
  'Pick the next move',
  'Tell me what happens next',
  'Surprise me',
  'Your choice',
];

export default function DareTab() {
  const router = useRouter();
  const { dare_id: deepLinkDareId } = useLocalSearchParams<{ dare_id?: string }>();
  const { user, couple, partnerProfile, settings } = useAuth();
  const { colors } = useTheme();
  const hasPartner = !!couple?.user_b_id;
  const expiryHours = settings?.challenge_expiry_hours ?? 24;
  const expirySeconds = expiryHours * 3600;
  const [quickDares, setQuickDares] = useState<string[]>(FALLBACK_DARES);
  const [hasCustomPrompts, setHasCustomPrompts] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [dareText, setDareText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [incomingDare, setIncomingDare] = useState<Interaction | null>(null);
  const [pendingVerification, setPendingVerification] = useState<Interaction | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [acceptPts, setAcceptPts] = useState(5);
  const [completePts, setCompletePts] = useState(25);

  // Sender dare: track expires_at of the dare I sent so I can show countdown
  const [sentDare, setSentDare] = useState<Interaction | null>(null);
  const [rejectedDare, setRejectedDare] = useState<Interaction | null>(null);
  const senderCountdown = useSenderCountdown(sentDare?.expires_at);
  const [highlightDare, setHighlightDare] = useState(false);
  const handledDareLinkRef = useRef<string | null>(null);

  // Flip animation for sender verification card
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    Promise.all([getPointValue('dare_accept'), getPointValue('dare_complete')]).then(([a, c]) => {
      setAcceptPts(a);
      setCompletePts(c);
    });
  }, []);

  useEffect(() => {
    const coupleId = couple?.id;
    const query = supabase.from('dare_prompts').select('id, text, is_default, couple_id').eq('is_active', true);
    const baseQuery = coupleId
      ? query.or(`is_default.eq.true,couple_id.eq.${coupleId}`)
      : query.eq('is_default', true);

    (async () => {
      try {
        const [promptsResult, hiddenResult] = await Promise.all([
          baseQuery,
          coupleId
            ? supabase.from('couple_hidden_prompts').select('prompt_id').eq('couple_id', coupleId).eq('prompt_table', 'dare_prompts')
            : Promise.resolve({ data: [] }),
        ]);
        if (!promptsResult.data?.length) return;
        const hiddenIds = new Set((hiddenResult.data ?? []).map((r: { prompt_id: string }) => r.prompt_id));
        const visible = promptsResult.data.filter((d: { id: string; is_default: boolean }) => !d.is_default || !hiddenIds.has(d.id));
        if (visible.length > 0) setQuickDares(visible.map((d: { text: string }) => d.text));
        const hasCustom = promptsResult.data.some((d: { is_default: boolean; couple_id?: string }) => !d.is_default && d.couple_id === coupleId);
        setHasCustomPrompts(hasCustom ? 'yes' : 'no');
      } finally {
        setPromptsLoaded(true);
      }
    })();
  }, [couple?.id]);

  useEffect(() => {
    if (!couple?.id || !user) return;
    checkStates();
    const ch = supabase.channel(`dare_tab_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, checkStates)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, user]);

  // Deep-link: when dare_id param arrives, check if it matches the active dare
  useEffect(() => {
    if (!deepLinkDareId || !couple?.id) return;
    if (handledDareLinkRef.current === deepLinkDareId) return;
    handledDareLinkRef.current = deepLinkDareId;
    (async () => {
      const { data: dare } = await supabase
        .from('interactions')
        .select('id, status')
        .eq('id', deepLinkDareId)
        .maybeSingle();
      if (!dare) {
        Alert.alert('Dare not found', 'This dare could not be found.');
        return;
      }
      if (dare.status === 'sent' &&
        (incomingDare?.id === deepLinkDareId || pendingVerification?.id === deepLinkDareId)) {
        setHighlightDare(true);
        setTimeout(() => setHighlightDare(false), 2000);
      } else if (!['sent', 'accepted', 'pending_verification'].includes(dare.status)) {
        Alert.alert('Dare no longer active', 'This dare has already been completed or has expired.');
      }
    })();
  }, [deepLinkDareId]);

  const checkStates = useCallback(async () => {
    if (!couple?.id || !user) return;

    // Incoming dare for me — pending, accepted, or self-reported pending_verification
    const { data: incoming } = await supabase.from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('receiver_id', user.id)
      .eq('type', 'dare')
      .in('status', ['sent', 'seen', 'accepted', 'pending_verification'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (incoming && incoming.expires_at && new Date(incoming.expires_at) <= new Date()) {
      // Auto-reject expired incoming dare silently
      await supabase.from('interactions').update({ status: 'rejected', is_active: false }).eq('id', incoming.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dares_skipped', 0);
      setIncomingDare(null);
    } else {
      setIncomingDare(incoming);
      // Mark as seen the first time the receiver views it
      if (incoming && incoming.status === 'sent') {
        supabase.from('interactions').update({ status: 'seen' }).eq('id', incoming.id).eq('status', 'sent').then(() => {
          setIncomingDare(prev => prev ? { ...prev, status: 'seen' } : prev);
        });
      }
    }

    // Dare I sent that partner self-reported done — waiting for my confirmation
    const { data: pending } = await supabase.from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('sender_id', user.id)
      .eq('type', 'dare')
      .eq('status', 'pending_verification')
      .is('completed_at', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setPendingVerification(pending);

    // Track the dare I sent that is still open (for sender-side countdown)
    // Include 'seen' so the sender can see the "viewed" indicator
    const { data: mySent } = await supabase.from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('sender_id', user.id)
      .eq('type', 'dare')
      .in('status', ['sent', 'seen'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setSentDare(mySent ?? null);

    // Check for a recently rejected dare to show the decline reason
    const { data: rejected } = await supabase.from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('sender_id', user.id)
      .eq('type', 'dare')
      .eq('status', 'rejected')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRejectedDare(rejected ?? null);
  }, [couple?.id, user]);

  const handleSend = async () => {
    if (!couple?.id || !user || !dareText.trim()) return;
    setSending(true);
    setError('');
    try {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      const receiverId = partnerId ?? user.id;
      await deactivatePreviousEphemeral(couple.id, user.id);
      const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();
      const { error: insertError } = await supabase.from('interactions').insert({
        couple_id: couple.id,
        type: 'dare',
        sender_id: user.id,
        receiver_id: receiverId,
        content_text: dareText.trim(),
        status: 'sent',
        is_active: true,
        expires_at: expiresAt,
      });
      if (insertError) throw insertError;
      if (partnerId) notifyPartner({ event_type: 'new_dare', couple_id: couple.id, target_route: '/(app)/(tabs)/dare', partnerUserId: partnerProfile?.id });
      setSent(true);
      await checkStates();
    } catch {
      setError('Failed to send dare. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleRespond = async (accepted: boolean, declineReason?: string) => {
    if (!incomingDare || !couple?.id || !user) return;
    const status = accepted ? 'accepted' : 'rejected';
    const update: Record<string, unknown> = { status, is_active: false };
    if (!accepted && declineReason) update.decline_reason = declineReason;
    await supabase.from('interactions').update(update).eq('id', incomingDare.id);
    const eventType = accepted ? 'dare_accepted' : 'dare_rejected';
    notifyPartner({ event_type: eventType, couple_id: couple.id, target_route: '/(app)/(tabs)/dare', partnerUserId: partnerProfile?.id });
    if (accepted) {
      const pts = await getPointValue('dare_accept');
      await awardPoints(couple.id, user.id, pts, 'Dare accepted', incomingDare.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dares_accepted', pts);
      setIncomingDare({ ...incomingDare, status: 'accepted' });
    } else {
      await incrementMonthlyCounter(couple.id, user.id, 'dares_skipped', 0);
      setIncomingDare(null);
    }
  };

  const handleMarkComplete = async () => {
    if (!incomingDare || !couple?.id || !user) return;
    await supabase.from('interactions').update({
      status: 'pending_verification',
      completion_requested_at: new Date().toISOString(),
      is_active: false,
    }).eq('id', incomingDare.id);
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
        'dare_complete'
      );
      await incrementMonthlyCounter(couple.id, pendingVerification.receiver_id, 'dares_completed', completePts);
      notifyPartner({ event_type: 'dare_completed', couple_id: couple.id, target_route: '/(app)/(tabs)/dare', partnerUserId: partnerProfile?.id });
      setPendingVerification(null);
    } catch {
      setError('Could not verify. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCancelDare = () => {
    if (!sentDare) return;
    const doCancel = async () => {
      const { error: updateError } = await supabase
        .from('interactions')
        .update({ status: 'cancelled', is_active: false })
        .eq('id', sentDare.id)
        .eq('sender_id', user!.id);
      if (updateError) {
        setError('Could not cancel the dare. Please try again.');
        return;
      }
      setSent(false);
      setSentDare(null);
      setDareText('');
      setError('');
    };

    if (Platform.OS === 'web') {
      if (window.confirm("Cancel this dare? Your partner won't see it anymore.")) doCancel();
    } else {
      Alert.alert(
        'Cancel dare?',
        "Your partner won't see it anymore.",
        [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Yes, cancel', style: 'destructive', onPress: doCancel },
        ]
      );
    }
  };

  const handleFlip = () => {
    const toValue = flipped ? 0 : 1;
    Animated.spring(flipAnim, { toValue, useNativeDriver: true, friction: 8, tension: 60 }).start();
    setFlipped(!flipped);
  };

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppShell scrollable={false}>
        <TabHeader title="Send a Dare" />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.iconWrap}>
            <Flame color="#FF2E8A" size={44} strokeWidth={2} fill="rgba(255,46,138,0.12)" />
          </View>

          {/* Incoming dare from partner */}
          {incomingDare && (
            <View style={[styles.incomingSection, highlightDare && styles.incomingHighlight]}>
              <View style={[styles.pointsHint, { backgroundColor: 'rgba(255,46,138,0.08)', borderColor: 'rgba(255,46,138,0.25)' }]}>
                <AppText style={[styles.pointsHintText, { color: colors.textSecondary }]}>
                  Accept = <AppText style={styles.pts}>+{acceptPts} ⚡</AppText> — Complete it = <AppText style={styles.pts}>+{completePts} ⚡</AppText>
                </AppText>
              </View>
              <ReceivedDareCard
                text={incomingDare.content_text}
                status={incomingDare.status}
                expiresAt={incomingDare.expires_at}
                totalExpirySeconds={expirySeconds}
                coupleId={couple?.id}
                onAccept={() => handleRespond(true)}
                onReject={(reason) => handleRespond(false, reason)}
                onComplete={handleMarkComplete}
                onTimeout={() => handleRespond(false)}
              />
            </View>
          )}

          {/* Flippable sender verification card */}
          {pendingVerification && (
            <View style={styles.flipContainer}>
              {/* Front face — confirm */}
              <Animated.View
                style={[
                  styles.verifyCard,
                  { backgroundColor: colors.card, borderColor: 'rgba(51,209,122,0.35)', opacity: frontOpacity },
                  { transform: [{ rotateY: frontRotate }] },
                ]}
              >
                <View style={styles.verifyHeader}>
                  <CheckCircle color="#33D17A" size={20} strokeWidth={2} />
                  <AppText style={[styles.verifyTitle, { color: colors.text }]}>Partner completed the dare!</AppText>
                </View>
                <AppText style={[styles.verifySubtitle, { color: colors.textMuted }]}>
                  Confirm to award them <AppText style={[styles.pts, { color: '#33D17A' }]}>+{completePts} ⚡</AppText>
                </AppText>
                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={handleVerifyComplete}
                  disabled={verifying}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#33D17A', '#1A9E57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.verifyGrad}>
                    <AppText style={styles.verifyBtnText}>{verifying ? 'Confirming…' : 'They Did It!'}</AppText>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleFlip} style={styles.flipToggle} activeOpacity={0.7}>
                  <RotateCcw color={colors.textMuted} size={13} strokeWidth={2} />
                  <AppText style={[styles.flipToggleText, { color: colors.textMuted }]}>See the dare</AppText>
                </TouchableOpacity>
              </Animated.View>

              {/* Back face — dare text */}
              <Animated.View
                style={[
                  styles.verifyCard,
                  styles.verifyCardBack,
                  { backgroundColor: colors.card, borderColor: 'rgba(255,46,138,0.30)', opacity: backOpacity },
                  { transform: [{ rotateY: backRotate }] },
                ]}
              >
                <AppText style={[styles.backLabel, { color: colors.textMuted }]}>THE DARE YOU SENT</AppText>
                <AppText style={[styles.backDareText, { color: colors.text }]}>
                  "{pendingVerification.content_text ?? 'No text recorded'}"
                </AppText>
                <TouchableOpacity onPress={handleFlip} style={styles.flipToggle} activeOpacity={0.7}>
                  <RotateCcw color={colors.textMuted} size={13} strokeWidth={2} />
                  <AppText style={[styles.flipToggleText, { color: colors.textMuted }]}>Back to confirm</AppText>
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}

          {!hasPartner ? (
            <View style={[styles.soloPlaceholder, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <Flame color="#FF2E8A" size={36} fill="rgba(255,46,138,0.12)" strokeWidth={1.5} />
              <AppText style={[styles.soloTitle, { color: colors.text }]}>Dares are more fun with two</AppText>
              <AppText style={[styles.soloSub, { color: colors.textSecondary }]}>
                Invite your partner and start sending dares back and forth.
              </AppText>
              <TouchableOpacity
                onPress={() => router.push('/(app)/account')}
                style={styles.soloBtn}
                activeOpacity={0.8}
              >
                <AppText style={styles.soloBtnText}>Invite Partner</AppText>
              </TouchableOpacity>
            </View>
          ) : !sent && (
            <>
              {error ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,95,0.08)', borderColor: 'rgba(255,90,95,0.25)' }]}>
                  <AppText style={{ color: '#FF5A5F', fontSize: 13, fontFamily: 'Inter-Medium', textAlign: 'center' }}>{error}</AppText>
                </View>
              ) : null}

              <WarmTextInput
                value={dareText}
                onChangeText={setDareText}
                placeholder="Type your dare…"
                multiline
                minHeight={100}
                charLimit={200}
                containerStyle={{ marginBottom: Spacing.md }}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickRow}>
                {quickDares.map(d => (
                  <PromptChip key={d} label={d} active={dareText === d} onPress={() => setDareText(d)} style={{ marginRight: 8 }} />
                ))}
              </ScrollView>

              <PrimaryButton
                label="Send Dare"
                onPress={handleSend}
                loading={sending}
                disabled={!dareText.trim()}
                style={{ marginTop: Spacing.lg }}
              />
            </>
          )}

          {hasPartner && promptsLoaded && hasCustomPrompts === 'no' && (
            <CustomizePromptsNotice
              onPress={() => router.push('/(app)/customize-prompts?tab=dare')}
              accentColor="#FF2E8A"
            />
          )}

          {sent && sentDare && (
            <View style={[styles.sentCard, { backgroundColor: colors.card, borderColor: 'rgba(51,209,122,0.25)' }]}>
              <Flame color="#FF2E8A" size={48} fill="rgba(255,46,138,0.15)" strokeWidth={1.5} />
              <AppText style={[styles.sentTitle, { color: colors.text }]}>Dare sent!</AppText>
              {sentDare.status === 'seen' ? (
                <View style={styles.seenRow}>
                  <Eye color="#FFB347" size={14} strokeWidth={2} />
                  <AppText style={[styles.seenText, { color: '#FFB347' }]}>Your partner has seen this dare</AppText>
                </View>
              ) : (
                <AppText style={[styles.sentSub, { color: colors.textSecondary }]}>Waiting to see if they're up for it.</AppText>
              )}
              {senderCountdown && (
                <View style={styles.expiryRow}>
                  <Timer color={colors.textMuted} size={13} strokeWidth={2} />
                  <AppText style={[styles.expiryText, { color: colors.textMuted }]}>Expires in {senderCountdown}</AppText>
                </View>
              )}
              <SecondaryButton label="Send Another" onPress={() => { setSent(false); setDareText(''); setError(''); }} style={{ marginTop: Spacing.md }} />
              <TouchableOpacity onPress={handleCancelDare} style={styles.cancelDareBtn} activeOpacity={0.7}>
                <AppText style={[styles.cancelDareBtnText, { color: colors.textMuted }]}>Cancel dare</AppText>
              </TouchableOpacity>
            </View>
          )}

          {sent && !sentDare && rejectedDare && (
            <View style={[styles.sentCard, { backgroundColor: colors.card, borderColor: 'rgba(255,90,95,0.25)' }]}>
              <XCircle color="#FF5A5F" size={40} strokeWidth={1.5} />
              <AppText style={[styles.sentTitle, { color: colors.text }]}>Dare declined</AppText>
              <AppText style={[styles.sentSub, { color: colors.textSecondary }]}>
                {rejectedDare.decline_reason ?? 'Your partner declined this dare.'}
              </AppText>
              <SecondaryButton label="Send Another" onPress={() => { setSent(false); setDareText(''); setError(''); setRejectedDare(null); }} style={{ marginTop: Spacing.md }} />
            </View>
          )}
        </ScrollView>
      </AppShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 60 },
  iconWrap: { alignItems: 'center', marginBottom: Spacing.md },
  soloPlaceholder: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  soloTitle: { fontSize: FontSize.md, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  soloSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  soloBtn: {
    marginTop: Spacing.sm,
    backgroundColor: '#FF2E8A',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  soloBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  incomingSection: { gap: Spacing.sm, marginBottom: Spacing.md },
  incomingHighlight: { borderRadius: Radius.lg, borderWidth: 2, borderColor: 'rgba(255,179,71,0.50)', padding: Spacing.sm, backgroundColor: 'rgba(255,179,71,0.07)' },
  pointsHint: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, alignItems: 'center' },
  pointsHintText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  pts: { fontFamily: 'Inter-Bold', color: '#33D17A' },
  flipContainer: { marginBottom: Spacing.lg, position: 'relative' },
  verifyCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    gap: Spacing.sm,
    backfaceVisibility: 'hidden',
  },
  verifyCardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  verifyHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  verifyTitle: { fontSize: FontSize.body, fontFamily: 'Inter-Bold', flex: 1 },
  verifySubtitle: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20 },
  verifyBtn: { borderRadius: Radius.pill, overflow: 'hidden', marginTop: Spacing.xs },
  verifyGrad: { height: 50, alignItems: 'center', justifyContent: 'center' },
  verifyBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Bold' },
  flipToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', paddingTop: 4 },
  flipToggleText: { fontSize: 12, fontFamily: 'Inter-Regular' },
  backLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  backDareText: { fontSize: FontSize.lg, fontFamily: 'Inter-SemiBold', lineHeight: 28, fontStyle: 'italic' },
  quickRow: { marginBottom: Spacing.md },
  sentCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: 8 },
  sentTitle: { fontSize: FontSize.xl, fontFamily: 'Inter-Bold' },
  sentSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center' },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  expiryText: { fontSize: 12, fontFamily: 'Inter-Regular' },
  errorBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  cancelDareBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginTop: Spacing.xs },
  cancelDareBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center' },
  seenRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  seenText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
});
