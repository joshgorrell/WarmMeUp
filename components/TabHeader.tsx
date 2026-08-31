import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, usePathname } from 'expo-router';
import Avatar from './Avatar';
import WarmupLogo from './WarmupLogo';
import WarmupWordmark from './WarmupWordmark';
import { useAuth } from '@/context/AuthContext';
import { useWeather } from '@/hooks/useWeather';
import { logDebugEvent } from '@/lib/debugLog';
import { Spacing } from '@/constants/theme';

interface TabHeaderProps {
  title?: string;
  rightSlot?: React.ReactNode;
}

export default function TabHeader({ rightSlot }: TabHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, settings } = useAuth();
  const privacyMode = settings?.stealth_mode_enabled ?? false;
  const temp = useWeather(
    privacyMode ? settings?.weather_lat : null,
    privacyMode ? settings?.weather_lon : null,
    privacyMode ? profile?.id : undefined,
  );

  return (
    <View style={styles.container}>
      {/* Left: logo + wordmark */}
      <TouchableOpacity
        onPress={() => {
          logDebugEvent('HEADER_HOME_PRESSED', {
            currentRoute: pathname,
            targetRoute: '/(app)/(tabs)',
            method: 'replace',
          });
          try {
            router.replace('/(app)/(tabs)');
          } catch (e: any) {
            logDebugEvent('HEADER_HOME_PRESSED_ERROR', { error: e?.message ?? 'unknown' });
            try { router.replace('/'); } catch {}
          }
        }}
        // Emergency debug access: 5-second hold on logo. Intentionally open to all users
        // as a support lifeline — the debug screen shows only safe/sanitized content to non-super-admins.
        onLongPress={() => router.push('/debug')}
        delayLongPress={5000}
        activeOpacity={0.7}
        style={styles.brand}
      >
        <WarmupLogo size={28} />
        <WarmupWordmark size={13} />
      </TouchableOpacity>

      {/* Center: temp shortcut (Privacy Mode only) — isolated from avatar */}
      <View style={styles.center}>
        {privacyMode && (
          <TouchableOpacity
            onPress={() => router.replace('/weather')}
            activeOpacity={0.7}
            style={styles.tempBtn}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <AppText style={styles.tempText}>{temp}</AppText>
          </TouchableOpacity>
        )}
      </View>

      {/* Right: optional slot + avatar — no temp sibling */}
      <View style={styles.right}>
        {rightSlot}
        <TouchableOpacity onPress={() => router.push('/(app)/account')} activeOpacity={0.85}>
          <Avatar name={profile?.display_name ?? undefined} uri={profile?.avatar_url} size="sm" bgColor="rgba(255,46,138,0.20)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  center: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  tempBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
  },
});
