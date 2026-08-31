import React from 'react';
import { View, ViewStyle, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { Radius, Spacing } from '@/constants/theme';

interface GlowCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  activeOpacity?: number;
  noPadding?: boolean;
}

export default function GlowCard({ children, style, onPress, activeOpacity = 0.8, noPadding }: GlowCardProps) {
  const { colors } = useTheme();

  const inner = (
    <View style={[styles.inner, { backgroundColor: colors.card }, noPadding ? null : styles.padding, style]}>
      {children}
    </View>
  );

  const wrapped = (
    <LinearGradient
      colors={['rgba(255,179,71,0.25)', 'rgba(255,46,138,0.25)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradient]}
    >
      <View style={[styles.borderInner, { backgroundColor: colors.card }]}>
        {inner}
      </View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={activeOpacity} style={styles.container}>
        {wrapped}
      </TouchableOpacity>
    );
  }

  return <View style={styles.container}>{wrapped}</View>;
}

const styles = StyleSheet.create({
  container: {},
  gradient: {
    borderRadius: Radius.xl,
    padding: 1,
  },
  borderInner: {
    borderRadius: Radius.xl - 1,
    overflow: 'hidden',
  },
  inner: {
    borderRadius: Radius.xl - 1,
  },
  padding: {
    padding: Spacing.md,
  },
});
