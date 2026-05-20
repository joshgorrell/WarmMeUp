import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, View, ActivityIndicator } from 'react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { Radius, FontSize } from '@/constants/theme';

interface DangerButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  small?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function DangerButton({
  label,
  onPress,
  disabled,
  loading,
  style,
  small,
  leftIcon,
  rightIcon,
}: DangerButtonProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.btn,
        {
          borderColor: colors.danger,
          backgroundColor: 'rgba(255,90,95,0.10)',
          height: small ? 42 : 52,
        },
        style,
        (disabled || loading) && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={colors.danger} size="small" />
      ) : (
        <View style={styles.row}>
          {leftIcon}
          <AppText style={[styles.label, { color: colors.danger, fontSize: small ? FontSize.sm : FontSize.body }]}>
            {label}
          </AppText>
          {rightIcon}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: 'Inter-SemiBold', letterSpacing: 0.2 },
  disabled: { opacity: 0.4 },
});
