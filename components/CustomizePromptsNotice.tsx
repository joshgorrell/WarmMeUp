import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing } from '@/constants/theme';

interface Props {
  onPress: () => void;
  accentColor?: string;
}

export default function CustomizePromptsNotice({ onPress, accentColor = '#FFB347' }: Props) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.container, { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0A` }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Sparkles color={accentColor} size={15} strokeWidth={2} />
      <AppText style={[styles.text, { color: colors.textSecondary }]}>
        Want more prompts?{' '}
        <AppText style={[styles.link, { color: accentColor }]}>Customize your own</AppText>
        {' '}for even more fun.
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  text: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  link: {
    fontFamily: 'Inter-SemiBold',
  },
});
