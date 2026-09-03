import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Flame,
  CircleCheck as CheckCircle,
  Timer,
  Eye,
  EyeOff,
  CircleX as XCircle,
} from 'lucide-react-native';
import AppText from '@/components/AppText';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import WarmTextInput from '@/components/WarmTextInput';
import SecondaryButton from '@/components/SecondaryButton';
import ReceivedDareCard from '@/components/ReceivedDareCard';
import CustomizePromptsNotice from '@/components/CustomizePromptsNotice';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import {
  awardPoints,
  getPointValue,
  incrementMonthlyCounter,
  isPointsEnabled,
} from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { Interaction } from '@/lib/types';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useCustomPromptNotice } from '@/hooks/useCustomPromptNotice';

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

export default function DareTab() {
  const router = useRouter();
  const { dare_id: deepLinkDareId } = useLocalSearchParams<{ dare_id?: string }>();
  const { user, couple, partnerProfile } = useAuth();
  const { colors } = useTheme();

  const hasPartner = !!couple?.user_b_id;
  const partnerName = partnerProfile?.first_name?.trim() || partnerProfile?.display_name?.trim().split(/\s+/)[0] || 'your partner';
  const customPromptState = useCustomPromptNotice(couple?.id, 'dare_prompts');

  const TIMER_PRESETS = [
    { label: '15m', seconds: 15 * 60 },
    { label: '30m', seconds: 30 * 60 },
    { label: '1h', seconds: 60 * 60 },
    { label: '3h', seconds: 3 * 60 * 60 },
    { label: '6h', seconds: 6 * 60 * 60 },
    { label: '24h', seconds: 24 * 60 * 60 },
  ];
  const [dareText, setDareText] = useState('');
  const [selectedTimerSeconds, setSelectedTimerSeconds] = useState(30 * 60);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [incomingDare, setIncomingDare] = useState<Interaction | null>(null);

  const incomingTotalExpirySeconds = (() => {
    if (!incomingDare?.expires_at || !incomingDare?.created_at) return 86400;
    const diff = Math.round((new Date(incomingDare.expires_at).getTime() - new Date(incomingDare.created_at).getTime()) / 1000);
    return diff > 0 ? diff : 86400;
  })();
  const [sentDare, setSentDare] = useState<Interaction | null>(null);
  const [recentDares, setRecentDares] = useState<Interaction[]>([]);
  const [acceptPts, setAcceptPts] = useState(30);
  const [highlightDare, setHighlightDare] = useState(false);
  const handledDareLinkRef = useRef<string | null>(null);

  const senderCountdown = useSenderCountdown(sentDare?.expires_at);

  useEffect(() => {
    getPointValue('dare_accept').then(a => setAcceptPts(a));
  }, []);

  const checkStates = useCallback(async () => {
    if (!couple?.id || !user) return;

    await supabase.rpc('expire_overdue_dares');

    const { data: incoming } = await supabase
      .from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('receiver_id', user.id)
      .eq('type', 'dare')
      .in('status', ['sent', 'seen'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (incoming && incoming.expires_at && new Date(incoming.expires_at) <= new Date()) {
      await supabase.from('interactions').update({ status: 'expired', is_active: false }).eq('id', incoming.id);
      setIncomingDare(null);
    } else {
      setIncomingDare(incoming ?? null);
      if (incoming && incoming.status === 'sent') {
        supabase
          .from('interactions')
          .update({ status: 'seen' })
          .eq('id', incoming.id)
          .eq('status', 'sent')
          .then(() => setIncomingDare(prev => (prev ? { ...prev, status: 'seen' } : prev)));
      }
    }

    const { data: mySent } = await supabase
      .from('interactions')
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

    const { data: history } = await supabase
      .from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('type', 'dare')
      .in('status', ['accepted', 'completed', 'rejected', 'cancelled', 'expired'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    setRecentDares(history ?? []);
  }, [couple?.id, user]);

  useEffect(() => {
    if (!couple?.id || !user) return;
    checkStates();
    const ch = supabase
      .channel(`dare_tab_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, checkStates)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, user, checkStates]);

  useEffect(() => {
    if (!deepLinkDareId || !couple?.id || handledDareLinkRef.current === deepLinkDareId) return;
    (async () => {
      const { data: dare } = await supabase.from('interactions').select('id, status').eq('id', deepLinkDareId).maybeSingle();
      if (!dare) {
        handledDareLinkRef.current = deepLinkDareId;
        Alert.alert('Dare not found', 'This dare could not be found.');
        return;
      }
      const activeStatuses = ['sent', 'seen'];
      const isLoaded = incomingDare?.id === deepLinkDareId;
      if (activeStatuses.includes(dare.status) && isLoaded) {
        handledDareLinkRef.current = deepLinkDareId;
        setHighlightDare(true);
        setTimeout(() => setHighlightDare(false), 2000);
      } else if (!activeStatuses.includes(dare.status)) {
        handledDareLinkRef.current = deepLinkDareId;
      }
    })();
  }, [deepLinkDareId, couple?.id, incomingDare?.id]);

  const handleSend = async () => {
    if (!couple?.id || !user || !dareText.trim()) return;
    setSending(true);
    setError('');
    try {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      const { error: rpcError } = await supabase.rpc('create_dare', {
        p_couple_id: couple.id,
        p_content_text: dareText.trim(),
        p_duration_seconds: selectedTimerSeconds,
      });
      if (rpcError) throw rpcError;
      if (partnerId) notifyPartner({ event_type: 'new_dare', couple_id: couple.id, target_route: '/(app)/(tabs)/dare', partnerUserId: partnerProfile?.id });
      setDareText('');
      await checkStates();
    } catch {
      setError('Failed to send dare. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleRespond = async (accepted: boolean, declineReason?: string) => {
    if (!incomingDare || !couple?.id || !user) return;
    if (accepted) {
      const nowIso = new Date().toISOString();
      await supabase.from('interactions').update({
        status: 'accepted',
        is_active: false,
        completed_at: nowIso,
      }).eq('id', incomingDare.id);
      notifyPartner({ event_type: 'dare_accepted', couple_id: couple.id, target_route: '/(app)/(tabs)/dare', partnerUserId: partnerProfile?.id });
      const ptsEnabled = await isPointsEnabled(couple.id);
      if (ptsEnabled) {
        const pts = await getPointValue('dare_accept');
        await awardPoints(couple.id, user.id, pts, 'Dare accepted', incomingDare.id);
        await incrementMonthlyCounter(couple.id, user.id, 'dares_accepted', pts);
      }
      setIncomingDare(null);
    } else {
      const update: Record<string, unknown> = { status: 'rejected', is_active: false };
      if (declineReason) update.decline_reason = declineReason;
      await supabase.from('interactions').update(update).eq('id', incomingDare.id);
      notifyPartner({ event_type: 'dare_rejected', couple_id: couple.id, target_route: '/(app)/(tabs)/dare', partnerUserId: partnerProfile?.id });
      const ptsEnabled = await isPointsEnabled(couple.id);
      if (ptsEnabled) {
        await incrementMonthlyCounter(couple.id, user.id, 'dares_skipped', 0);
      }
      if (declineReason) {
        const { data: activityMsg } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('couple_id', couple.id)
          .eq('sender_id', incomingDare.sender_id)
          .is('deleted_at', null)
          .like('content_text', `__WMU_ACTIVITY__:%${incomingDare.id}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        await supabase.from('chat_messages').insert({ couple_id: couple.id, sender_id: user.id, content_text: declineReason, reply_to: activityMsg?.id ?? null });
      }
      setIncomingDare(null);
    }
    await checkStates();
  };

  const handleCancelDare = () => {
    if (!sentDare || !user) return;
    const doCancel = async () => {
      const { error: updateError } = await supabase.from('interactions').update({ status: 'cancelled', is_active: false }).eq('id', sentDare.id).eq('sender_id', user.id);
      if (updateError) return setError('Could not cancel the dare. Please try again.');
      await checkStates();
    };
    if (Platform.OS === 'web') {
      if (window.confirm("Cancel this dare? Your partner won't see it anymore.")) doCancel();
    } else {
      Alert.alert('Cancel dare?', "Your partner won't see it anymore.", [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: doCancel },
      ]);
    }
  };

  const renderHistoryRow = (dare: Interaction) => {
    const isMine = dare.sender_id === user?.id;
    const accepted = dare.status === 'accepted';
    const completed = dare.status === 'completed';
    const declined = dare.status === 'rejected';
    const expired = dare.status === 'expired';
    const title = accepted ? 'Accepted' : completed ? 'Completed' : declined ? 'Declined' : expired ? 'Expired' : 'Cancelled';
    const relationship = isMine ? `You dared ${partnerName}` : `${partnerName} dared you`;
    const dateValue = dare.completed_at ?? dare.created_at;
    const isPositive = accepted || completed;
    return (
      <View key={dare.id} style={[styles.historyRow, { borderBottomColor: colors.borderSubtle }]}>
        <View style={[styles.historyIcon, { borderColor: isPositive ? '#33D17A' : declined ? '#FF5A5F' : colors.textMuted }]}>
          {isPositive ? <CheckCircle color="#33D17A" size={18} strokeWidth={2.2} /> : <XCircle color={declined ? '#FF5A5F' : colors.textMuted} size={18} strokeWidth={2.2} />}
        </View>
        <View style={styles.historyMain}>
          <AppText style={[styles.historyTitle, { color: colors.text }]}>{title} <AppText style={[styles.historyRelationship, { color: colors.textMuted }]}>· {relationship}</AppText></AppText>
          <AppText numberOfLines={2} style={[styles.historyText, { color: colors.textSecondary }]}>“{dare.content_text}”</AppText>
          {declined && dare.decline_reason ? (
            <AppText style={[styles.declineReasonText, { color: colors.textSecondary }]}>
              {isMine ? `${partnerName} said:` : 'You said:'} {dare.decline_reason}
            </AppText>
          ) : null}
        </View>
        <View style={styles.historyMeta}>
          <AppText style={[styles.historyDate, { color: colors.textMuted }]}>{formatDate(dateValue)}</AppText>
          {(couple?.points_enabled ?? true) && (
            <AppText style={[styles.historyPoints, { color: isPositive ? '#33D17A' : colors.textMuted }]}>{isPositive ? `+${acceptPts} pts` : '0 pts'}</AppText>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppShell scrollable={false} constrainContent>
        <TabHeader title="Dare" />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {incomingDare && (
            <View style={[styles.incomingSection, highlightDare && styles.incomingHighlight]}>
              {(couple?.points_enabled ?? true) && (
                <View style={[styles.pointsHint, { backgroundColor: 'rgba(255,46,138,0.08)', borderColor: 'rgba(255,46,138,0.25)' }]}>
                  <AppText style={[styles.pointsHintText, { color: colors.textSecondary }]}>Accept = <AppText style={styles.pts}>+{acceptPts} ⚡</AppText></AppText>
                </View>
              )}
              <ReceivedDareCard text={incomingDare.content_text} status={incomingDare.status} expiresAt={incomingDare.expires_at} totalExpirySeconds={incomingTotalExpirySeconds} coupleId={couple?.id} onAccept={() => handleRespond(true)} onReject={reason => handleRespond(false, reason)} onTimeout={checkStates} />
            </View>
          )}

          {!hasPartner ? (
            <View style={[styles.soloPlaceholder, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}> 
              <Flame color="#FF2E8A" size={42} fill="rgba(255,46,138,0.12)" strokeWidth={1.5} />
              <AppText style={[styles.soloTitle, { color: colors.text }]}>Dares are more fun with two</AppText>
              <AppText style={[styles.soloSub, { color: colors.textSecondary }]}>Invite your partner and start challenging each other.</AppText>
              <TouchableOpacity onPress={() => router.push('/(app)/account')} style={styles.soloBtn} activeOpacity={0.8}><AppText style={styles.soloBtnText}>Invite Partner</AppText></TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.dareHero}>
                <View style={styles.heroTitleRow}><View style={styles.heroFlameBadge}><Flame color="#FF2E8A" size={27} strokeWidth={2.4} fill="rgba(255,46,138,0.15)" /></View><AppText style={styles.heroTitle}><AppText style={styles.heroTitleWarm}>I DARE </AppText><AppText style={styles.heroTitleHot}>YOU...</AppText></AppText></View>
                <AppText style={[styles.heroSubtitle, { color: colors.textSecondary }]}>What do you dare <AppText style={styles.partnerAccent}>{partnerName}</AppText> to do?</AppText>
              </View>

              {customPromptState === 'no' && (
                <CustomizePromptsNotice feature="dare" onPress={() => router.push('/(app)/customize-prompts?tab=dare')} accentColor="#FF2E8A" />
              )}

              {error ? <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,95,0.08)', borderColor: 'rgba(255,90,95,0.25)' }]}><AppText style={styles.errorText}>{error}</AppText></View> : null}

              {!sentDare ? (
                <View style={[styles.composerCard, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}> 
                  <View style={styles.composerGlow} />
                  <WarmTextInput value={dareText} onChangeText={setDareText} placeholder="Type your dare…" multiline minHeight={96} charLimit={200} containerStyle={styles.dareInput} />
                  <View style={styles.timerRow}>
                    <View style={styles.timerLabelRow}><Timer color={colors.textSecondary} size={14} strokeWidth={2} /><AppText style={[styles.timerLabelText, { color: colors.textSecondary }]}>Timer</AppText></View>
                    <View style={styles.timerChips}>{TIMER_PRESETS.map(preset => { const active = selectedTimerSeconds === preset.seconds; return <TouchableOpacity key={preset.seconds} onPress={() => setSelectedTimerSeconds(preset.seconds)} activeOpacity={0.7} style={[styles.timerChip, { backgroundColor: active ? 'rgba(255,46,138,0.15)' : colors.card, borderColor: active ? 'rgba(255,46,138,0.45)' : colors.borderSubtle }]}><AppText style={[styles.timerChipText, { color: active ? '#FF2E8A' : colors.textSecondary }]}>{preset.label}</AppText></TouchableOpacity>; })}</View>
                  </View>
                  <TouchableOpacity onPress={handleSend} disabled={!dareText.trim() || sending} activeOpacity={0.85} style={styles.sendButtonWrap}><LinearGradient colors={dareText.trim() ? ['#FF8A28', '#FF395C', '#F41477'] : ['#5A3A2A', '#5B303D', '#552039']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sendButton}><Flame color={dareText.trim() ? '#FFFFFF' : 'rgba(255,255,255,0.38)'} size={21} fill={dareText.trim() ? 'rgba(255,255,255,0.18)' : 'transparent'} strokeWidth={2.2} /><AppText style={[styles.sendButtonText, !dareText.trim() && styles.sendButtonTextDisabled]}>{sending ? 'SENDING…' : `DARE ${partnerName.toUpperCase()}`}</AppText></LinearGradient></TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.openSentCard, { backgroundColor: colors.card, borderColor: 'rgba(255,46,138,0.30)' }]}> 
                  <View style={styles.openCardTopRow}><View style={[styles.statusIcon, { backgroundColor: 'rgba(255,46,138,0.14)' }]}><Flame color="#FF2E8A" size={20} strokeWidth={2} /></View><View style={styles.statusTextWrap}><AppText style={[styles.statusTitle, { color: colors.text }]}>Waiting on {partnerName}</AppText><AppText numberOfLines={2} style={[styles.openDareText, { color: colors.textSecondary }]}>“{sentDare.content_text}”</AppText></View></View>
                  <View style={styles.openMetaRow}>{sentDare.status === 'sent' ? <View style={styles.metaItem}><EyeOff color={colors.textMuted} size={14} strokeWidth={2} /><AppText style={[styles.metaText, { color: colors.textMuted }]}>Not seen yet</AppText></View> : <View style={styles.metaItem}><Eye color="#FFB347" size={14} strokeWidth={2} /><AppText style={[styles.metaText, { color: '#FFB347' }]}>Seen</AppText></View>}{senderCountdown && <View style={styles.metaItem}><Timer color={colors.textMuted} size={13} strokeWidth={2} /><AppText style={[styles.metaText, { color: colors.textMuted }]}>Expires in {senderCountdown}</AppText></View>}</View>
                  <SecondaryButton label={`Dare ${partnerName} Again`} onPress={() => setSentDare(null)} style={{ marginTop: Spacing.md }} />
                  <TouchableOpacity onPress={handleCancelDare} style={styles.cancelDareBtn} activeOpacity={0.7}><AppText style={[styles.cancelDareBtnText, { color: colors.textMuted }]}>Cancel dare</AppText></TouchableOpacity>
                </View>
              )}

              {recentDares.length > 0 && <View style={styles.previousSection}><View style={styles.previousHeader}><AppText style={[styles.sectionTitle, { color: colors.text }]}>Previous Dares</AppText>{recentDares.length >= 5 && <AppText style={styles.viewAllText}>Recent 5</AppText>}</View><View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>{recentDares.map(renderHistoryRow)}</View></View>}
            </>
          )}
        </ScrollView>
      </AppShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.screen, paddingBottom: Spacing.xl },
  incomingSection: { gap: Spacing.sm, marginBottom: Spacing.lg },
  incomingHighlight: { borderRadius: Radius.lg, borderWidth: 2, borderColor: 'rgba(255,179,71,0.50)', padding: Spacing.sm, backgroundColor: 'rgba(255,179,71,0.07)' },
  pointsHint: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.sm, alignItems: 'center' },
  pointsHintText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  pts: { fontFamily: 'Inter-Bold', color: '#33D17A' },
  soloPlaceholder: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  soloTitle: { fontSize: FontSize.md, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  soloSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  soloBtn: { marginTop: Spacing.sm, backgroundColor: '#FF2E8A', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  soloBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dareHero: { marginTop: 4, marginBottom: 18 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroFlameBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,46,138,0.08)', borderWidth: 1, borderColor: 'rgba(255,46,138,0.18)' },
  heroTitle: { flexShrink: 1, fontSize: 30, fontFamily: 'Inter-Bold', letterSpacing: -1 },
  heroTitleWarm: { color: '#FF8A28' },
  heroTitleHot: { color: '#FF2E8A' },
  heroSubtitle: { marginTop: 10, fontSize: FontSize.body, lineHeight: 24, fontFamily: 'Inter-Regular' },
  partnerAccent: { color: '#FF2E8A', fontFamily: 'Inter-SemiBold' },
  composerCard: { position: 'relative', overflow: 'hidden', borderRadius: 22, borderWidth: 1, padding: 16, shadowColor: '#FF2E8A', shadowOpacity: 0.10, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  composerGlow: { position: 'absolute', width: 175, height: 175, borderRadius: 88, right: -70, top: -100, backgroundColor: 'rgba(255,46,138,0.06)' },
  dareInput: { marginBottom: 14 },
  timerRow: { marginBottom: 14 },
  timerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  timerLabelText: { fontSize: 12, fontFamily: 'Inter-SemiBold', letterSpacing: 0.4 },
  timerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  timerChip: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  timerChipText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  sendButtonWrap: { borderRadius: 28, overflow: 'hidden' },
  sendButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  sendButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter-Bold', letterSpacing: 0.4 },
  sendButtonTextDisabled: { color: 'rgba(255,255,255,0.38)' },
  openSentCard: { borderRadius: 22, borderWidth: 1, padding: 16 },
  openCardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statusTextWrap: { flex: 1, minWidth: 0 },
  statusTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  openDareText: { marginTop: 4, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 20, fontStyle: 'italic' },
  openMetaRow: { marginTop: 13, gap: 7 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontFamily: 'Inter-Medium' },
  previousSection: { marginTop: 26 },
  previousHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  sectionTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  viewAllText: { color: '#FF2E8A', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  historyCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 13, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  historyIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  historyMain: { flex: 1, minWidth: 0 },
  historyTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  historyRelationship: { fontFamily: 'Inter-Regular' },
  historyText: { marginTop: 2, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 17, fontStyle: 'italic' },
  declineReasonText: {
    marginTop: 5,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    lineHeight: 17,
  },
  historyMeta: { alignItems: 'flex-end', gap: 3, marginLeft: 4 },
  historyDate: { fontSize: 11, fontFamily: 'Inter-Regular' },
  historyPoints: { color: '#33D17A', fontSize: 12, fontFamily: 'Inter-Bold' },
  errorBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { color: '#FF5A5F', fontSize: 13, fontFamily: 'Inter-Medium', textAlign: 'center' },
  cancelDareBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginTop: Spacing.xs },
  cancelDareBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center' },
});
