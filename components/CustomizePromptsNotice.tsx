import React, { useCallback, useState } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import AppText from '@/components/AppText';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { FontSize, Spacing } from '@/constants/theme';

interface Props {
  onPress: () => void;
  accentColor?: string;
  feature?: 'dice' | 'dare';
}

export default function CustomizePromptsNotice({ onPress, accentColor = '#FFB347', feature }: Props) {
  const { colors } = useTheme();
  const { couple } = useAuth();
  const pathname = usePathname();
  const inferredFeature: 'dice' | 'dare' | null =
    feature ?? (pathname.includes('/dice') ? 'dice' : pathname.includes('/dare') ? 'dare' : null);
  const [hasCustomPrompt, setHasCustomPrompt] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!couple?.id || !inferredFeature) {
        setHasCustomPrompt(null);
        return;
      }

      let cancelled = false;
      const table = inferredFeature === 'dice' ? 'dice_prompts' : 'dare_prompts';

      (async () => {
        const { data, error } = await supabase
          .from(table)
          .select('id')
          .eq('couple_id', couple.id)
          .eq('is_default', false)
          .eq('is_active', true)
          .limit(1);

        if (!cancelled && !error) {
          setHasCustomPrompt((data?.length ?? 0) > 0);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [couple?.id, inferredFeature]),
  );

  if (hasCustomPrompt === true) return null;

  const featureLabel = inferredFeature === 'dare' ? 'Dare' : 'Dice';

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
        <AppText style={[styles.text, { color: colors.textSecondary }]} numberOfLines={2}>
          Customize your {featureLabel} prompts to make them feel like the two of you.
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