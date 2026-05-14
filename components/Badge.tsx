import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradient, FontSize } from '@/constants/theme';

type BadgeVariant = 'active' | 'new' | 'protected' | 'waiting' | 'accepted' | 'default';

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; border: string; text: string }> = {
  active: { bg: 'rgba(255,46,138,0.18)', border: 'rgba(255,46,138,0.50)', text: '#FF2E8A' },
  new: { bg: 'rgba(255,179,71,0.18)', border: 'rgba(255,179,71,0.50)', text: '#FFB347' },
  protected: { bg: 'rgba(105,167,255,0.15)', border: 'rgba(105,167,255,0.40)', text: '#69A7FF' },
  waiting: { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.22)', text: 'rgba(255,255,255,0.65)' },
  accepted: { bg: 'rgba(51,209,122,0.15)', border: 'rgba(51,209,122,0.40)', text: '#33D17A' },
  default: { bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.18)', text: 'rgba(255,255,255,0.65)' },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  gradientBorder?: boolean;
}

export default function Badge({ label, variant = 'default', gradientBorder = false }: BadgeProps) {
  const c = VARIANT_COLORS[variant];

  if (gradientBorder) {
    return (
      <LinearGradient
        colors={Gradient.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientWrap}
      >
        <View style={[styles.inner, { backgroundColor: c.bg }]}>
          <Text style={[styles.label, { color: c.text }]}>{label}</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.plain, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gradientWrap: {
    borderRadius: 999,
    padding: 1,
  },
  inner: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  plain: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  label: {
    fontSize: FontSize.tiny,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.3,
  },
});
