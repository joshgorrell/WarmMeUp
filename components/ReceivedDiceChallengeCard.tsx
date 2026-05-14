import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleCheck as CheckCircle, Circle as XCircle, Dices, Clock } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, FontSize, Radius, Spacing } from '@/constants/theme';
import CountdownRing from '@/components/CountdownRing';

type Stage = 'pending' | 'accepted' | 'waiting';

interface ReceivedDiceChallengeCardProps {
  text?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  totalExpirySeconds?: number;
  onAccept: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
  onComplete: () => Promise<void> | void;
  onTimeout?: () => void;
}

function resolveStage(status?: string | null): Stage {
  if (status === 'accepted') return 'accepted';
  if (status === 'pending_verification') return 'waiting';
  return 'pending';
}

export default function ReceivedDiceChallengeCard({
  text,
  status,
  expiresAt,
  totalExpirySeconds = 86400,
  onAccept,
  onReject,
  onComplete,
  onTimeout,
}: ReceivedDiceChallengeCardProps) {
  const { colors } = useTheme();
  const [stage, setStage] = useState<Stage>(resolveStage(status));
  const [busy, setBusy] = useState(false);

  const handle = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const handleAccept = async () => {
    await handle(onAccept);
    setStage('accepted');
  };

  const handleReject = () => handle(onReject);

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
          borderColor: isWaiting ? 'rgba(51,209,122,0.40)' : 'rgba(255,179,71,0.40)',
          shadowColor: isWaiting ? '#33D17A' : '#FFB347',
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.textMuted }]}>
        {stage === 'pending' && 'YOUR PARTNER ROLLED FOR YOU'}
        {stage === 'accepted' && 'CHALLENGE ACCEPTED — COMPLETE IT!'}
        {stage === 'waiting' && 'WAITING FOR PARTNER TO CONFIRM'}
      </Text>

      {stage === 'pending' && expiresAt && (
        <CountdownRing
          expiresAt={expiresAt}
          totalSeconds={totalExpirySeconds}
          onExpire={onTimeout ?? onReject}
        />
      )}

      <Text style={[styles.text, { color: colors.text }]}>
        {text ?? 'They chose your next move.'}
      </Text>

      {stage === 'pending' && (
        <View style={styles.row}>
          <TouchableOpacity
            onPress={handleAccept}
            activeOpacity={0.85}
            style={styles.fullBtn}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Accept the dice challenge"
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
                  <Text style={styles.actionText}>Challenge Accepted</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleReject}
            activeOpacity={0.7}
            disabled={busy}
            style={[styles.rejectBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
            accessibilityRole="button"
            accessibilityLabel="Decline the dice challenge"
          >
            <XCircle color={colors.textSecondary} size={18} />
            <Text style={[styles.rejectText, { color: colors.textSecondary }]}>No Way!</Text>
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
              colors={['#FFB347', '#FF5A3D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionGrad}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Dices color="#fff" size={18} />
                  <Text style={styles.actionText}>I Did It!</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'waiting' && (
        <View style={[styles.waitingRow, { borderColor: 'rgba(51,209,122,0.25)', backgroundColor: 'rgba(51,209,122,0.07)' }]}>
          <Clock color="#33D17A" size={16} strokeWidth={2} />
          <Text style={[styles.waitingText, { color: '#33D17A' }]}>
            Waiting for your partner to confirm...
          </Text>
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
});
