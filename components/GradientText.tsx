import React from 'react';
import { Text, TextStyle, Platform, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLG, Stop, Text as SvgText } from 'react-native-svg';
import { Gradient } from '@/constants/theme';

interface GradientTextProps {
  children: string;
  style?: TextStyle;
}

export default function GradientText({ children, style }: GradientTextProps) {
  const fontSize = (style?.fontSize as number) ?? 16;
  const fontFamily = (style?.fontFamily as string) ?? 'Inter-Bold';
  const letterSpacing = (style?.letterSpacing as number) ?? 0;

  if (Platform.OS === 'web') {
    return (
      <Text
        style={[
          style,
          {
            backgroundImage: `linear-gradient(90deg, ${Gradient.primary[0]}, ${Gradient.primary[3]})`,
            color: 'transparent',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          } as any,
        ]}
      >
        {children}
      </Text>
    );
  }

  const width = Math.ceil(fontSize * 0.62 * children.length + letterSpacing * children.length + 4);
  const height = Math.ceil(fontSize * 1.3);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLG id="gt" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={Gradient.primary[0]} />
            <Stop offset="1" stopColor={Gradient.primary[3]} />
          </SvgLG>
        </Defs>
        <SvgText
          x={0}
          y={fontSize}
          fill="url(#gt)"
          fontSize={fontSize}
          fontFamily={fontFamily}
          fontWeight="700"
          letterSpacing={letterSpacing}
        >
          {children}
        </SvgText>
      </Svg>
    </View>
  );
}
