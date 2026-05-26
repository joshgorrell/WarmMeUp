import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import Avatar from './Avatar';
import WarmupLogo from './WarmupLogo';
import WarmupWordmark from './WarmupWordmark';
import { useAuth } from '@/context/AuthContext';
import { useWeather } from '@/hooks/useWeather';
import { Spacing } from '@/constants/theme';

interface TabHeaderProps {
  title?: string;
  rightSlot?: React.ReactNode;
}

export default function TabHeader({ rightSlot }: TabHeaderProps) {
  const router = useRouter();
  const { profile, settings } = useAuth();
  const privacyMode = settings?.stealth_mode_enabled ?? false;
  const temp = useWeather(
    privacyMode ? settings?.weather_lat : null,
    privacyMode ? settings?.weather_lon : null,
    privacyMode ? profile?.id : undefined,
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.push('/(app)/(tabs)/')} activeOpacity={0.7} style={styles.brand}>
        <WarmupLogo size={28} />
        <WarmupWordmark size={13} />
      </TouchableOpacity>
      <View style={styles.right}>
        {privacyMode && (
          <TouchableOpacity onPress={() => router.replace('/weather')} activeOpacity={0.7} style={styles.tempBtn}>
            <AppText style={styles.tempText}>{temp}</AppText>
          </TouchableOpacity>
        )}
        {rightSlot}
        <TouchableOpacity onPress={() => router.push('/(app)/account')} activeOpacity={0.85}>
          <Avatar name={profile?.display_name} uri={profile?.avatar_url} size="sm" bgColor="rgba(255,46,138,0.20)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screen,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tempBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tempText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.2,
  },
});
