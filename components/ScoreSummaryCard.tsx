import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, FontSize, Spacing, Radius } from '@/constants/theme';
import Avatar from './Avatar';

interface ScoreSummaryCardProps {
  myName: string;
  partnerName: string;
  myScore: number;
  partnerScore: number;
  onViewScore?: () => void;
}

function leadStatus(mine: number, theirs: number): string {
  if (mine > theirs) return "You're in the lead";
  if (theirs > mine) return 'Partner is catching up';
  return "It's tied";
}

export default function ScoreSummaryCard({
  myName,
  partnerName,
  myScore,
  partnerScore,
  onViewScore,
}: ScoreSummaryCardProps) {
  const { colors } = useTheme();
  const status = leadStatus(myScore, partnerScore);

  const total = myScore + partnerScore;
  const myPct = total > 0 ? myScore / total : 0.5;

  return (
    <LinearGradient
      colors={['rgba(255,90,61,0.30)', 'rgba(255,46,138,0.30)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.border}
    >
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {/* Scores row */}
        <View style={styles.scoresRow}>
          <View style={styles.scoreUser}>
            <Avatar name={myName} size="md" bgColor="rgba(255,46,138,0.2)" />
            <Text style={[styles.points, { color: colors.text }]}>{myScore}</Text>
            <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">{myName}</Text>
          </View>

          <View style={styles.center}>
            <Heart color={colors.accentPink} size={22} fill="rgba(255,46,138,0.25)" strokeWidth={2} />
            <Text style={[styles.vs, { color: colors.textMuted }]}>VS</Text>
          </View>

          <View style={[styles.scoreUser, { alignItems: 'flex-end' }]}>
            <Avatar name={partnerName} size="md" bgColor="rgba(255,138,61,0.2)" />
            <Text style={[styles.points, { color: colors.text }]}>{partnerScore}</Text>
            <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">{partnerName}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

        {/* Progress bar */}
        <View style={[styles.barTrack, { backgroundColor: 'rgba(255,255,255,0.10)' }]}>
          <LinearGradient
            colors={Gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${myPct * 100}%` }]}
          />
        </View>

        {/* Status + View Score */}
        <View style={styles.footer}>
          <Text style={[styles.status, { color: colors.textSecondary }]}>{status}</Text>
          {onViewScore && (
            <TouchableOpacity onPress={onViewScore} activeOpacity={0.7} style={styles.viewScore}>
              <Text style={[styles.viewScoreText, { color: colors.accentPink }]}>View Score</Text>
              <ChevronRight color={colors.accentPink} size={14} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  border: {
    borderRadius: Radius.xl,
    padding: 1,
    marginBottom: Spacing.lg,
  },
  card: {
    borderRadius: Radius.xl - 1,
    padding: Spacing.card,
    gap: 14,
  },
  scoresRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreUser: {
    flex: 1,
    minWidth: 80,
    alignItems: 'flex-start',
    gap: 4,
  },
  center: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  points: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    lineHeight: 38,
    letterSpacing: -1,
  },
  name: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
  vs: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    letterSpacing: 2,
  },
  divider: {
    height: 1,
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  status: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
  viewScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewScoreText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
});
