import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, View } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { Gradient, Radius, FontSize } from '@/constants/theme';

interface PillButtonProps {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function PillButton({
  label,
  onPress,
  active,
  disabled,
  style,
  leftIcon,
  rightIcon,
}: PillButtonProps) {
  const { colors } = useTheme();

  if (active) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        style={[styles.wrapper, style, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <LinearGradient
          colors={Gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.activeFill}
        >
          <View style={styles.row}>
            {leftIcon}
            <AppText style={[styles.label, { color: '#fff' }]}>{label}</AppText>
            {rightIcon}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[
        styles.wrapper,
        styles.inactive,
        { backgroundColor: colors.card, borderColor: colors.borderSubtle },
        style,
        disabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.row}>
        {leftIcon}
        <AppText style={[styles.label, { color: colors.textSecondary }]}>{label}</AppText>
        {rightIcon}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  activeFill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.4 },
});
