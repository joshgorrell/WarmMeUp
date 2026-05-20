import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, View } from 'react-native';
import AppText from '@/components/AppText';
import GradientText from './GradientText';
import { useTheme } from '@/context/ThemeContext';
import { Radius, FontSize } from '@/constants/theme';

interface GhostButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
  gradient?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function GhostButton({
  label,
  onPress,
  disabled,
  style,
  small,
  gradient,
  leftIcon,
  rightIcon,
}: GhostButtonProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      style={[styles.btn, { height: small ? 40 : 48 }, style, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.row}>
        {leftIcon}
        {gradient ? (
          <GradientText style={{ fontSize: small ? FontSize.sm : FontSize.body, fontFamily: 'Inter-SemiBold' }}>
            {label}
          </GradientText>
        ) : (
          <AppText style={[styles.label, { color: colors.textSecondary, fontSize: small ? FontSize.sm : FontSize.body }]}>
            {label}
          </AppText>
        )}
        {rightIcon}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: 'Inter-SemiBold', letterSpacing: 0.2 },
  disabled: { opacity: 0.4 },
});
