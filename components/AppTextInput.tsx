import React from 'react';
import { TextInput, TextInputProps } from 'react-native';

export default function AppTextInput({ allowFontScaling = true, maxFontSizeMultiplier = 1.5, ...props }: TextInputProps) {
  return <TextInput allowFontScaling={allowFontScaling} maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}
