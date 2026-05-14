import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import WarmupLogo from './WarmupLogo';
import WarmupWordmark from './WarmupWordmark';
import Avatar from './Avatar';
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
  return (
    <View style={styles.container}>
      {/* Left: logo + wordmark */}
      <View style={styles.left}>
        <WarmupLogo size={28} />
        <WarmupWordmark size={13} style={styles.wordmark} />
      </View>

      {/* Right: avatar or custom slot */}
      {(avatarName || rightSlot) && (
        <View style={styles.right}>
          {rightSlot ?? (
            avatarName && onAvatarPress ? (
              <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.85}>
                <Avatar name={avatarName} uri={avatarUri} size="sm" bgColor="rgba(255,46,138,0.20)" />
              </TouchableOpacity>
            ) : null
          )}
        </View>
      )}
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
  right: {},
});
