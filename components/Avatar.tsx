import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradient, FontSize } from '@/constants/theme';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE_MAP: Record<AvatarSize, number> = { sm: 32, md: 48, lg: 72 };
const FONT_MAP: Record<AvatarSize, number> = { sm: 12, md: 18, lg: 28 };
const RING = 2;

interface AvatarProps {
  name?: string;
  uri?: string | null;
  size?: AvatarSize;
  bgColor?: string;
}

export default function Avatar({ name, uri, size = 'md', bgColor }: AvatarProps) {
  const dim = SIZE_MAP[size];
  const fontSize = FONT_MAP[size];
  const initial = name?.[0]?.toUpperCase() ?? '?';

  return (
    <LinearGradient
      colors={Gradient.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.ring, { width: dim + RING * 2, height: dim + RING * 2, borderRadius: (dim + RING * 2) / 2 }]}
    >
      <View style={[
        styles.inner,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: bgColor ?? 'rgba(255,46,138,0.18)',
        },
      ]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: dim, height: dim, borderRadius: dim / 2 }} />
        ) : (
          <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
  },
});
