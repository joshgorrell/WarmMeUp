import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Dice6, Zap, MessageCircle, X } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { Interaction } from '@/lib/types';

interface CurrentMomentCardProps {
  interaction: Interaction;
  currentUserId: string;
  partnerName?: string;
  onSeeAll?: () => void;
  onDismiss?: () => void;
}

function typeIcon(type: string) {
  if (type === 'dice') return <Dice6 color="#FFB347" size={18} strokeWidth={2} />;
  if (type === 'dare') return <Zap color="#FF2E8A" size={18} strokeWidth={2} />;
  return <MessageCircle color="#FF8A3D" size={18} strokeWidth={2} />;
}

function typeLabel(type: string, isMine: boolean, partnerName: string): string {
  if (type === 'dice') return isMine ? `You rolled for ${partnerName}` : `${partnerName} rolled for you`;
  if (type === 'dare') return isMine ? 'You sent a dare' : `${partnerName} sent you a dare`;
  if (type === 'tell_me') return 'Wish';
  return type;
}

export default function CurrentMomentCard({ interaction, currentUserId, partnerName, onSeeAll, onDismiss }: CurrentMomentCardProps) {
  const { colors } = useTheme();
  const isMine = interaction.sender_id === currentUserId;
  const partner = partnerName || 'Your partner';

  return (
    <LinearGradient
      colors={['rgba(255,90,61,0.55)', 'rgba(255,46,138,0.55)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.border, { marginBottom: Spacing.sm }]}
    >
      <View style={[styles.card, { backgroundColor: 'rgba(17,16,24,0.95)' }]}>
        <View style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
            {typeIcon(interaction.type)}
          </View>
          <View style={styles.info}>
            <AppText style={[styles.meta, { color: colors.textMuted }]}>
              {typeLabel(interaction.type, isMine, partner)}
            </AppText>
            {interaction.content_text && (
              <AppText style={[styles.result, { color: colors.text }]} numberOfLines={1}>
                {interaction.content_text}
              </AppText>
            )}
            <AppText style={[styles.statusText, { color: colors.accentPink }]}>
              {statusCopy(interaction.status, isMine, partner)}
            </AppText>
            {interaction.status === 'rejected' && interaction.decline_reason && (
              <AppText style={[styles.declineReason, { color: colors.textSecondary }]}>
                "{interaction.decline_reason}"
              </AppText>
            )}
          </View>
          <View style={styles.actions}>
            {onSeeAll && (
              <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={styles.seeAll}>
                <AppText style={[styles.seeAllText, { color: colors.textSecondary }]}>See All</AppText>
                <ChevronRight color={colors.textMuted} size={13} />
              </TouchableOpacity>
            )}
            {onDismiss && (
              <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X color={colors.textMuted} size={14} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

function statusCopy(status: string, isMine: boolean, partnerName: string): string {
  if (status === 'sent') return isMine ? `Waiting for ${partnerName} to respond…` : 'Your move — accept or decline';
  if (status === 'accepted') return 'Challenge accepted!';
  if (status === 'answered') return 'Answered';
  if (status === 'rejected') return 'Dare declined';
  if (status === 'completed') return isMine ? `${partnerName} completed it!` : 'Challenge complete!';
  if (status === 'pending_verification') return isMine ? `${partnerName} is verifying…` : 'Waiting for partner to confirm';
  return status;
}

const styles = StyleSheet.create({
  border: {
    borderRadius: Radius.lg,
    padding: 1,
  },
  card: {
    borderRadius: Radius.lg - 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  info: { flex: 1, gap: 2 },
  meta: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular' },
  result: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Bold',
    lineHeight: 18,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold',
  },
  declineReason: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
  },
});
