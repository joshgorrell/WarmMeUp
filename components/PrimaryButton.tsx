import React from 'react';
import {
  TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle,
  ActivityIndicator, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradient, Radius, FontSize } from '@/constants/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  small?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export default function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  style,
  textStyle,
  small,
  leftIcon,
  rightIcon,
}: PrimaryButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.wrapper, style, (disabled || loading) && styles.disabled]}
    >
      <LinearGradient
        colors={Gradient.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradient, small && styles.gradientSmall]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <View style={styles.row}>
            {leftIcon}
            <Text style={[styles.label, small && styles.labelSmall, textStyle]}>{label}</Text>
            {rightIcon}
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  gradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  gradientSmall: {
    height: 42,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.3,
  },
  labelSmall: {
    fontSize: FontSize.sm,
  },
  disabled: {
    opacity: 0.45,
  },
});
