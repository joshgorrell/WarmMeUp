import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Video, MessageCircle, Check, Flame } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Radius, Spacing } from '@/constants/theme';

export type DareActionType = 'photo' | 'video' | 'message' | 'action';

interface AcceptedDareCardProps {
  text: string;
  actionType: DareActionType;
  onComplete: (actionType: DareActionType) => Promise<void> | void;
}

const ACTION_CONFIG: Record<DareActionType, { label: string; icon: typeof Camera; gradient: [string, string] }> = {
  photo: { label: 'Complete with Photo', icon: Camera, gradient: ['#FF8A28', '#FF2E8A'] },
  video: { label: 'Complete with Video', icon: Video, gradient: ['#FF8A28', '#FF2E8A'] },
  message: { label: 'Complete with Message', icon: MessageCircle, gradient: ['#FF8A28', '#FF2E8A'] },
  action: { label: 'I Did It', icon: Check, gradient: ['#33D17A', '#2BB36A'] },
};

export default function AcceptedDareCard({ text, actionType, onComplete }: AcceptedDareCardProps) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const config = ACTION_CONFIG[actionType];
  const Icon = config.icon;

  const handle = async () => {
    setBusy(true);
    try { await onComplete(actionType); } finally { setBusy(false); }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: 'rgba(255,46,138,0.40)' }]}>
      <View style={styles.headerRow}>
        <View style={[styles.flameBadge, { backgroundColor: 'rgba(255,46,138,0.14)' }]}>
          <Flame color="#FF2E8A" size={18} strokeWidth={2} />
        </View>
        <AppText style={[styles.label, { color: colors.textMuted }]}>DARE ACCEPTED</AppText>
      </View>

      <AppText style={[styles.text, { color: colors.text }]} numberOfLines={3} ellipsizeMode="tail">
        {text}
      </AppText>

      <AppText style={[styles.hint, { color: colors.textSecondary }]}>
        {actionType === 'action' ? 'Tap below when you have done it.' : 'Tap below to complete this dare.'}
      </AppText>

      <TouchableOpacity onPress={handle} activeOpacity={0.85} disabled={busy} style={styles.btnWrap}>
        <LinearGradient
          colors={config.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.btn}
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Icon color="#fff" size={18} strokeWidth={2.2} />
              <AppText style={styles.btnText}>{config.label}</AppText>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.card,
    gap: Spacing.md,
    shadowColor: '#FF2E8A',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flameBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  text: { fontSize: FontSize.lg, fontFamily: 'Inter-SemiBold', lineHeight: 24, fontStyle: 'italic' },
  hint: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  btnWrap: { borderRadius: Radius.pill, overflow: 'hidden' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 },
  btnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-Bold' },
});
