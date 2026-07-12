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
      <AppText style={[styles.value, { color: colors.text }]} numberOfLines={1}>
        {value}
      </AppText>
      <AppText style={[styles.label, { color: colors.textMuted }]} numberOfLines={1}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm + 2,
    gap: 3,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    lineHeight: 20,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    lineHeight: 13,
  },
});
