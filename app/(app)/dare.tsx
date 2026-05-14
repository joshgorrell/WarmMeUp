import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Zap } from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { awardPoints, deactivatePreviousEphemeral, incrementMonthlyCounter, verifyCompletion } from '@/lib/points';
import { Interaction } from '@/lib/types';
import PrimaryButton from '@/components/PrimaryButton';
import SecondaryButton from '@/components/SecondaryButton';
import WarmTextInput from '@/components/WarmTextInput';
import PromptChip from '@/components/PromptChip';
import AppShell from '@/components/AppShell';
import ScreenHeader from '@/components/ScreenHeader';
import ReceivedDareCard from '@/components/ReceivedDareCard';
import { FontSize, Spacing, Radius } from '@/constants/theme';

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

export default function DareScreen() {
  const router = useRouter();
  const { user, couple } = useAuth();
  const { colors } = useTheme();
  const [quickDares, setQuickDares] = useState<string[]>(FALLBACK_DARES);
  const [mode, setMode] = useState<'tell_me' | 'text_me'>('tell_me');
  const [dareText, setDareText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [incomingDare, setIncomingDare] = useState<Interaction | null>(null);

  useEffect(() => {
    supabase
      .from('dare_prompts')
      .select('text')
      .eq('is_default', true)
      .eq('is_active', true)
      .then(({ data }) => {
        if (data && data.length > 0) setQuickDares(data.map(d => d.text));
      });
  }, []);

  useEffect(() => {
    if (!couple?.id || !user) return;
    checkIncoming();
    const ch = supabase.channel(`dare_${couple.id}`)
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
      .eq('type', 'dare')
      .eq('is_active', true)
      .eq('status', 'sent')
      .maybeSingle();
    setIncomingDare(data);
  };

  const handleSend = async () => {
    if (!couple?.id || !user) return;
    if (mode === 'text_me' && !dareText.trim()) return;
    setSending(true);
    setError('');
    try {
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      if (!partnerId) throw new Error('Partner not connected yet');
      await deactivatePreviousEphemeral(couple.id);
      const { data, error: insertError } = await supabase.from('interactions').insert({
        couple_id: couple.id,
        type: 'dare',
        sender_id: user.id,
        receiver_id: partnerId,
        content_text: mode === 'text_me' ? dareText.trim() : null,
        mode,
        status: 'sent',
        is_active: true,
      }).select().single();
      if (insertError) throw insertError;
      if (data) await awardPoints(couple.id, user.id, 2, 'Dare sent', data.id);
      setSent(true);
    } catch {
      setError('Failed to send dare. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleRespond = async (accepted: boolean) => {
    if (!incomingDare || !couple?.id || !user) return;
    const status = accepted ? 'accepted' : 'rejected';
    await supabase.from('interactions').update({ status, is_active: accepted }).eq('id', incomingDare.id);
    if (accepted) {
      await awardPoints(couple.id, user.id, 3, 'Dare accepted', incomingDare.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dares_accepted', 0);
    } else {
      await awardPoints(couple.id, user.id, 1, 'Dare — participation', incomingDare.id);
      await incrementMonthlyCounter(couple.id, user.id, 'dares_skipped', 0);
      setIncomingDare(null);
    }
  };

  const handleMarkComplete = async () => {
    if (!incomingDare || !couple?.id || !user) return;
    await supabase.from('interactions').update({ status: 'pending_verification', is_active: false }).eq('id', incomingDare.id);
    await incrementMonthlyCounter(couple.id, user.id, 'dares_completed', 0);
    setIncomingDare(null);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppShell scrollable={false}>
        <ScreenHeader title="Send a Dare" onBack={() => router.back()} />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Icon */}
          <View style={styles.iconWrap}>
            <Zap color="#FF2E8A" size={44} strokeWidth={2} fill="rgba(255,46,138,0.12)" />
          </View>

          {incomingDare && (
            <ReceivedDareCard
              text={incomingDare.content_text}
              onAccept={() => handleRespond(true)}
              onReject={() => handleRespond(false)}
              onComplete={handleMarkComplete}
            />
          )}

          {/* Send form */}
          {!sent && (
            <>
              {error ? (
                <View style={[styles.errorBanner, { backgroundColor: 'rgba(255,90,95,0.08)', borderColor: 'rgba(255,90,95,0.25)' }]}>
                  <Text style={{ color: '#FF5A5F', fontSize: 13, fontFamily: 'Inter-Medium', textAlign: 'center' }}>{error}</Text>
                </View>
              ) : null}

              {/* Mode cards */}
              <View style={styles.modeRow}>
                {(['tell_me', 'text_me'] as const).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.modeCard,
                      {
                        backgroundColor: mode === m ? 'rgba(255,46,138,0.12)' : colors.card,
                        borderColor: mode === m ? 'rgba(255,46,138,0.45)' : colors.borderSubtle,
                      },
                    ]}
                    onPress={() => setMode(m)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.modeTitle, { color: mode === m ? '#FF2E8A' : colors.text }]}>
                      {m === 'tell_me' ? 'Tell Me' : 'Text Me'}
                    </Text>
                    <Text style={[styles.modeSub, { color: colors.textMuted }]}>
                      {m === 'tell_me' ? 'Say it out loud' : 'Type your dare'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {mode === 'text_me' && (
                <>
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
                </>
              )}

              <PrimaryButton
                label="Send Dare"
                onPress={handleSend}
                loading={sending}
                disabled={mode === 'text_me' && !dareText.trim()}
                style={{ marginTop: Spacing.lg }}
              />
            </>
          )}

          {sent && (
            <View style={[styles.sentCard, { backgroundColor: colors.card, borderColor: 'rgba(51,209,122,0.25)' }]}>
              <Text style={styles.sentEmoji}>⚡</Text>
              <Text style={[styles.sentTitle, { color: colors.text }]}>Dare sent!</Text>
              <Text style={[styles.sentSub, { color: colors.textSecondary }]}>Waiting to see if they're up for it.</Text>
              <SecondaryButton label="Send Another" onPress={() => { setSent(false); setDareText(''); setError(''); }} style={{ marginTop: Spacing.md }} />
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
  modeRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  modeCard: { flex: 1, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, gap: 4 },
  modeTitle: { fontSize: FontSize.body, fontFamily: 'Inter-Bold' },
  modeSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  quickRow: { marginBottom: Spacing.md },
  sentCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.xl, alignItems: 'center', gap: 8 },
  sentEmoji: { fontSize: 48, marginBottom: 8 },
  sentTitle: { fontSize: FontSize.xl, fontFamily: 'Inter-Bold' },
  sentSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center' },
  errorBanner: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginBottom: Spacing.md },
});
