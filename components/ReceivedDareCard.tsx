import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleCheck as CheckCircle, Circle as XCircle, Flame, Clock, ChevronLeft } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, FontSize, Radius, Spacing } from '@/constants/theme';
import CountdownRing from '@/components/CountdownRing';
import { supabase } from '@/lib/supabase';

type Stage = 'pending' | 'declining' | 'accepted' | 'waiting';

interface DeclinePrompt {
  id: string;
  text: string;
}

interface ReceivedDareCardProps {
  text?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  totalExpirySeconds?: number;
  coupleId?: string;
  onAccept: () => Promise<void> | void;
  onReject: (reason: string) => Promise<void> | void;
  onComplete: () => Promise<void> | void;
  onTimeout?: () => void;
}

function resolveStage(status?: string | null): Stage {
  if (status === 'pending_verification') return 'waiting';
  if (status === 'accepted') return 'accepted';
  return 'pending';
}

export default function ReceivedDareCard({
  text,
  status,
  expiresAt,
  totalExpirySeconds = 86400,
  coupleId,
  onAccept,
  onReject,
  onComplete,
  onTimeout,
}: ReceivedDareCardProps) {
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>(resolveStage(status));
  const [busy, setBusy] = useState(false);
  const [declinePrompts, setDeclinePrompts] = useState<DeclinePrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);

  const loadDeclinePrompts = async () => {
    setLoadingPrompts(true);
    try {
      const query = supabase
        .from('decline_prompts')
        .select('id, text, is_default')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const baseQuery = coupleId
        ? query.or(`is_default.eq.true,couple_id.eq.${coupleId}`)
        : query.eq('is_default', true);

      const [promptsResult, hiddenResult] = await Promise.all([
        baseQuery,
        coupleId
          ? supabase
              .from('couple_hidden_prompts')
              .select('prompt_id')
              .eq('couple_id', coupleId)
              .eq('prompt_table', 'decline_prompts')
          : Promise.resolve({ data: [] }),
      ]);

      if (promptsResult.data) {
        const hiddenIds = new Set(
          (hiddenResult.data ?? []).map((r: { prompt_id: string }) => r.prompt_id)
        );
        const visible = promptsResult.data.filter(
          (d: { id: string; is_default: boolean }) => !d.is_default || !hiddenIds.has(d.id)
        );
        setDeclinePrompts(visible.map((d: { id: string; text: string }) => ({ id: d.id, text: d.text })));
      }
    } finally {
      setLoadingPrompts(false);
    }
  };

  const handle = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const handleAccept = async () => {
    await handle(onAccept);
    setStage('accepted');
  };

  const handleDeclinePress = async () => {
    await loadDeclinePrompts();
    setStage('declining');
  };

  const handleDeclineSelect = async (reason: string) => {
    await handle(() => onReject(reason));
  };

  const handleComplete = async () => {
    await handle(onComplete);
    setStage('waiting');
  };

  const isWaiting = stage === 'waiting';

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: isWaiting ? 'rgba(51,209,122,0.40)' : 'rgba(255,46,138,0.40)',
          shadowColor: isWaiting ? '#33D17A' : '#FF2E8A',
        },
      ]}
    >
      <AppText style={[styles.label, { color: colors.textMuted }]}>
        {stage === 'pending' && 'YOUR PARTNER SENT YOU A DARE'}
        {stage === 'declining' && 'SEND A RESPONSE'}
        {stage === 'accepted' && 'DARE ACCEPTED — COMPLETE IT!'}
        {stage === 'waiting' && 'WAITING FOR PARTNER TO CONFIRM'}
      </AppText>

      {stage === 'pending' && expiresAt && (
        <CountdownRing
          expiresAt={expiresAt}
          totalSeconds={totalExpirySeconds}
          onExpire={onTimeout ?? (() => onReject('Time expired'))}
        />
      )}

      {stage !== 'declining' && (
        <AppText style={[styles.text, { color: colors.text }]}>
          {text ?? "They're waiting to see what you do."}
        </AppText>
      )}

      {stage === 'pending' && (
        <View style={styles.row}>
          <TouchableOpacity
            onPress={handleAccept}
            activeOpacity={0.85}
            style={styles.fullBtn}
            disabled={busy}
          >
            <LinearGradient
              colors={Gradient.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionGrad}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <CheckCircle color="#fff" size={18} />
                  <AppText style={styles.actionText}>Challenge Accepted</AppText>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDeclinePress}
            activeOpacity={0.7}
            disabled={busy}
            style={[styles.rejectBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
          >
            <XCircle color={colors.textSecondary} size={18} />
            <AppText style={[styles.rejectText, { color: colors.textSecondary }]}>No Way!</AppText>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'declining' && (
        <View style={styles.decliningContainer}>
          <AppText style={[styles.decliningHint, { color: colors.textSecondary }]}>
            Pick a response to send back:
          </AppText>

          {loadingPrompts ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#FF2E8A" size="small" />
            </View>
          ) : (
            <View style={styles.promptsGrid}>
              {declinePrompts.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => handleDeclineSelect(p.text)}
                  disabled={busy}
                  activeOpacity={0.75}
                  style={[
                    styles.promptChip,
                    { backgroundColor: 'rgba(255,46,138,0.08)', borderColor: 'rgba(255,46,138,0.25)' },
                  ]}
                >
                  <AppText style={[styles.promptChipText, { color: colors.text }]}>{p.text}</AppText>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={() => setStage('pending')}
            style={styles.backLink}
            activeOpacity={0.7}
          >
            <ChevronLeft color={colors.textMuted} size={14} strokeWidth={2} />
            <AppText style={[styles.backLinkText, { color: colors.textMuted }]}>Go back</AppText>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'accepted' && (
        <View style={styles.row}>
          <TouchableOpacity
            onPress={handleComplete}
            activeOpacity={0.85}
            style={styles.fullBtn}
            disabled={busy}
          >
            <LinearGradient
              colors={['#FF6B35', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionGrad}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Flame color="#fff" size={18} />
                  <AppText style={styles.actionText}>I Did It!</AppText>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'waiting' && (
        <View style={[styles.waitingRow, { borderColor: 'rgba(51,209,122,0.25)', backgroundColor: 'rgba(51,209,122,0.07)' }]}>
          <Clock color="#33D17A" size={16} strokeWidth={2} />
          <AppText style={[styles.waitingText, { color: '#33D17A' }]}>
            Waiting for your partner to confirm...
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  label: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  text: { fontSize: FontSize.lg, fontFamily: 'Inter-SemiBold', lineHeight: 26 },
  row: { gap: Spacing.sm, marginTop: 4 },
  fullBtn: { borderRadius: Radius.pill, overflow: 'hidden' },
  actionGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
  },
  actionText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Bold' },
  rejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  rejectText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: 4,
  },
  waitingText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', flex: 1 },
  decliningContainer: { gap: Spacing.md },
  decliningHint: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  loadingWrap: { alignItems: 'center', paddingVertical: Spacing.lg },
  promptsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  promptChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  promptChipText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  backLinkText: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
});
