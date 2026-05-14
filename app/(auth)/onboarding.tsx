import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dices, Zap, MessageCircle, Heart, Lock, Star, Flame, Gift } from 'lucide-react-native';
import { FontSize, Spacing, Radius } from '@/constants/theme';

const SLIDES = [
  {
    title: 'Play your way',
    subtitle: 'Fun, playful moments that bring you closer.',
    features: [
      { Icon: Dices, label: 'Roll', desc: 'Let chance start the moment.' },
      { Icon: Zap, label: 'Dare', desc: 'Challenge each other.' },
      { Icon: MessageCircle, label: 'Tell Me', desc: 'Ask what you really want to know.' },
    ],
  },
  {
    title: 'Stay connected',
    subtitle: 'Private moments shared only between you two.',
    features: [
      { Icon: MessageCircle, label: 'Chat', desc: 'Private chat just for two.' },
      { Icon: Lock, label: 'Vault', desc: 'Your private space together.' },
      { Icon: Star, label: 'Points', desc: 'Earn rewards for playing.' },
    ],
  },
  {
    title: 'Keep the spark',
    subtitle: 'Build habits that strengthen your bond.',
    features: [
      { Icon: Flame, label: 'Streaks', desc: 'Play together every day.' },
      { Icon: Gift, label: 'Rewards', desc: 'Unlock surprises for each other.' },
      { Icon: Star, label: 'Milestones', desc: 'Celebrate every little win.' },
    ],
  },
  {
    title: 'Just for you two',
    subtitle: 'Your relationship, your rules.',
    features: [
      { Icon: Heart, label: 'Pair Up', desc: 'Connect your accounts privately.' },
      { Icon: Lock, label: 'Private', desc: 'Only you two can see this.' },
      { Icon: Zap, label: 'Your vibe', desc: 'Customise everything for you.' },
    ],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Responsive sizing derived from screen dimensions
  const headingSize = Math.min(Math.round(SCREEN_WIDTH * 0.086), 36);
  const isShort = SCREEN_HEIGHT < 700;
  const iconSize = Math.round(Math.min(68, SCREEN_HEIGHT * 0.082));
  const cardGap = Math.max(8, Math.round(SCREEN_HEIGHT * 0.013));
  const cardVertPad = Math.max(10, Math.round(SCREEN_HEIGHT * 0.018));
  const iconSize28 = Math.round(iconSize * 0.41);
  // Top padding: safe area + breathing room, compressed on short screens
  const slidePaddingTop = insets.top + (isShort ? 44 : 56);
  const subtitleMb = isShort ? 12 : 20;
  const subtitleFontSize = isShort ? FontSize.sm : FontSize.body;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(idx);
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * (currentIndex + 1), animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      router.push('/(auth)/register');
    }
  };

  const handleSkip = () => router.push('/(auth)/register');

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#060406', '#0A060A', '#0E080E']}
        style={StyleSheet.absoluteFill}
      />

      <TouchableOpacity
        style={[styles.skipBtn, { top: insets.top + 14 }]}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {SLIDES.map((slide, slideIdx) => (
          <View key={slideIdx} style={[styles.slide, { width: SCREEN_WIDTH, paddingTop: slidePaddingTop }]}>
            {/* Vertical scroll inside each slide as a safety net on tiny screens */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
              contentContainerStyle={styles.slideInner}
            >
              <Text style={[styles.slideTitle, { fontSize: headingSize }]}>{slide.title}</Text>
              <Text style={[styles.slideSub, { marginBottom: subtitleMb, fontSize: subtitleFontSize }]}>
                {slide.subtitle}
              </Text>

              <View style={[styles.featureList, { gap: cardGap }]}>
                {slide.features.map((feat, i) => (
                  <FeatureCard
                    key={i}
                    Icon={feat.Icon}
                    label={feat.label}
                    desc={feat.desc}
                    iconSize={iconSize}
                    iconInnerSize={iconSize28}
                    cardVertPad={cardVertPad}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + (isShort ? 12 : 24) }]}>
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <LinearGradient
            colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.nextGrad, { paddingVertical: isShort ? 15 : 19 }]}
          >
            <Text style={styles.nextLabel}>
              {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface FeatureCardProps {
  Icon: React.ComponentType<{ color: string; size: number; strokeWidth: number }>;
  label: string;
  desc: string;
  iconSize: number;
  iconInnerSize: number;
  cardVertPad: number;
}

function FeatureCard({ Icon, label, desc, iconSize, iconInnerSize, cardVertPad }: FeatureCardProps) {
  return (
    <View style={[cardStyles.card, { paddingVertical: cardVertPad }]}>
      <View style={[
        cardStyles.iconOuter,
        { width: iconSize, height: iconSize, borderRadius: iconSize / 2 },
      ]}>
        <LinearGradient
          colors={['rgba(255,100,40,0.18)', 'rgba(255,46,138,0.12)']}
          style={[cardStyles.iconCircle, { borderRadius: iconSize / 2 }]}
        >
          <Icon color="#FF6030" size={iconInnerSize} strokeWidth={1.5} />
        </LinearGradient>
      </View>

      <View style={cardStyles.textWrap}>
        <Text style={cardStyles.label}>{label}</Text>
        <Text style={cardStyles.desc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060406',
  },
  skipBtn: {
    position: 'absolute',
    right: Spacing.xl,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'flex-start',
  },
  slide: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  slideInner: {
    flexGrow: 1,
  },
  slideTitle: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  slideSub: {
    color: 'rgba(255,255,255,0.46)',
    fontFamily: 'Inter-Regular',
    lineHeight: 24,
    textAlign: 'center',
  },
  featureList: {
    // gap set inline
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  dotActive: {
    backgroundColor: '#FF5A3D',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
  },
  nextBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  nextGrad: {
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  nextLabel: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(20,12,18,0.95)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: Spacing.md,
  },
  iconOuter: {
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF5A3D',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 8,
  },
  iconCircle: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  label: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  desc: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
});
