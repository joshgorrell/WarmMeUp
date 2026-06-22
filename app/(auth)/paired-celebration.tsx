import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Heart } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

export default function PairedCelebrationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { partnerName } = useLocalSearchParams<{ partnerName?: string }>();
  const insets = useSafeAreaInsets();
  const { width, isTablet, contentMaxWidth } = useLayout();

  const scale1 = useSharedValue(0);
  const scale2 = useSharedValue(0);
  const scaleMain = useSharedValue(0);
  const opacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentTranslate = useSharedValue(30);

  useEffect(() => {
    scale1.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 150 }));
    scale2.value = withDelay(250, withSpring(1, { damping: 12, stiffness: 150 }));
    scaleMain.value = withDelay(180, withSpring(1, { damping: 10, stiffness: 120 }));
    opacity.value = withDelay(150, withTiming(1, { duration: 400 }));
    contentOpacity.value = withDelay(600, withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) }));
    contentTranslate.value = withDelay(600, withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) }));

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    if (user) {
      supabase
        .from('user_settings')
        .update({ celebration_seen: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .then(() => {});
    }
  }, [user?.id]);

  const heart1Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale1.value }],
    opacity: opacity.value,
  }));
  const heart2Style = useAnimatedStyle(() => ({
    transform: [{ scale: scale2.value }],
    opacity: opacity.value,
  }));
  const heartMainStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleMain.value }],
    opacity: opacity.value,
  }));
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslate.value }],
  }));

  const heartSize = Math.min(Math.round(width * 0.22), 96);
  const heartMainSize = Math.min(Math.round(width * 0.32), 140);

  const handleContinue = () => {
    router.replace({ pathname: '/(auth)/onboarding', params: { paired: '1' } });
  };

  const handleSkip = () => {
    router.replace('/(app)/(tabs)');
  };

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0A0408', '#120608', '#0A0408']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.glowTop, { width: width * 0.8, height: width * 0.8 }]} />
      <View style={[styles.glowBottom, { width: width * 0.6, height: width * 0.6 }]} />

      <TouchableOpacity
        style={[styles.skipBtn, { top: insets.top + 14 }]}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <AppText style={styles.skipText}>Skip</AppText>
      </TouchableOpacity>

      <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 }, centerStyle]}>
        {/* Heart graphic cluster */}
        <View style={styles.heartCluster}>
          <Animated.View style={[styles.heartOrbit, styles.heartLeft, heart1Style]}>
            <LinearGradient
              colors={['rgba(255,90,61,0.20)', 'rgba(255,46,138,0.14)']}
              style={[styles.heartCircle, { width: heartSize, height: heartSize, borderRadius: heartSize / 2 }]}
            >
              <Heart color="#FF5A3D" size={heartSize * 0.45} strokeWidth={1.5} fill="rgba(255,90,61,0.3)" />
            </LinearGradient>
          </Animated.View>

          <Animated.View style={[styles.heartOrbit, styles.heartRight, heart2Style]}>
            <LinearGradient
              colors={['rgba(255,46,138,0.20)', 'rgba(255,90,61,0.14)']}
              style={[styles.heartCircle, { width: heartSize, height: heartSize, borderRadius: heartSize / 2 }]}
            >
              <Heart color="#FF2E8A" size={heartSize * 0.45} strokeWidth={1.5} fill="rgba(255,46,138,0.3)" />
            </LinearGradient>
          </Animated.View>

          <Animated.View style={[styles.heartMain, heartMainStyle]}>
            <LinearGradient
              colors={['rgba(255,115,0,0.25)', 'rgba(255,46,138,0.22)']}
              style={[
                styles.heartCircle,
                styles.heartMainCircle,
                { width: heartMainSize, height: heartMainSize, borderRadius: heartMainSize / 2 },
              ]}
            >
              <Heart
                color="#FF4060"
                size={heartMainSize * 0.5}
                strokeWidth={1.5}
                fill="rgba(255,64,96,0.45)"
              />
            </LinearGradient>
          </Animated.View>
        </View>

        {/* Content */}
        <Animated.View style={[styles.content, contentAnimStyle]}>
          <AppText style={styles.heading}>You're connected!</AppText>
          {partnerName ? (
            <AppText style={styles.sub}>
              You and <AppText style={styles.partnerName} numberOfLines={1} ellipsizeMode="tail">{partnerName}</AppText> are now paired.{'\n'}
              Your private space is ready.
            </AppText>
          ) : (
            <AppText style={styles.sub}>
              You and your partner are now paired.{'\n'}
              Your private space is ready.
            </AppText>
          )}

          <View style={styles.divider} />

          <View style={styles.featureRow}>
            {[
              { emoji: '🎲', label: 'Roll together' },
              { emoji: '🔥', label: 'Build streaks' },
              { emoji: '🔒', label: 'Share privately' },
            ].map((f) => (
              <View key={f.label} style={styles.featureChip}>
                <AppText style={styles.featureEmoji}>{f.emoji}</AppText>
                <AppText style={styles.featureLabel}>{f.label}</AppText>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.ctaBtn} onPress={handleContinue} activeOpacity={0.85}>
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGrad}
            >
              <AppText style={styles.ctaLabel}>Let's go</AppText>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0408',
  },
  glowTop: {
    position: 'absolute',
    top: -160,
    alignSelf: 'center',
    borderRadius: 9999,
    backgroundColor: 'rgba(255,60,80,0.07)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    alignSelf: 'center',
    borderRadius: 9999,
    backgroundColor: 'rgba(255,46,138,0.05)',
  },
  skipBtn: {
    position: 'absolute',
    right: Spacing.xl,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  heartCluster: {
    width: 260,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    position: 'relative',
  },
  heartOrbit: {
    position: 'absolute',
  },
  heartLeft: {
    left: 0,
    top: 40,
  },
  heartRight: {
    right: 0,
    top: 40,
  },
  heartMain: {
    zIndex: 2,
  },
  heartCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  heartMainCircle: {
    borderColor: 'rgba(255,64,96,0.25)',
    shadowColor: '#FF4060',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 16,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  heading: {
    color: '#fff',
    fontSize: FontSize.display ?? 32,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 14,
  },
  sub: {
    color: 'rgba(255,255,255,0.54)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 26,
  },
  partnerName: {
    color: '#FF7A45',
    fontFamily: 'Inter-SemiBold',
  },
  divider: {
    width: 48,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,90,61,0.35)',
    marginVertical: 24,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 36,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  featureEmoji: {
    fontSize: 14,
  },
  featureLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Medium',
  },
  ctaBtn: {
    width: '88%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  ctaGrad: {
    paddingVertical: 17,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  ctaLabel: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
});
