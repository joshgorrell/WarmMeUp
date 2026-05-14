import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, Check } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, deactivatePreviousEphemeral, getPointValue, incrementMonthlyCounter } from '@/lib/points';
import { notifyPartner } from '@/lib/notifications';
import { Interaction } from '@/lib/types';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import WarmTextInput from '@/components/WarmTextInput';
import AppShell from '@/components/AppShell';
import TabHeader from '@/components/TabHeader';
import { FontSize, Spacing, Radius, Gradient } from '@/constants/theme';

const FALLBACK_PROMPTS = [
  "Tell me something you've never told me",
  'Tell me what you want',
  "Tell me what you're thinking right now",
  'Tell me your favorite memory of us',
  'Tell me something bold',
  'Tell me what you want later',
  'Tell me something sweet',
  "Tell me something I don't know",
  'Tell me a secret',
];

export default function AskTab() {
  const { user, couple } = useAuth();
  const { colors } = useTheme();
  const [prompts, setPrompts] = useState<string[]>(FALLBACK_PROMPTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [incoming, setIncoming] = useState<Interaction | null>(null);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyMode, setReplyMode] = useState<'text' | 'verbal' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const coupleId = couple?.id;
    const query = supabase
      .from('tell_me_prompts')
      .select('id, text, is_default')
      .eq('is_active', true);
    const baseQuery = coupleId
      ? query.or(`is_default.eq.true,couple_id.eq.${coupleId}`)
      : query.eq('is_default', true);

    (async () => {
      const [promptsResult, hiddenResult] = await Promise.all([
        baseQuery,
        coupleId
          ? supabase.from('couple_hidden_prompts').select('prompt_id').eq('couple_id', coupleId).eq('prompt_table', 'tell_me_prompts')
          : Promise.resolve({ data: [] }),
      ]);
      if (!promptsResult.data?.length) return;
      const hiddenIds = new Set((hiddenResult.data ?? []).map((r: { prompt_id: string }) => r.prompt_id));
      const visible = promptsResult.data.filter((d: { id: string; is_default: boolean }) => !d.is_default || !hiddenIds.has(d.id));
      if (visible.length > 0) setPrompts(visible.map((d: { text: string }) => d.text));
    })();
  }, [couple?.id]);

  useEffect(() => {
    if (!couple?.id || !user) return;
    checkIncoming();
    const ch = supabase.channel(`ask_tab_${couple.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions', filter: `couple_id=eq.${couple.id}` }, checkIncoming)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [couple?.id, user]);

  const checkIncoming = async () => {
    if (!couple?.id || !user) return;
    const { data } = await supabase.from('interactions')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('receiver_id', user.id)
      .eq('type', 'tell_me')
      .eq('is_active', true)
      .eq('status', 'sent')
      .maybeSingle();
    setIncoming(data);
  };

  const handleSend = async () => {
    if (!selected || !couple?.id || !user) return;
    setSending(true);
    setError('');
    try {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      if (!partnerId) throw new Error('Partner not connected yet');
      await deactivatePreviousEphemeral(couple.id);
      const { data, error: insertError } = await supabase.from('interactions').insert({
        couple_id: couple.id,
        type: 'tell_me',
        sender_id: user.id,
        receiver_id: partnerId,
        content_text: selected,
        mode: 'tell_me',
        status: 'sent',
        is_active: true,
      }).select().single();
      if (insertError) throw insertError;
      if (data) {
        const pts = await getPointValue('ask_sent');
        await awardPoints(couple.id, user.id, pts, 'Ask sent', data.id);
        await incrementMonthlyCounter(couple.id, user.id, 'asks_sent', pts);
        notifyPartner({ event_type: 'new_ask', couple_id: couple.id, target_route: '/(app)/(tabs)/ask' });
      }
      setSent(true);
    } catch {
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleTextBack = async () => {
    if (!incoming || !reply.trim() || !couple?.id || !user) return;
    if (incoming.status === 'answered') { setIncoming(null); return; }
    setReplying(true);
    try {
      const { error } = await supabase.from('interactions')
        .update({
          status: 'answered',
          is_active: false,
          answer_text: reply.trim(),
          answered_at: new Date().toISOString(),
        })
        .eq('id', incoming.id);
      if (error) throw error;
      const pts = await getPointValue('ask_replied');
      await awardPoints(couple.id, user.id, pts, 'Ask replied', incoming.id);
      await incrementMonthlyCounter(couple.id, user.id, 'asks_replied', pts);
      notifyPartner({ event_type: 'ask_answered', couple_id: couple.id, target_route: '/(app)/(tabs)/ask' });
      setReplyMode(null);
      setIncoming(null);
    } catch {
      setError('Failed to send reply. Please try again.');
    } finally {
      setReplying(false);
    }
  };

  const handleVerbal = async () => {
    if (!incoming || !couple?.id || !user) return;
    if (incoming.status === 'answered') { setIncoming(null); return; }
    try {
      const { error } = await supabase.from('interactions')
        .update({ status: 'answered', is_active: false, answered_at: new Date().toISOString() })
        .eq('id', incoming.id);
      if (error) throw error;
      const pts = await getPointValue('ask_replied');
      await awardPoints(couple.id, user.id, pts, 'Ask replied verbally', incoming.id);
      await incrementMonthlyCounter(couple.id, user.id, 'asks_replied', pts);
      notifyPartner({ event_type: 'ask_answered', couple_id: couple.id, target_route: '/(app)/(tabs)/ask' });
      setIncoming(null);
    } catch {
      setError('Something went wrong. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppShell scrollable={false}>
        <TabHeader title="Ask" />
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          <View style={styles.iconWrap}>
            <MessageCircle color="#FF8A3D" size={44} strokeWidth={2} />
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            What do you want them to tell you?
          </Text>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,95,0.08)', borderColor: 'rgba(255,90,95,0.25)' }]}>
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          {incoming && (
            <View style={[styles.incomingCard, { backgroundColor: colors.card, borderColor: 'rgba(255,138,61,0.40)' }]}>
              <Text style={[styles.incomingLabel, { color: colors.textMuted }]}>YOUR PARTNER WANTS TO KNOW</Text>
              <Text style={[styles.incomingText, { color: colors.text }]}>{incoming.content_text}</Text>

              {replyMode === 'text' ? (
                <>
                  <WarmTextInput
                    value={reply}
                    onChangeText={setReply}
                    placeholder="Type your answer…"
                    multiline
                    minHeight={90}
                    autoFocus
                    containerStyle={{ marginBottom: 8 }}
                  />
                  <PrimaryButton label="Send Reply" onPress={handleTextBack} loading={replying} disabled={!reply.trim()} />
                  <SecondaryButton label="Cancel" onPress={() => setReplyMode(null)} style={{ marginTop: 8 }} />
                </>
              ) : (
                <View style={styles.respondRow}>
                  <TouchableOpacity style={styles.textBackBtn} onPress={() => setReplyMode('text')} activeOpacity={0.85}>
                    <LinearGradient colors={Gradient.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGrad}>
                      <Text style={styles.btnText}>Text Back</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.verbalBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
                    onPress={handleVerbal}
                    activeOpacity={0.7}
                  >
                    <Check color={colors.textSecondary} size={16} />
                    <Text style={[styles.verbalText, { color: colors.textSecondary }]}>I'll Tell You</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {!sent ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PICK A PROMPT</Text>
              <View style={styles.promptList}>
                {prompts.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.promptRow,
                      {
                        backgroundColor: selected === p ? 'rgba(255,138,61,0.10)' : colors.card,
                        borderColor: selected === p ? 'rgba(255,138,61,0.50)' : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setSelected(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.promptText, { color: selected === p ? '#FF8A3D' : colors.text }]}>
                      {p}
                    </Text>
                    {selected === p && <Check color="#FF8A3D" size={18} strokeWidth={2.5} />}
                  </TouchableOpacity>
                ))}
              </View>
              <PrimaryButton
                label="Ask Them"
                onPress={handleSend}
                loading={sending}
                disabled={!selected}
                style={{ marginTop: Spacing.lg }}
              />
            </>
          ) : (
            <View style={[styles.sentCard, { backgroundColor: colors.card, borderColor: 'rgba(255,138,61,0.25)' }]}>
              <Text style={styles.sentEmoji}>💭</Text>
              <Text style={[styles.sentTitle, { color: colors.text }]}>Sent!</Text>
              <Text style={[styles.sentSub, { color: colors.textSecondary }]}>"{selected}"</Text>
              <SecondaryButton label="Ask Something Else" onPress={() => { setSent(false); setSelected(null); setError(''); }} style={{ marginTop: Spacing.md }} />
            </View>
          )}
        </ScrollView>
      </AppShell>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 60 },
  iconWrap: { alignItems: 'center', marginBottom: Spacing.sm },
  subtitle: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', marginBottom: Spacing.xl, lineHeight: 20 },
  incomingCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.xl, gap: Spacing.md },
  incomingLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  incomingText: { fontSize: FontSize.lg, fontFamily: 'Inter-SemiBold', lineHeight: 28 },
  respondRow: { gap: Spacing.sm },
  textBackBtn: { borderRadius: Radius.pill, overflow: 'hidden' },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 },
  btnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Bold' },
  verbalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: Radius.pill, borderWidth: 1 },
  verbalText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2, marginBottom: Spacing.sm },
  promptList: { gap: Spacing.sm },
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, paddingHorizontal: Spacing.lg },
  promptText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', flex: 1, lineHeight: 22 },
  sentCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: 8 },
  sentEmoji: { fontSize: 48, marginBottom: 8 },
  sentTitle: { fontSize: FontSize.xl, fontFamily: 'Inter-Bold' },
  sentSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', fontStyle: 'italic' },
  errorBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
  errorText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', textAlign: 'center' },
});
