import React from 'react';
import { View, ViewStyle, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/context/ThemeContext';
import { Radius, Spacing } from '@/constants/theme';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
  onPress?: () => void;
  activeOpacity?: number;
  noPadding?: boolean;
  active?: boolean;
  radius?: number;
}

export default function GlassCard({
  children,
  style,
  innerStyle,
  onPress,
  activeOpacity = 0.8,
  noPadding,
  active,
  radius = Radius.lg,
}: GlassCardProps) {
  const { colors } = useTheme();

  const borderColors = active
    ? (['rgba(255,90,61,0.65)', 'rgba(255,46,138,0.65)'] as const)
    : (['rgba(255,179,71,0.35)', 'rgba(255,46,138,0.35)'] as const);

  const content = (
    <LinearGradient
      colors={borderColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius + 1, padding: 1 }, style]}
    >
      <View
        style={[
          styles.inner,
          { backgroundColor: colors.card, borderRadius: radius },
          !noPadding && styles.padding,
          innerStyle,
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={activeOpacity}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  inner: { overflow: 'hidden' },
  padding: { padding: Spacing.card },
});
