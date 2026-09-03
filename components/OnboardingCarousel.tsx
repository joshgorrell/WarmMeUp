import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewToken,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import {
  BellOff,
  ChevronRight,
  Dices,
  EyeOff,
  Flame,
  Gift,
  Heart,
  Image as ImageIcon,
  Lock,
  Mic,
  Shield,
  UserPlus,
  Zap,
} from 'lucide-react-native';
import AppText from '@/components/AppText';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';

export type OnboardingMode = 'preview' | 'post-auth';
export type OnboardingFinishAction = 'get-started' | 'invite-partner';

interface Props {
  mode: OnboardingMode;
  onComplete: (action?: OnboardingFinishAction) => void;
}

type Slide = {
  key: string;
  eyebrow: string;
  headline: string;
  subtext: string;
  Visual: React.ComponentType;
};

const ACCENT = '#FF2E8A';
const ORANGE = '#FF7A3D';
const CORAL = '#FF5A3D';

// ─── Shared visual shell ─────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.visualShell}>
      <LinearGradient
        colors={['rgba(255,122,61,0.10)', 'rgba(255,46,138,0.06)', 'rgba(0,0,0,0)']}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

// ─── Slide 1: Welcome ────────────────────────────────────────────────────────

function VisualWelcome() {
  return (
    <Shell>
      <View style={styles.welcomeGlow} />
      <View style={styles.welcomeRing}>
        <WarmupLogo size={88} />
      </View>
      <View style={styles.wordmarkWrap}>
        <WarmupWordmark size={16} />
      </View>
      <View style={styles.welcomeConnection}>
        <View style={[styles.welcomeDot, { backgroundColor: 'rgba(255,122,61,0.15)', borderColor: 'rgba(255,122,61,0.4)' }]}>
          <AppText style={styles.welcomeDotText}>YOU</AppText>
        </View>
        <View style={styles.welcomeLine}>
          <LinearGradient
            colors={[ORANGE, ACCENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.welcomeHeartNode}>
            <Heart size={16} color="#fff" fill="#fff" />
          </View>
        </View>
        <View style={[styles.welcomeDot, { backgroundColor: 'rgba(255,46,138,0.15)', borderColor: 'rgba(255,46,138,0.45)' }]}>
          <Heart size={22} color="#fff" fill="#fff" />
        </View>
      </View>
    </Shell>
  );
}

// ─── Slide 2: Chat ───────────────────────────────────────────────────────────

function VisualChat() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <Shell>
      <View style={styles.chatCard}>
        <View style={styles.chatHeader}>
          <View style={styles.chatAvatar}>
            <Heart size={14} color="#fff" fill="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.chatName}>Your person</AppText>
            <AppText style={styles.chatStatus}>private chat</AppText>
          </View>
          <Lock size={15} color="rgba(255,255,255,0.45)" />
        </View>
        <View style={styles.chatBody}>
          <View style={[styles.chatBubble, styles.chatBubbleLeft]}>
            <AppText style={styles.chatBubbleText}>Thinking about you...</AppText>
          </View>
          <View style={[styles.chatBubble, styles.chatBubbleRight]}>
            <AppText style={styles.chatBubbleText}>Good. You should be.</AppText>
          </View>
          <Animated.View
            style={[styles.chatMediaTile, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
          >
            <EyeOff size={22} color="#fff" />
            <AppText style={styles.chatMediaLabel}>Tap to reveal</AppText>
          </Animated.View>
          <View style={[styles.chatBubble, styles.chatBubbleLeft, styles.voiceBubble]}>
            <Mic size={14} color={ORANGE} />
            <View style={styles.voiceWave}>
              {[8, 14, 10, 18, 12, 16, 8].map((h, i) => (
                <View key={i} style={[styles.voiceBar, { height: h }]} />
              ))}
            </View>
            <AppText style={styles.voiceTime}>0:08</AppText>
          </View>
        </View>
      </View>
    </Shell>
  );
}

// ─── Slide 3: Vault ──────────────────────────────────────────────────────────

function VisualVault() {
  const revealAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(revealAnim, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }).start();
  }, [revealAnim]);

  return (
    <Shell>
      <View style={styles.vaultCard}>
        <View style={styles.vaultHeader}>
          <View>
            <AppText style={styles.vaultTitle}>Vault</AppText>
            <AppText style={styles.vaultSubtitle}>just yours + your partner's</AppText>
          </View>
          <Lock size={18} color={ACCENT} />
        </View>
        <View style={styles.vaultGrid}>
          <LinearGradient colors={['#3A2028', '#7A354F']} style={styles.vaultTile}>
            <ImageIcon size={24} color="rgba(255,255,255,0.8)" />
          </LinearGradient>
          <Animated.View
            style={[styles.vaultTileWrap, { opacity: Animated.add(0.35, Animated.multiply(revealAnim, 0.65)) }]}
          >
            <View style={[styles.vaultTile, styles.vaultTileBlur]}>
              <EyeOff size={24} color="#fff" />
              <AppText style={styles.vaultBlurLabel}>Blurred</AppText>
            </View>
          </Animated.View>
          <LinearGradient colors={['#2D233A', '#6D3D75']} style={styles.vaultTile}>
            <ImageIcon size={24} color="rgba(255,255,255,0.8)" />
          </LinearGradient>
          <LinearGradient colors={['#39251F', '#8B4B32']} style={styles.vaultTile}>
            <ImageIcon size={24} color="rgba(255,255,255,0.8)" />
          </LinearGradient>
        </View>
        <View style={styles.vaultCaption}>
          <Shield size={13} color={ORANGE} />
          <AppText style={styles.vaultCaptionText}>Not saved to your camera roll</AppText>
        </View>
      </View>
    </Shell>
  );
}

// ─── Slide 4: Burn Timer ─────────────────────────────────────────────────────

function VisualBurn() {
  const [seconds, setSeconds] = useState(873);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    const id = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [fadeAnim]);

  const ringSize = 120;
  const stroke = 6;
  const radius = (ringSize - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const totalSeconds = 900;
  const fraction = Math.min(1, Math.max(0, seconds / totalSeconds));
  const dashOffset = circumference * (1 - fraction);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeText = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <Shell>
      <Animated.View style={[styles.burnMedia, { opacity: fadeAnim }]}>
        <ImageIcon size={32} color="rgba(255,255,255,0.6)" />
        <View style={styles.burnBadge}>
          <Flame size={13} color="#fff" />
          <AppText style={styles.burnBadgeText}>BURNING</AppText>
        </View>
      </Animated.View>
      <View style={styles.burnTimerWrap}>
        <Svg width={ringSize} height={ringSize}>
          <Defs>
            <SvgGradient id="burnGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={ORANGE} />
              <Stop offset="1" stopColor={ACCENT} />
            </SvgGradient>
          </Defs>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke="url(#burnGrad)"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          />
        </Svg>
        <View style={styles.burnTimerCenter}>
          <AppText style={styles.burnTimerText}>{timeText}</AppText>
          <AppText style={styles.burnTimerLabel}>LEFT</AppText>
        </View>
      </View>
      <AppText style={styles.burnMicroCopy}>When the timer ends, it's gone.</AppText>
    </Shell>
  );
}

// ─── Slide 5: Playful (Dice + Dare + Wish) ───────────────────────────────────

function VisualPlay() {
  const diceRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(diceRotate, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }),
      Animated.timing(diceRotate, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [diceRotate]);

  const spin = diceRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '15deg'],
  });

  return (
    <Shell>
      <View style={styles.playRow}>
        <View style={styles.playCard}>
          <View style={styles.playIcon}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Dices size={26} color={ORANGE} />
            </Animated.View>
          </View>
          <AppText style={styles.playCardTitle}>Dice</AppText>
          <AppText style={styles.playCardSub}>Let chance choose.</AppText>
        </View>
        <View style={[styles.playCard, styles.playCardHero]}>
          <View style={[styles.playIcon, { backgroundColor: 'rgba(255,46,138,0.15)' }]}>
            <Zap size={26} color={ACCENT} />
          </View>
          <AppText style={styles.playCardTitle}>Dare</AppText>
          <AppText style={styles.playCardSub}>Challenge your partner.</AppText>
          <View style={styles.playLivePill}>
            <AppText style={styles.playLivePillText}>LIVE</AppText>
          </View>
        </View>
        <View style={styles.playCard}>
          <View style={styles.playIcon}>
            <Gift size={26} color="#FF7AAE" />
          </View>
          <AppText style={styles.playCardTitle}>Wish</AppText>
          <AppText style={styles.playCardSub}>Drop a little hint.</AppText>
        </View>
      </View>
    </Shell>
  );
}

// ─── Slide 6: Privacy + Stealth ──────────────────────────────────────────────

function VisualStealth() {
  return (
    <Shell>
      <View style={styles.weatherCard}>
        <View style={styles.weatherTop}>
          <AppText style={styles.weatherCity}>Topeka</AppText>
          <AppText style={styles.weatherCondition}>Mostly Clear</AppText>
        </View>
        <View style={styles.weatherMain}>
          <AppText style={styles.weatherTemp}>72°</AppText>
          <View style={styles.weatherSun} />
        </View>
        <AppText style={styles.weatherHL}>H: 78°   L: 61°</AppText>
      </View>
      <View style={styles.stealthBadge}>
        <EyeOff size={16} color={ACCENT} />
        <View style={{ flex: 1 }}>
          <AppText style={styles.stealthTitle}>Stealth Mode</AppText>
          <AppText style={styles.stealthSub}>
            Warm Me Up can look like weather at a glance.
          </AppText>
        </View>
      </View>
      <View style={styles.privacyRow}>
        <View style={styles.privacyPill}>
          <BellOff size={13} color={ORANGE} />
          <AppText style={styles.privacyPillText}>Discreet alerts</AppText>
        </View>
        <View style={styles.privacyPill}>
          <Shield size={13} color={ORANGE} />
          <AppText style={styles.privacyPillText}>Privacy controls</AppText>
        </View>
      </View>
    </Shell>
  );
}

// ─── Slide 7: Finish ─────────────────────────────────────────────────────────

function VisualFinish() {
  return (
    <Shell>
      <View style={styles.finishConnection}>
        <View style={[styles.finishCircle, styles.finishCircleA]}>
          <AppText style={styles.finishCircleText}>YOU</AppText>
        </View>
        <View style={styles.finishLine}>
          <LinearGradient
            colors={[ORANGE, ACCENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.finishHeartNode}>
            <Heart size={20} color="#fff" fill="#fff" />
          </View>
        </View>
        <View style={[styles.finishCircle, styles.finishCircleB]}>
          <Heart size={26} color="#fff" fill="#fff" />
        </View>
      </View>
      <View style={styles.finishInviteCard}>
        <UserPlus size={20} color={ACCENT} />
        <View style={{ flex: 1 }}>
          <AppText style={styles.finishInviteTitle}>One subscription. Both of you.</AppText>
          <AppText style={styles.finishInviteSub}>
            Invite your partner and make the space yours.
          </AppText>
        </View>
      </View>
    </Shell>
  );
}

// ─── Slide definitions ───────────────────────────────────────────────────────

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    eyebrow: 'WELCOME TO WARM ME UP',
    headline: 'Just for two.',
    subtext: 'A private app for playful couples — built around you and your partner.',
    Visual: VisualWelcome,
  },
  {
    key: 'chat',
    eyebrow: 'PRIVATE CHAT',
    headline: 'Your conversation. Just for two.',
    subtext: 'Chat, photos, videos and voice messages in one private space.',
    Visual: VisualChat,
  },
  {
    key: 'vault',
    eyebrow: 'VAULT + BLUR',
    headline: 'Keep the good stuff here.',
    subtext: 'Photos and videos, together — with Blur when you want discretion.',
    Visual: VisualVault,
  },
  {
    key: 'burn',
    eyebrow: 'BURN TIMER',
    headline: 'Send it. Burn it. Gone.',
    subtext: 'Put a timer on shared media. When time runs out, Warm Me Up removes it.',
    Visual: VisualBurn,
  },
  {
    key: 'play',
    eyebrow: 'DARE · DICE · WISH',
    headline: 'Keep things playful.',
    subtext: 'Challenge each other, roll the Dice, or drop a Wish whenever the mood strikes.',
    Visual: VisualPlay,
  },
  {
    key: 'stealth',
    eyebrow: 'PRIVACY + STEALTH',
    headline: 'Private when you want it.',
    subtext: 'Blur, discreet alerts and Stealth Mode help keep Warm Me Up from prying eyes.',
    Visual: VisualStealth,
  },
  {
    key: 'finish',
    eyebrow: 'STAY PLAYFUL',
    headline: 'Ready to stay playful?',
    subtext: 'Connect with your partner and start building a space that belongs to just the two of you. Your first 7 days are free — after that, subscribe to keep access.',
    Visual: VisualFinish,
  },
];

// ─── Main component ──────────────────────────────────────────────────────────

export default function OnboardingCarousel({ mode, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isShort = height < 760;
  const isTablet = width >= 768;
  const visualScale = isTablet ? 1.25 : 1;
  const flatRef = useRef<FlatList<Slide>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const index = viewableItems[0]?.index;
      if (typeof index === 'number') {
        setCurrentIndex(index);
        fade.setValue(0.35);
        Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }).start();
      }
    },
  ).current;

  const finish = useCallback(
    () => onComplete(mode === 'preview' ? 'get-started' : 'invite-partner'),
    [mode, onComplete],
  );

  const handleNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1)
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    else finish();
  }, [currentIndex, finish]);

  const containerPad = useMemo(
    () => ({
      paddingTop: Math.max(insets.top, 12),
      paddingBottom: Math.max(insets.bottom, 12),
    }),
    [insets],
  );

  return (
    <View style={[styles.root, containerPad]}>
      <LinearGradient
        colors={['#09090D', '#08080B', '#050506']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.topBar}>
        <View style={styles.brandMini}>
          <WarmupLogo size={24} />
          <WarmupWordmark size={12} />
        </View>
        <TouchableOpacity onPress={finish} hitSlop={12} style={styles.skip}>
          <AppText style={styles.skipText}>Skip</AppText>
        </TouchableOpacity>
      </View>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => {
          const Visual = item.Visual;
          return (
            <View style={[styles.slide, { width }]}>
              <Animated.View
                style={[
                  styles.slideInner,
                  {
                    opacity: fade,
                    paddingHorizontal: width >= 700 ? Math.max(80, (width - 620) / 2) : 24,
                  },
                ]}
              >
                <View style={[styles.visualArea, isShort && styles.visualAreaShort]}>
                  <View style={isTablet ? { transform: [{ scale: visualScale }] } : undefined}>
                    <Visual />
                  </View>
                </View>
                <View style={styles.copy}>
                  <AppText style={styles.eyebrow}>{item.eyebrow}</AppText>
                  <AppText style={[styles.headline, isShort && styles.headlineShort]}>
                    {item.headline}
                  </AppText>
                  <AppText style={styles.subtext}>{item.subtext}</AppText>
                </View>
              </Animated.View>
            </View>
          );
        }}
      />
      <View style={styles.footer}>
        <View style={styles.progress}>
          {SLIDES.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.progressDot,
                i === currentIndex && styles.progressDotActive,
                i < currentIndex && styles.progressDotDone,
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[ORANGE, ACCENT]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.continueGradient}
          >
            <AppText style={styles.continueText}>
              {currentIndex === SLIDES.length - 1
                ? mode === 'preview'
                  ? 'Get Started'
                  : 'Connect My Partner'
                : 'Continue'}
            </AppText>
            <ChevronRight size={19} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060608' },
  topBar: {
    height: 48,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandMini: { flexDirection: 'row', alignItems: 'center', gap: 7, opacity: 0.82 },
  skip: { paddingHorizontal: 8, paddingVertical: 8 },
  skipText: { color: 'rgba(255,255,255,0.58)', fontSize: 13, fontFamily: 'Inter-SemiBold' },

  slide: { flex: 1 },
  slideInner: { flex: 1 },
  visualArea: { flex: 1, minHeight: 330, justifyContent: 'center', paddingTop: 8 },
  visualAreaShort: { minHeight: 280 },
  copy: { paddingTop: 10, paddingBottom: 10 },
  eyebrow: {
    color: ORANGE,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1.5,
    marginBottom: 9,
  },
  headline: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 37,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.6,
    maxWidth: 520,
  },
  headlineShort: { fontSize: 28, lineHeight: 33 },
  subtext: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter-Regular',
    marginTop: 10,
    maxWidth: 540,
  },

  // Visual shell
  visualShell: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    height: '92%',
    maxHeight: 488,
    minHeight: 275,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#101015',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },

  // Welcome
  welcomeGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,46,138,0.08)',
  },
  welcomeRing: {
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 1,
    borderColor: 'rgba(255,122,61,0.24)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmarkWrap: { marginTop: 16 },
  welcomeConnection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  welcomeDot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeDotText: {
    color: ORANGE,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.7,
  },
  welcomeLine: {
    width: 72,
    height: 2,
    marginHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeHeartNode: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#101015',
  },

  // Chat
  chatCard: {
    width: '94%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    backgroundColor: '#0B0B0F',
    padding: 14,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  chatAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatName: { color: '#fff', fontSize: 13, fontFamily: 'Inter-SemiBold' },
  chatStatus: { color: 'rgba(255,255,255,0.38)', fontSize: 10, fontFamily: 'Inter-Regular' },
  chatBody: { paddingTop: 12, gap: 9 },
  chatBubble: {
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '82%',
  },
  chatBubbleLeft: { alignSelf: 'flex-start', backgroundColor: '#1A1A21', borderBottomLeftRadius: 4 },
  chatBubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,46,138,0.2)',
    borderBottomRightRadius: 4,
  },
  chatBubbleText: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontFamily: 'Inter-Regular' },
  chatMediaTile: {
    alignSelf: 'flex-end',
    width: 130,
    height: 76,
    borderRadius: 15,
    backgroundColor: '#593342',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chatMediaLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'Inter-SemiBold' },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  voiceWave: { flex: 1, height: 20, flexDirection: 'row', alignItems: 'center', gap: 3 },
  voiceBar: { width: 2, borderRadius: 2, backgroundColor: 'rgba(255,122,61,0.7)' },
  voiceTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'Inter-Regular' },

  // Vault
  vaultCard: {
    width: '94%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
    backgroundColor: '#0B0B0F',
    padding: 14,
  },
  vaultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  vaultTitle: { color: '#fff', fontSize: 18, fontFamily: 'Inter-Bold' },
  vaultSubtitle: { color: 'rgba(255,255,255,0.38)', fontSize: 10, fontFamily: 'Inter-Regular' },
  vaultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vaultTileWrap: { width: '48%' },
  vaultTile: {
    width: '100%',
    height: 88,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultTileBlur: { backgroundColor: '#4A303B', gap: 4 },
  vaultBlurLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 10, fontFamily: 'Inter-SemiBold' },
  vaultCaption: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,122,61,0.07)',
    borderRadius: 10,
    padding: 8,
  },
  vaultCaptionText: { color: 'rgba(255,255,255,0.52)', fontSize: 10, fontFamily: 'Inter-SemiBold' },

  // Burn
  burnMedia: {
    width: 200,
    height: 116,
    borderRadius: 18,
    backgroundColor: '#34232A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  burnBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,46,138,0.78)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
  },
  burnBadgeText: { color: '#fff', fontSize: 9, fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
  burnTimerWrap: {
    width: 120,
    height: 120,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnTimerCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burnTimerText: { color: '#fff', fontSize: 20, fontFamily: 'Inter-Bold' },
  burnTimerLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 8,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1,
  },
  burnMicroCopy: {
    color: 'rgba(255,255,255,0.43)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },

  // Playful
  playRow: {
    flexDirection: 'row',
    gap: 10,
    width: '94%',
    maxWidth: 360,
  },
  playCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: '#17171D',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  playCardHero: {
    backgroundColor: 'rgba(255,46,138,0.08)',
    borderColor: 'rgba(255,46,138,0.25)',
    transform: [{ scale: 1.05 }],
  },
  playIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,122,61,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCardTitle: { color: '#fff', fontSize: 14, fontFamily: 'Inter-Bold' },
  playCardSub: { color: 'rgba(255,255,255,0.42)', fontSize: 10, fontFamily: 'Inter-Regular' },
  playLivePill: {
    backgroundColor: ACCENT,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  playLivePillText: { color: '#fff', fontSize: 8, fontFamily: 'Inter-Bold', letterSpacing: 0.6 },

  // Stealth
  weatherCard: {
    width: 210,
    height: 160,
    borderRadius: 24,
    backgroundColor: '#142B45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    padding: 16,
    justifyContent: 'space-between',
  },
  weatherTop: { alignItems: 'center' },
  weatherCity: { color: '#fff', fontSize: 16, fontFamily: 'Inter-SemiBold' },
  weatherCondition: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontFamily: 'Inter-Regular' },
  weatherMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  weatherTemp: { color: '#fff', fontSize: 44, fontFamily: 'Inter-Regular' },
  weatherSun: { width: 35, height: 35, borderRadius: 18, backgroundColor: '#FFD26A' },
  weatherHL: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontFamily: 'Inter-Regular', textAlign: 'center' },
  stealthBadge: {
    width: '94%',
    maxWidth: 340,
    marginTop: -12,
    borderRadius: 16,
    backgroundColor: '#17171E',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.22)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stealthTitle: { color: '#fff', fontSize: 12, fontFamily: 'Inter-Bold' },
  stealthSub: {
    color: 'rgba(255,255,255,0.43)',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  privacyRow: { marginTop: 14, flexDirection: 'row', gap: 8 },
  privacyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  privacyPillText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontFamily: 'Inter-SemiBold' },

  // Finish
  finishConnection: { flexDirection: 'row', alignItems: 'center' },
  finishCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  finishCircleA: {
    backgroundColor: 'rgba(255,122,61,0.12)',
    borderColor: 'rgba(255,122,61,0.4)',
  },
  finishCircleB: {
    backgroundColor: 'rgba(255,46,138,0.14)',
    borderColor: 'rgba(255,46,138,0.45)',
  },
  finishCircleText: { color: ORANGE, fontSize: 12, fontFamily: 'Inter-Bold', letterSpacing: 0.7 },
  finishLine: {
    width: 84,
    height: 2,
    marginHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishHeartNode: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#101015',
  },
  finishInviteCard: {
    width: '94%',
    maxWidth: 340,
    marginTop: 28,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  finishInviteTitle: { color: '#fff', fontSize: 13, fontFamily: 'Inter-Bold' },
  finishInviteSub: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 3,
  },

  // Footer
  footer: { paddingHorizontal: 24, paddingTop: 10 },
  progress: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  progressDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  progressDotActive: { width: 22, borderRadius: 3, backgroundColor: ACCENT },
  progressDotDone: { backgroundColor: 'rgba(255,122,61,0.45)' },
  continueButton: { width: '100%', maxWidth: 560, alignSelf: 'center', borderRadius: 16, overflow: 'hidden' },
  continueGradient: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
  },
  continueText: { color: '#fff', fontSize: 15, fontFamily: 'Inter-Bold' },
});
