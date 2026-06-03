import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles, ChevronRight, Dice6, Zap, MessageCircle, X } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, FontSize, Spacing, Radius } from '@/constants/theme';
import Badge from './Badge';
import { Interaction } from '@/lib/types';

interface CurrentMomentCardProps {
  interaction: Interaction;
  onSeeAll?: () => void;
  onDismiss?: () => void;
}

function typeIcon(type: string) {
  if (type === 'dice') return <Dice6 color="#FFB347" size={32} strokeWidth={2} />;
  if (type === 'dare') return <Zap color="#FF2E8A" size={32} strokeWidth={2} />;
  return <MessageCircle color="#FF8A3D" size={32} strokeWidth={2} />;
}

function typeLabel(type: string): string {
  if (type === 'dice') return 'Dice rolled';
  if (type === 'dare') return 'Dare sent';
  if (type === 'tell_me') return 'Wish';
  return type;
}

export default function CurrentMomentCard({ interaction, onSeeAll, onDismiss }: CurrentMomentCardProps) {
  const { colors } = useTheme();

  return (
    <LinearGradient
      colors={['rgba(255,90,61,0.55)', 'rgba(255,46,138,0.55)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.border, { marginBottom: Spacing.lg }]}
    >
      <View style={[styles.card, { backgroundColor: 'rgba(17,16,24,0.95)' }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Sparkles color={Gradient.primaryMid} size={16} strokeWidth={2} />
            <AppText style={[styles.headerTitle, { color: colors.text }]}>Current Moment</AppText>
            <Badge label="Active" variant="active" gradientBorder />
          </View>
          <View style={styles.headerRight}>
            {onSeeAll && (
              <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={styles.seeAll}>
                <AppText style={[styles.seeAllText, { color: colors.textSecondary }]}>See All</AppText>
                <ChevronRight color={colors.textMuted} size={14} />
              </TouchableOpacity>
            )}
            {onDismiss && (
              <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={styles.dismissBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={colors.textMuted} size={16} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
            {typeIcon(interaction.type)}
          </View>
          <View style={styles.info}>
            <AppText style={[styles.meta, { color: colors.textMuted }]}>
              {typeLabel(interaction.type)}
            </AppText>
            {interaction.content_text && (
              <AppText style={[styles.result, { color: colors.text }]} numberOfLines={2}>
                {interaction.content_text}
              </AppText>
            )}
            <AppText style={[styles.statusText, { color: colors.accentPink }]}>
              {statusCopy(interaction.status)}
            </AppText>
            {interaction.status === 'rejected' && interaction.decline_reason && (
              <AppText style={[styles.declineReason, { color: colors.textSecondary }]}>
                "{interaction.decline_reason}"
              </AppText>
            )}
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

function statusCopy(status: string): string {
  if (status === 'sent') return "Waiting for their move…";
  if (status === 'accepted') return "Challenge accepted!";
  if (status === 'answered') return "Answered";
  if (status === 'rejected') return "Dare declined";
  return status;
}

const styles = StyleSheet.create({
  border: {
    borderRadius: Radius.lg,
    padding: 1,
  },
  card: {
    borderRadius: Radius.lg - 1,
    padding: Spacing.card,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dismissBtn: {
    padding: 2,
  },
  seeAllText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 3 },
  meta: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  result: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    lineHeight: 22,
  },
  statusText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  declineReason: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
