import React from 'react';
import { Image, View } from 'react-native';

interface WarmupLogoProps {
  size?: number;
}

const LOGO_SOURCE = require('@/assets/images/image_(3).png');

export default function WarmupLogo({ size = 80 }: WarmupLogoProps) {
  const radius = size * 0.22;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: 'rgba(255,46,138,0.10)', overflow: 'hidden' }}>
      <Image source={LOGO_SOURCE} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}
