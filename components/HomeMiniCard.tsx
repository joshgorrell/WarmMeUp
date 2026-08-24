import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { Spacing, Radius, FontSize } from '@/constants/theme';

interface HomeMiniCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
  style?: ViewStyle;
}

export default function HomeMiniCard({
  icon,
  label,
  value,
  onPress,
  style,
}: HomeMiniCardProps) {
  const { colors } = useTheme();
  // Home's legacy caller still passes "Day streak". The database compatibility
  // bridge already supplies the weekly value; normalize the label here so the
  // large Home screen does not need a risky whole-file rewrite for one string.
  const displayLabel = label === 'Day streak' ? 'Weekly streak' : label;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.borderSubtle },
        style,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
        {icon}
      </View>
      <View style={styles.textWrap}>
        <AppText style={[styles.value, { color: colors.text }]} numberOfLines={1}>
          {value}
        </AppText>
        <AppText style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
          {displayLabel}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  value: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    lineHeight: 18,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    lineHeight: 12,
  },
});
