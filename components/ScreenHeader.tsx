import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import WarmupLogo from './WarmupLogo';
import WarmupWordmark from './WarmupWordmark';
import { useTheme } from '@/context/ThemeContext';
import { logDebugEvent } from '@/lib/debugLog';
import { Spacing, Radius } from '@/constants/theme';

interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export default function ScreenHeader({ onBack, rightSlot }: ScreenHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const handleHomePres = () => {
    logDebugEvent('HEADER_HOME_PRESSED', {
      currentRoute: pathname,
      targetRoute: '/(app)/(tabs)',
      method: 'replace',
    });
    try {
      router.replace('/(app)/(tabs)');
    } catch (e: any) {
      logDebugEvent('HEADER_HOME_PRESSED_ERROR', { error: e?.message ?? 'unknown' });
      try { router.navigate('/(app)/(tabs)'); } catch {}
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.md }]}>
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.8}
        style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: colors.borderSubtle }]}
      >
        <ArrowLeft color={colors.text} size={20} strokeWidth={2} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleHomePres}
        activeOpacity={0.7}
        style={styles.brand}
      >
        <WarmupLogo size={26} />
        <WarmupWordmark size={12} />
      </TouchableOpacity>

      <View style={styles.right}>
        {rightSlot}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screen,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  right: {
    width: 42,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
});
