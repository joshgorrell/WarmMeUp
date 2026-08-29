import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useRouter } from 'expo-router';

interface HomeMiniCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
  style?: ViewStyle;
}

export default function HomeMiniCard({
  icon,
  label,
  value,
  onPress,
  style,
}: HomeMiniCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const displayLabel = label === 'Day streak' ? 'Weekly Streak' : label;
  const isUnsetTogether = displayLabel === 'Together' && value === '—';
  const displayValue = isUnsetTogether ? 'Set date' : value;
  const keepLabelOnOneLine = displayLabel === 'Send love' || displayLabel === 'Send Love' || displayLabel === 'Together';

  const handlePress = () => {
    if (isUnsetTogether) {
      router.push({ pathname: '/(app)/account', params: { tab: 'profile' } });
      return;
    }
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.borderSubtle },
        style,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
        {icon}
      </View>
      <View style={styles.textWrap}>
        <AppText style={[styles.value, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>
          {displayValue}
        </AppText>
        <AppText
          style={[styles.label, { color: colors.text }]}
          numberOfLines={keepLabelOnOneLine ? 1 : 2}
          adjustsFontSizeToFit={keepLabelOnOneLine}
          minimumFontScale={0.82}
        >
          {displayLabel}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 72,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrap: {
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  value: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    lineHeight: 19,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 14,
  },
});
