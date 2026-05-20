import React from 'react';
import { Text, TextProps } from 'react-native';

export default function AppText({ allowFontScaling = true, maxFontSizeMultiplier = 1.5, ...props }: TextProps) {
  return <Text allowFontScaling={allowFontScaling} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}
