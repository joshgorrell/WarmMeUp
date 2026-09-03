import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { CircleCheck as CheckCircle, Circle as XCircle } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, FontSize, Radius, Spacing } from '@/constants/theme';
import CountdownRing from '@/components/CountdownRing';

interface ReceivedDiceChallengeCardProps {
  text?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  totalExpirySeconds?: number;
  partnerName?: string;
  onAccept: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
  onTimeout?: () => void;
}

export default function ReceivedDiceChallengeCard({
  text,
  status,
  expiresAt,
  totalExpirySeconds = 86400,
  partnerName,
  onAccept,
  onReject,
  onTimeout,
}: ReceivedDiceChallengeCardProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const partner = partnerName || 'Your partner';

  const handle = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const handleAccept = () => handle(onAccept);
  const handleReject = () => handle(onReject);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: 'rgba(255,179,71,0.40)',
          shadowColor: '#FFB347',
        },
      ]}
    >
      <AppText style={[styles.label, { color: colors.textMuted }]}>
        {partner.toUpperCase()} ROLLED FOR YOU
      </AppText>

      {expiresAt && (
        <CountdownRing
          expiresAt={expiresAt}
          totalSeconds={totalExpirySeconds}
          onExpire={onTimeout ?? onReject}
        />
      )}

      <AppText style={[styles.text, { color: colors.text }]}>
        {text ?? `${partner} chose your next move.`}
      </AppText>

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
                <AppText style={styles.actionText}>Challenge Accepted</AppText>
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
          <AppText style={[styles.rejectText, { color: colors.textSecondary }]}>No Way!</AppText>
        </TouchableOpacity>
      </View>
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
});
