import React, { useState } from 'react';
import {
  TextInput as RNTextInput, View, Text, StyleSheet, TextInputProps, ViewStyle,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Radius } from '@/constants/theme';

interface TextareaProps extends TextInputProps {
  containerStyle?: ViewStyle;
  label?: string;
  charLimit?: number;
  minHeight?: number;
}

export default function Textarea({
  containerStyle,
  label,
  charLimit,
  minHeight = 120,
  style,
  ...rest
}: TextareaProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const len = typeof rest.value === 'string' ? rest.value.length : 0;

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      )}
      <RNTextInput
        {...rest}
        multiline
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: focused ? 'rgba(255,90,61,0.65)' : colors.borderSubtle,
            color: colors.text,
            minHeight,
          },
          style,
        ]}
        textAlignVertical="top"
      />
      {charLimit && (
        <Text style={[styles.charCount, { color: colors.textMuted }]}>
          {len}/{charLimit}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: FontSize.label,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  charCount: {
    fontSize: FontSize.tiny,
    fontFamily: 'Inter-Regular',
    textAlign: 'right',
    marginTop: 4,
  },
});
