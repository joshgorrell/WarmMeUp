import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Avatar from './Avatar';
import WarmupLogo from './WarmupLogo';
import WarmupWordmark from './WarmupWordmark';
import { useAuth } from '@/context/AuthContext';
import { Spacing } from '@/constants/theme';

interface TabHeaderProps {
  title?: string;
  rightSlot?: React.ReactNode;
}

export default function TabHeader({ rightSlot }: TabHeaderProps) {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <WarmupLogo size={28} />
        <WarmupWordmark size={13} />
      </View>
      <View style={styles.right}>
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
});
