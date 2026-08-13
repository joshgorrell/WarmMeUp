import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppText from '@/components/AppText';
import { FontSize, Radius, Spacing } from '@/constants/theme';

interface AvatarPreviewMockProps {
  displayName?: string;
  avatarUri?: string | null;
  exampleUri?: string;
}

export default function AvatarPreviewMock({
  displayName,
  avatarUri,
  exampleUri,
}: AvatarPreviewMockProps) {
  const name = displayName?.trim() || 'You';
  const initial = name[0]?.toUpperCase() ?? '?';
  const showUri = avatarUri ?? exampleUri ?? null;

  const avatarDim = 36;
  const ringDim = avatarDim + 2 * 2;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <View style={styles.labelDot} />
        <AppText style={styles.labelText}>How it looks in chat</AppText>
      </View>

      <View style={styles.mockCard}>
        {/* Mock chat header */}
        <View style={styles.mockHeader}>
          <LinearGradient
            colors={['#FFB347', '#FF5A3D', '#FF3D4F', '#FF2E8A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.mockAvatarRing, { width: ringDim, height: ringDim, borderRadius: ringDim / 2 }]}
          >
            <View style={[styles.mockAvatarInner, { width: avatarDim, height: avatarDim, borderRadius: avatarDim / 2 }]}>
              {showUri ? (
                <Image source={{ uri: showUri }} style={{ width: avatarDim, height: avatarDim, borderRadius: avatarDim / 2 }} resizeMode="cover" />
              ) : (
                <AppText style={styles.mockAvatarInitial}>{initial}</AppText>
              )}
            </View>
          </LinearGradient>
          <View style={styles.mockHeaderNameWrap}>
            <AppText style={styles.mockHeaderName} numberOfLines={1} ellipsizeMode="tail">{name}</AppText>
            <AppText style={styles.mockHeaderStatus}>Active now</AppText>
          </View>
        </View>

        <View style={styles.mockDivider} />

        {/* Mock message bubbles */}
        <View style={styles.mockBubbleRow}>
          <View style={styles.mockBubbleLeft}>
            <AppText style={styles.mockBubbleText}>Can't wait to see you tonight 😘</AppText>
          </View>
        </View>
        <View style={styles.mockBubbleRowRight}>
          <View style={styles.mockBubbleRight}>
            <AppText style={styles.mockBubbleTextRight}>Counting down the minutes 💕</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF8A3D',
  },
  labelText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  mockCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  mockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mockAvatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mockAvatarInner: {
    backgroundColor: 'rgba(255,46,138,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mockAvatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  mockHeaderNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  mockHeaderName: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: -0.2,
  },
  mockHeaderStatus: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  mockDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: Spacing.sm,
  },
  mockBubbleRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  mockBubbleLeft: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  mockBubbleText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  mockBubbleRowRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  mockBubbleRight: {
    backgroundColor: 'rgba(255,46,138,0.20)',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  mockBubbleTextRight: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
});
