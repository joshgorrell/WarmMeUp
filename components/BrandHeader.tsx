import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import WarmupLogo from './WarmupLogo';
import WarmupWordmark from './WarmupWordmark';
import Avatar from './Avatar';
import { useWeather } from '@/hooks/useWeather';
import { useAuth } from '@/context/AuthContext';
import { Spacing } from '@/constants/theme';

interface BrandHeaderProps {
  rightSlot?: React.ReactNode;
  avatarName?: string;
  avatarUri?: string | null;
  onAvatarPress?: () => void;
}

export default function BrandHeader({
  rightSlot,
  avatarName,
  avatarUri,
  onAvatarPress,
}: BrandHeaderProps) {
  const router = useRouter();
  const { profile, settings } = useAuth();
  const temp = useWeather(settings?.weather_lat, settings?.weather_lon, profile?.id);

  return (
    <View style={styles.container}>
      {/* Left: logo + wordmark */}
      <View style={styles.left}>
        <WarmupLogo size={28} />
        <WarmupWordmark size={13} style={styles.wordmark} />
      </View>

      {/* Right: temp + avatar or custom slot */}
      <View style={styles.right}>
        <TouchableOpacity onPress={() => router.replace('/weather')} activeOpacity={0.7} style={styles.tempBtn} disabled={!temp}>
          <AppText style={styles.tempText}>{temp}</AppText>
        </TouchableOpacity>
        {rightSlot ?? (
          avatarName && onAvatarPress ? (
            <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.85}>
              <Avatar name={avatarName} uri={avatarUri} size="sm" bgColor="rgba(255,46,138,0.20)" />
            </TouchableOpacity>
          ) : null
        )}
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
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordmark: {
    marginTop: 1,
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
