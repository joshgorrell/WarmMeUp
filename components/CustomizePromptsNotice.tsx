import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Sparkles, ChevronRight } from 'lucide-react-native';
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
      <View style={[styles.iconWrap, { backgroundColor: `${accentColor}16` }]}>
        <Sparkles color={accentColor} size={17} strokeWidth={2} />
      </View>
      <View style={styles.copy}>
        <AppText style={[styles.title, { color: colors.text }]}>Make it more yours</AppText>
        <AppText style={[styles.text, { color: colors.textSecondary }]} numberOfLines={1}>
          Customize prompts for even more fun.
        </AppText>
      </View>
      <ChevronRight color={accentColor} size={17} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginTop: Spacing.lg,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 18,
  },
  text: {
    marginTop: 1,
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
  },
});
