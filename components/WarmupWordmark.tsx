import React from 'react';
import { View, Text, Platform, StyleSheet, TextStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Gradient } from '@/constants/theme';

interface WarmupWordmarkProps {
  style?: TextStyle;
  size?: number;
}

const WORD = 'WARM ME UP';

export default function WarmupWordmark({ style, size = 13 }: WarmupWordmarkProps) {
  const letterSpacing = size * 0.35;
  const charWidth = size * 0.65 + letterSpacing;
  const width = Math.ceil(charWidth * WORD.length);
  const height = Math.ceil(size * 1.2);
  const cx = Math.ceil(width / 2);

  if (Platform.OS === 'web') {
    return (
      <Text
        style={[
          styles.web,
          {
            fontSize: size,
            letterSpacing,
            backgroundImage: `linear-gradient(90deg, ${Gradient.primary[0]} 0%, ${Gradient.primary[1]} 35%, ${Gradient.primary[2]} 62%, ${Gradient.primary[3]} 100%)`,
          } as any,
          style,
        ]}
      >
        {WORD}
      </Text>
    );
  }

  return (
    <View style={[{ width, height, alignSelf: 'center' }, style as any]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="wm" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={Gradient.primary[0]} />
            <Stop offset="0.35" stopColor={Gradient.primary[1]} />
            <Stop offset="0.62" stopColor={Gradient.primary[2]} />
            <Stop offset="1" stopColor={Gradient.primary[3]} />
          </LinearGradient>
        </Defs>
        <SvgText
          x={cx}
          y={size}
          textAnchor="middle"
          fill="url(#wm)"
          fontSize={size}
          fontFamily="Inter-SemiBold"
          fontWeight="600"
          letterSpacing={letterSpacing}
        >
          {WORD}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  web: {
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
    color: 'transparent',
    textTransform: 'uppercase',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as any,
});
