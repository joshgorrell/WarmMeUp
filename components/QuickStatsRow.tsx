import React from 'react';
import { View, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, Activity, Star } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, FontSize, Spacing, Radius } from '@/constants/theme';

interface QuickStatsRowProps {
  streak: number | string;
  momentsToday: number;
  totalPoints: number | string;
}

function StatItem({
  icon,
  value,
  label,
  showDivider,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  showDivider: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.statOuter}>
      <View style={styles.statItem}>
        <View style={styles.statIcon}>
          <LinearGradient
            colors={Gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGrad}
          >
            {icon}
          </LinearGradient>
        </View>
        <AppText style={[styles.statValue, { color: colors.text }]}>{value}</AppText>
        <AppText style={[styles.statLabel, { color: colors.textMuted }]}>{label}</AppText>
      </View>
      {showDivider && (
        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
      )}
    </View>
  );
}

export default function QuickStatsRow({ streak, momentsToday, totalPoints }: QuickStatsRowProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: 'rgba(255,255,255,0.08)' }]}>
      <StatItem
        icon={<Flame color="#fff" size={16} strokeWidth={2} />}
        value={streak}
        label="Day Streak"
        showDivider
      />
      <StatItem
        icon={<Activity color="#fff" size={16} strokeWidth={2} />}
        value={momentsToday}
        label="Moments Today"
        showDivider
      />
      <StatItem
        icon={<Star color="#fff" size={16} strokeWidth={2} />}
        value={totalPoints}
        label="Total Points"
        showDivider={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: 4,
  },
  statOuter: {
    flex: 1,
    flexDirection: 'row',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: { marginBottom: 2 },
  iconGrad: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: FontSize.h3,
    fontFamily: 'Inter-Bold',
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 14,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 4,
  },
});
