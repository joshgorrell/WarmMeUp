import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, View, ActivityIndicator } from 'react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { Radius, FontSize } from '@/constants/theme';

interface SecondaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  danger?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  small?: boolean;
}

export default function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
  danger,
  leftIcon,
  rightIcon,
  small,
}: SecondaryButtonProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.btn,
        {
          borderColor: danger ? colors.danger : 'rgba(255,255,255,0.12)',
          backgroundColor: danger ? 'rgba(255,90,95,0.08)' : colors.card,
          minHeight: small ? 42 : 52,
        },
        style,
        (disabled || loading) && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textSecondary} size="small" />
      ) : (
        <View style={styles.row}>
          {leftIcon}
          <AppText style={[
            styles.label,
            { color: danger ? colors.danger : colors.text },
            small && styles.labelSmall,
          ]}>
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
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
  },
  labelSmall: { fontSize: FontSize.sm },
  disabled: { opacity: 0.4 },
});
