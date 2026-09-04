import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloudOff, Lock } from 'lucide-react-native';
import AppText from '@/components/AppText';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';
import { FontSize, Spacing, Radius } from '@/constants/theme';

interface OfflineScreenProps {
  checking: boolean;
  onTryAgain: () => void;
}

export default function OfflineScreen({ checking, onTryAgain }: OfflineScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.4, 160);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#05040A', '#0A0610', '#0D0710', '#100510']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Top-right pink light leak */}
      <LinearGradient
        colors={['rgba(255,46,138,0.08)', 'rgba(255,46,138,0.03)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.5 }}
        style={styles.leakTopRight}
        pointerEvents="none"
      />
      {/* Bottom-left amber light leak */}
      <LinearGradient
        colors={['rgba(255,138,61,0.06)', 'rgba(255,90,61,0.02)', 'transparent']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.6, y: 0.4 }}
        style={styles.leakBottomLeft}
        pointerEvents="none"
      />

      <View style={[styles.content, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Branding */}
        <View style={styles.brandWrap}>
          <WarmupLogo size={logoW} />
          <WarmupWordmark size={16} />
        </View>

        {/* Centered offline icon + copy */}
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <CloudOff color="#FF2E8A" size={56} strokeWidth={1.5} />
          </View>

          <AppText style={styles.heading}>You&apos;re Offline</AppText>

          <AppText style={styles.primaryCopy}>
            Warm Me Up requires an online connection to keep your shared content up to date.
          </AppText>

          <AppText style={styles.secondaryCopy}>
            Both partners can add, delete, burn, or change shared photos, videos, messages, and more at any time. To respect those changes, Warm Me Up doesn&apos;t provide offline access to shared content.
          </AppText>

          <TouchableOpacity
            style={[styles.tryAgainBtn, checking && { opacity: 0.65 }]}
            onPress={onTryAgain}
            activeOpacity={0.82}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <AppText style={styles.tryAgainText}>Try Again</AppText>
            )}
          </TouchableOpacity>
        </View>

        {/* Privacy message */}
        <View style={styles.privacyWrap}>
          <Lock color="rgba(255,255,255,0.3)" size={13} strokeWidth={2} />
          <AppText style={styles.privacyLabel}>Your privacy is important.</AppText>
          <AppText style={styles.privacySub}>No shared content is available while offline.</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05040A',
  },
  leakTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '70%',
    height: '45%',
    maxHeight: 400,
  },
  leakBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '65%',
    height: '40%',
    maxHeight: 360,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
  },
  brandWrap: {
    alignItems: 'center',
    gap: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    maxWidth: 380,
    width: '100%',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,46,138,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  heading: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    lineHeight: 34,
  },
  primaryCopy: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 23,
  },
  secondaryCopy: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  tryAgainBtn: {
    backgroundColor: '#FF2E8A',
    borderRadius: Radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    minHeight: 48,
  },
  tryAgainText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  privacyWrap: {
    alignItems: 'center',
    gap: 3,
  },
  privacyLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Medium',
  },
  privacySub: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
  },
});
