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
  const displayLabel = label === 'Day streak' ? 'Weekly Streak' : label;
  const keepLabelOnOneLine = displayLabel === 'Send love' || displayLabel === 'Send Love' || displayLabel === 'Together';

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
        <AppText style={[styles.value, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
          {value}
        </AppText>
        <AppText
          style={[styles.label, { color: colors.text }]}
          numberOfLines={keepLabelOnOneLine ? 1 : 2}
          adjustsFontSizeToFit={keepLabelOnOneLine}
          minimumFontScale={0.82}
        >
          {displayLabel}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 72,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  value: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    lineHeight: 19,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 14,
  },
});
