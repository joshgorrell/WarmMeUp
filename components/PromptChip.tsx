import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, FontSize, Radius } from '@/constants/theme';

interface PromptChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export default function PromptChip({ label, active, onPress, style }: PromptChipProps) {
  const { colors } = useTheme();

  if (active) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={style}>
        <LinearGradient
          colors={Gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.activeBorder}
        >
          <LinearGradient
            colors={['rgba(255,90,61,0.25)', 'rgba(255,46,138,0.25)']}
            style={styles.activeFill}
          >
            <Text style={[styles.label, { color: '#fff' }]}>{label}</Text>
          </LinearGradient>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.inactive, { backgroundColor: colors.card, borderColor: colors.borderSubtle }, style]}
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  activeBorder: {
    borderRadius: Radius.pill,
    padding: 1,
  },
  activeFill: {
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inactive: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  label: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
});
