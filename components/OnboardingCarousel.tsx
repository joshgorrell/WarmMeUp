import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Animated,
  Dimensions,
  Platform,
  ViewToken,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, Shield, Heart, MessageCircle, Zap, Dices, Gift, Camera, Bell, User, Users, Star, Flame, Eye, EyeOff, Check, FingerprintPattern as Fingerprint, Mic, Image as ImageIcon, MapPin, Sparkles, UserPlus } from 'lucide-react-native';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isShort = SCREEN_HEIGHT < 700;

export type OnboardingMode = 'preview' | 'post-auth';
export type OnboardingFinishAction = 'get-started' | 'invite-partner';

interface Props {
  mode: OnboardingMode;
  onComplete: (action?: OnboardingFinishAction) => void;
}

// ─── Slide ambient glow colours ───────────────────────────────────────────────
const SLIDE_GLOWS = [
  'rgba(255,90,61,0.18)',    // 1 Welcome        — amber-rose
  'rgba(255,46,138,0.15)',   // 2 Why Different  — deep rose
  'rgba(255,138,61,0.15)',   // 3 Chat           — warm amber
  'rgba(255,70,20,0.18)',    // 4 Dare           — fire-orange
  'rgba(140,80,255,0.16)',   // 5 Dice           — soft lavender
  'rgba(255,46,138,0.14)',   // 6 Wish           — rose-pink
  'rgba(0,180,200,0.14)',    // 7 Vault          — teal-blue
  'rgba(0,200,150,0.12)',    // 8 Settings       — teal-green
  'rgba(255,60,100,0.15)',   // 9 Every Couple   — rose-coral
  'rgba(255,90,61,0.18)',    // 10 Final CTA     — amber-rose
];

// ─── Glass row helper ─────────────────────────────────────────────────────────
function GlassRow({
  icon,
  label,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <View style={glassRow.row}>
      <View style={glassRow.iconWrap}>{icon}</View>
      <View style={glassRow.text}>
        <Text style={[glassRow.label, accent && glassRow.labelAccent]}>{label}</Text>
        {sub ? <Text style={glassRow.sub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const glassRow = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: { flex: 1, gap: 1 },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 18,
  },
  labelAccent: { color: '#FF5A3D' },
  sub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 16,
  },
});

// ─── Visual zone components per slide ────────────────────────────────────────

function VisualWelcome() {
  const pulse = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={vis.center}>
      <Animated.View style={[vis.glowRing, { transform: [{ scale: pulse }] }]} />
      <WarmupLogo size={110} />
      <WarmupWordmark size={20} style={{ marginTop: 10 }} />
    </View>
  );
}

function VisualWhyDifferent() {
  return (
    <View style={vis.center}>
      <View style={vis.iconCluster}>
        {[
          { Icon: Lock, color: '#FF5A3D' },
          { Icon: Heart, color: '#FF2E8A' },
          { Icon: Shield, color: '#FF8A3D' },
          { Icon: Users, color: '#FF5A3D' },
        ].map(({ Icon, color }, i) => (
          <View key={i} style={[vis.clusterChip, { borderColor: `${color}40` }]}>
            <Icon color={color} size={20} strokeWidth={1.8} />
          </View>
        ))}
      </View>
      <View style={vis.tagWrap}>
        <Text style={vis.tagText}>Built only for couples.</Text>
      </View>
    </View>
  );
}

function VisualChat() {
  return (
    <View style={[vis.center, { gap: 10 }]}>
      <View style={[vis.bubble, vis.bubbleLeft]}>
        <Text style={vis.bubbleText}>{"What are you thinking? 💭"}</Text>
      </View>
      <View style={[vis.bubble, vis.bubbleRight]}>
        <Text style={vis.bubbleText}>{"Only you would know... 🔒"}</Text>
      </View>
      <View style={[vis.bubble, vis.bubbleLeft]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Mic color="#FF8A3D" size={14} strokeWidth={2} />
          <Text style={vis.bubbleText}>Voice note  0:08</Text>
        </View>
      </View>
    </View>
  );
}

function VisualDare() {
  return (
    <View style={[vis.center, { flexDirection: 'row', gap: 12 }]}>
      <View style={[vis.dareCard, { borderColor: 'rgba(255,138,61,0.35)' }]}>
        <Text style={[vis.dareCardLabel, { color: 'rgba(255,255,255,0.7)' }]}>Truth</Text>
        <Text style={[vis.dareCardLabel, { color: 'rgba(255,255,255,0.7)' }]}>or</Text>
        <Text style={[vis.dareCardLabel, { color: '#FF8A3D' }]}>Dare?</Text>
        <Text style={vis.dareCardMeta}>?</Text>
      </View>
      <View style={[vis.dareCard, { borderColor: 'rgba(255,46,138,0.45)', backgroundColor: 'rgba(255,46,138,0.10)' }]}>
        <Text style={[vis.dareCardLabel, { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.xs }]}>Accept</Text>
        <Text style={[vis.dareCardLabel, { color: '#FF2E8A' }]}>the dare?</Text>
        <View style={vis.dareCheck}>
          <Check color="#FF2E8A" size={18} strokeWidth={3} />
        </View>
      </View>
    </View>
  );
}

function VisualDice() {
  return (
    <View style={vis.center}>
      <View style={vis.diceOuter}>
        <LinearGradient
          colors={['rgba(140,80,255,0.35)', 'rgba(80,40,180,0.25)']}
          style={vis.diceFace}
        >
          {/* pip layout for face showing 5 */}
          <View style={vis.pipRow}>
            <View style={vis.pip} />
            <View style={{ width: 10 }} />
            <View style={vis.pip} />
          </View>
          <View style={vis.pipRow}>
            <View style={{ width: 10 }} />
            <View style={vis.pip} />
            <View style={{ width: 10 }} />
          </View>
          <View style={vis.pipRow}>
            <View style={vis.pip} />
            <View style={{ width: 10 }} />
            <View style={vis.pip} />
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}

function VisualWish() {
  return (
    <View style={[vis.center, { paddingHorizontal: 20 }]}>
      <View style={vis.polaroidStack}>
        <View style={[vis.polaroid, vis.polaroidBack]}>
          <LinearGradient colors={['#1a0e18', '#2a1428']} style={vis.polaroidImg} />
          <Text style={vis.polaroidCaption}>A Weekend Away ❤️</Text>
        </View>
        <View style={[vis.polaroid, vis.polaroidFront]}>
          <LinearGradient colors={['#1a1228', '#0e1020']} style={vis.polaroidImg}>
            <MapPin color="rgba(255,138,61,0.7)" size={22} strokeWidth={1.8} />
          </LinearGradient>
          <Text style={vis.polaroidCaption}>Someday in Paris 🗼</Text>
        </View>
      </View>
      <View style={vis.wishTagWrap}>
        <Heart color="#FF2E8A" size={12} strokeWidth={2} fill="#FF2E8A" />
        <Text style={vis.wishTag}>Some wishes become unforgettable memories</Text>
      </View>
    </View>
  );
}

function VisualVault() {
  const glow = useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.6, duration: 1400, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={vis.center}>
      <Animated.View style={[vis.vaultGlowRing, { opacity: glow }]} />
      <View style={vis.vaultBox}>
        <Lock color="#00B4C8" size={36} strokeWidth={1.5} />
      </View>
      <View style={vis.vaultTag}>
        <Text style={vis.vaultTagText}>Locked</Text>
      </View>
    </View>
  );
}

function VisualSettings() {
  const rows = [
    { label: 'Privacy & Security', Icon: Shield, color: '#FF5A3D' },
    { label: 'Notifications', Icon: Bell, color: '#FFB347' },
    { label: 'Vault Settings', Icon: Lock, color: '#00C8A0' },
  ];
  return (
    <View style={[vis.center, { width: '100%', paddingHorizontal: 20 }]}>
      <View style={[vis.settingsMock, { width: '100%' }]}>
        {rows.map(({ label, Icon, color }, i) => (
          <View
            key={i}
            style={[
              vis.settingsRow,
              i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
            ]}
          >
            <View style={[vis.settingsIcon, { backgroundColor: `${color}22` }]}>
              <Icon color={color} size={14} strokeWidth={2} />
            </View>
            <Text style={vis.settingsLabel}>{label}</Text>
            <View style={vis.settingsChevron}>
              <View style={[vis.togglePill, { backgroundColor: i === 0 ? '#FF5A3D' : 'rgba(255,255,255,0.15)' }]}>
                <View style={[vis.toggleThumb, i === 0 ? vis.toggleThumbOn : vis.toggleThumbOff]} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function VisualEveryCoupleHeart() {
  const scale = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={vis.center}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart color="#FF2E8A" size={72} strokeWidth={1.2} />
      </Animated.View>
    </View>
  );
}

function VisualFinalCTA() {
  const glow = useRef(new Animated.Value(0.7)).current;
  const scale = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.7, duration: 1200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.1, duration: 1200, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  return (
    <View style={vis.center}>
      <Animated.View style={[vis.finalGlow, { opacity: glow, transform: [{ scale }] }]} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart color="#FF2E8A" size={80} strokeWidth={1} />
      </Animated.View>
    </View>
  );
}

const vis = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Welcome glow ring
  glowRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,90,61,0.14)',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 50,
  },
  // Why Different icon cluster
  iconCluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    maxWidth: 220,
    marginBottom: 16,
  },
  clusterChip: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagWrap: {
    backgroundColor: 'rgba(255,46,138,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.3)',
    borderRadius: Radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  tagText: {
    color: '#FF2E8A',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.3,
  },
  // Chat bubbles
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 260,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    marginLeft: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    marginRight: 16,
    backgroundColor: 'rgba(255,90,61,0.18)',
    borderColor: 'rgba(255,90,61,0.3)',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  // Dare cards
  dareCard: {
    width: 130,
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'flex-start',
    gap: 4,
  },
  dareCardLabel: {
    fontSize: FontSize.md,
    fontFamily: 'Inter-Bold',
  },
  dareCardMeta: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    marginTop: 6,
  },
  dareCheck: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,46,138,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  // Dice
  diceOuter: {
    width: 110,
    height: 110,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(140,80,255,0.45)',
    shadowColor: '#8C50FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 12,
  },
  diceFace: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  pipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pip: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(200,160,255,0.85)',
    shadowColor: '#C8A0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  // Wish polaroids
  polaroidStack: {
    width: 200,
    height: 140,
    position: 'relative',
    marginBottom: 12,
  },
  polaroid: {
    position: 'absolute',
    width: 160,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 6,
    paddingBottom: 24,
  },
  polaroidBack: {
    transform: [{ rotate: '-8deg' }],
    top: 10,
    left: 0,
  },
  polaroidFront: {
    transform: [{ rotate: '4deg' }],
    top: 0,
    right: 0,
  },
  polaroidImg: {
    height: 80,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  polaroidCaption: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    marginTop: 4,
  },
  wishTagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  wishTag: {
    color: 'rgba(255,46,138,0.8)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
  // Vault
  vaultGlowRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: 'rgba(0,180,200,0.5)',
    shadowColor: '#00B4C8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
  },
  vaultBox: {
    width: 90,
    height: 90,
    borderRadius: 28,
    backgroundColor: 'rgba(0,180,200,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,180,200,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00B4C8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  vaultTag: {
    marginTop: 14,
    backgroundColor: 'rgba(0,180,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,180,200,0.3)',
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  vaultTagText: {
    color: '#00B4C8',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.2,
  },
  // Settings mock
  settingsMock: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 18,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  settingsIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.80)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Medium',
  },
  settingsChevron: { alignItems: 'flex-end' },
  togglePill: {
    width: 36,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  toggleThumbOff: { alignSelf: 'flex-start' },
  // Final CTA heart
  finalGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,46,138,0.14)',
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 50,
  },
});

// ─── Slide definitions ────────────────────────────────────────────────────────

interface SlideData {
  key: string;
  Visual: React.ComponentType;
  accentColor: string;
  headline: string;
  headlineAccent?: string; // word(s) to colour with accent
  subtext: string;
  rows: Array<{ icon: React.ReactNode; label: string; sub?: string; accent?: boolean }>;
  isFinal?: boolean;
}

const SLIDES: SlideData[] = [
  {
    key: 'welcome',
    Visual: VisualWelcome,
    accentColor: '#FF5A3D',
    headline: 'Welcome to WarmMeUp ❤️',
    subtext: 'A private space built exclusively for couples to connect, flirt, play, share, and create unforgettable moments together.',
    rows: [],
  },
  {
    key: 'why',
    Visual: VisualWhyDifferent,
    accentColor: '#FF2E8A',
    headline: 'Why WarmMeUp is different',
    headlineAccent: 'different',
    subtext: "We're not a social network. We're not another messaging app. We're built for one thing.",
    rows: [
      { icon: <Users color="#FF5A3D" size={15} strokeWidth={2} />, label: 'Built only for couples' },
      { icon: <Lock color="#FF2E8A" size={15} strokeWidth={2} />, label: 'Completely private' },
      { icon: <Heart color="#FF8A3D" size={15} strokeWidth={2} />, label: 'Designed to strengthen connection' },
      { icon: <Sparkles color="#FFB347" size={15} strokeWidth={2} />, label: 'Playful, romantic and fun' },
      { icon: <Shield color="#FF5A3D" size={15} strokeWidth={2} />, label: 'No followers. No distractions.' },
    ],
  },
  {
    key: 'chat',
    Visual: VisualChat,
    accentColor: '#FF8A3D',
    headline: 'Chat',
    subtext: 'Private conversations that actually feel personal.',
    rows: [
      { icon: <Lock color="#FF8A3D" size={15} strokeWidth={2} />, label: 'Private couple-only chat' },
      { icon: <Mic color="#FFB347" size={15} strokeWidth={2} />, label: 'Voice notes' },
      { icon: <Camera color="#FF5A3D" size={15} strokeWidth={2} />, label: 'Photo & video sharing' },
      { icon: <Check color="#FF8A3D" size={15} strokeWidth={2} />, label: 'Read receipts' },
      { icon: <Bell color="#FF5A3D" size={15} strokeWidth={2} />, label: 'Screenshot notifications' },
    ],
  },
  {
    key: 'dare',
    Visual: VisualDare,
    accentColor: '#FF6020',
    headline: 'Dare',
    subtext: 'Break routines. Create memories.',
    rows: [
      { icon: <Zap color="#FF6020" size={15} strokeWidth={2} />, label: 'Spark laughter & chemistry' },
      { icon: <Heart color="#FF2E8A" size={15} strokeWidth={2} />, label: 'Spontaneous shared moments' },
      { icon: <Star color="#FFB347" size={15} strokeWidth={2} />, label: 'Playful couple challenges' },
      { icon: <Flame color="#FF6020" size={15} strokeWidth={2} />, label: 'Keep things exciting' },
    ],
  },
  {
    key: 'dice',
    Visual: VisualDice,
    accentColor: '#A060FF',
    headline: 'Dice',
    subtext: 'A little randomness keeps things exciting.',
    rows: [
      { icon: <Dices color="#A060FF" size={15} strokeWidth={2} />, label: 'Roll and let the app surprise you' },
      { icon: <Sparkles color="#C090FF" size={15} strokeWidth={2} />, label: 'Playful prompts & challenges' },
      { icon: <Heart color="#FF2E8A" size={15} strokeWidth={2} />, label: 'Connection & adventurous moments' },
      { icon: <Zap color="#A060FF" size={15} strokeWidth={2} />, label: 'Never run out of ideas' },
    ],
  },
  {
    key: 'wish',
    Visual: VisualWish,
    accentColor: '#FF2E8A',
    headline: 'Wish',
    subtext: 'Share what you truly want.',
    rows: [
      { icon: <MapPin color="#FF8A3D" size={15} strokeWidth={2} />, label: 'Dream vacations & travel ideas' },
      { icon: <Heart color="#FF2E8A" size={15} strokeWidth={2} />, label: 'Romantic ideas & future plans' },
      { icon: <Gift color="#FFB347" size={15} strokeWidth={2} />, label: 'Gifts, fantasies & tiny wishes' },
      { icon: <Star color="#FF5A3D" size={15} strokeWidth={2} />, label: 'Big desires or small moments' },
    ],
  },
  {
    key: 'vault',
    Visual: VisualVault,
    accentColor: '#00B4C8',
    headline: 'Vault',
    subtext: 'Your private memories, protected.',
    rows: [
      { icon: <ImageIcon color="#FF5A3D" size={15} strokeWidth={2} />, label: 'Not saved to your phone\'s gallery', accent: true },
      { icon: <Users color="#00B4C8" size={15} strokeWidth={2} />, label: 'Shared only between you and your partner' },
      { icon: <EyeOff color="#00B4C8" size={15} strokeWidth={2} />, label: 'Optional blur protection' },
      { icon: <Fingerprint color="#00B4C8" size={15} strokeWidth={2} />, label: 'Face ID & security controls' },
      { icon: <Shield color="#00B4C8" size={15} strokeWidth={2} />, label: 'Built for privacy first' },
    ],
  },
  {
    key: 'settings',
    Visual: VisualSettings,
    accentColor: '#00C8A0',
    headline: 'Profile & Settings',
    subtext: 'Designed around your relationship.',
    rows: [
      { icon: <Shield color="#00C8A0" size={15} strokeWidth={2} />, label: 'Privacy & vault security' },
      { icon: <Bell color="#FFB347" size={15} strokeWidth={2} />, label: 'Custom notifications' },
      { icon: <Heart color="#FF2E8A" size={15} strokeWidth={2} />, label: 'Couple preferences' },
      { icon: <Star color="#00C8A0" size={15} strokeWidth={2} />, label: 'Subscription management' },
    ],
  },
  {
    key: 'couples',
    Visual: VisualEveryCoupleHeart,
    accentColor: '#FF2E8A',
    headline: 'Built for every couple.',
    subtext: 'Newly dating or decades together — WarmMeUp helps you stay close, excited and connected every single day.',
    rows: [
      { icon: <Heart color="#FF2E8A" size={15} strokeWidth={2} fill="#FF2E8A" />, label: 'Strengthen connection' },
      { icon: <Flame color="#FF5A3D" size={15} strokeWidth={2} />, label: 'Keep the spark alive' },
      { icon: <Star color="#FFB347" size={15} strokeWidth={2} />, label: 'Create lasting memories' },
      { icon: <MapPin color="#FF8A3D" size={15} strokeWidth={2} />, label: 'Perfect for long-distance' },
    ],
  },
  {
    key: 'final',
    Visual: VisualFinalCTA,
    accentColor: '#FF5A3D',
    headline: 'Ready to warm things up? ❤️',
    subtext: 'Your private world starts now.',
    rows: [],
    isFinal: true,
  },
];

// ─── Headline with accent word ─────────────────────────────────────────────────
function HeadlineText({ text, accent, accentColor }: { text: string; accent?: string; accentColor: string }) {
  if (!accent) {
    return <Text style={[sl.headline]}>{text}</Text>;
  }
  const idx = text.indexOf(accent);
  if (idx === -1) return <Text style={sl.headline}>{text}</Text>;
  const before = text.slice(0, idx);
  const after = text.slice(idx + accent.length);
  return (
    <Text style={sl.headline}>
      {before}
      <Text style={[sl.headline, { color: accentColor }]}>{accent}</Text>
      {after}
    </Text>
  );
}

// ─── Individual slide ─────────────────────────────────────────────────────────
function Slide({ item, width, visualHeight }: { item: SlideData; width: number; visualHeight: number }) {
  const { Visual } = item;
  return (
    <View style={[sl.slide, { width }]}>
      {/* Visual zone */}
      <View style={[sl.visual, { height: visualHeight }]}>
        <Visual />
      </View>

      {/* Text zone */}
      <View style={sl.textZone}>
        <HeadlineText
          text={item.headline}
          accent={item.headlineAccent}
          accentColor={item.accentColor}
        />
        <Text style={sl.subtext}>{item.subtext}</Text>

        {item.rows.length > 0 && (
          <View style={sl.rows}>
            {item.rows.map((row, i) => (
              <GlassRow
                key={i}
                icon={row.icon}
                label={row.label}
                sub={row.sub}
                accent={row.accent}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  slide: {
    flex: 1,
  },
  visual: {
    overflow: 'hidden',
  },
  textZone: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: isShort ? 12 : 20,
  },
  headline: {
    color: '#fff',
    fontSize: isShort ? 22 : 26,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.5,
    lineHeight: isShort ? 28 : 33,
    marginBottom: isShort ? 6 : 10,
  },
  subtext: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    marginBottom: isShort ? 10 : 16,
  },
  rows: {
    gap: isShort ? 6 : 8,
  },
});

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={pb.wrap}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[pb.seg, i < current ? pb.segDone : i === current ? pb.segActive : pb.segEmpty]}>
          {i === current && (
            <LinearGradient
              colors={['#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 4,
  },
  seg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  segDone: { backgroundColor: '#FF5A3D' },
  segActive: { backgroundColor: 'transparent' },
  segEmpty: { backgroundColor: 'rgba(255,255,255,0.18)' },
});

// ─── Main carousel ─────────────────────────────────────────────────────────────
export default function OnboardingCarousel({ mode, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList<SlideData>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const topPad = insets.top + 14;
  const bottomPad = Math.max(insets.bottom + 12, 28);
  const headerH = topPad + 24 + 16; // inset + progress bar + gap
  const footerH = bottomPad + (isShort ? 52 : 60) + 16; // inset + btn + gap
  const visualHeight = Math.round(
    (isShort ? 0.36 : 0.40) * SCREEN_HEIGHT
  );

  // Ambient glow animated value
  const ambientAnim = useRef(new Animated.Value(0)).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const idx = viewableItems[0].index ?? 0;
      setCurrentIndex(idx);
      Animated.timing(ambientAnim, {
        toValue: idx,
        duration: 350,
        useNativeDriver: false,
      }).start();
    }
  }, []);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      onComplete('get-started');
    }
  };

  const handleSkip = () => onComplete('get-started');

  // Background colour interpolation across slide ambient colours
  const bgColor = ambientAnim.interpolate({
    inputRange: SLIDE_GLOWS.map((_, i) => i),
    outputRange: SLIDE_GLOWS,
    extrapolate: 'clamp',
  });

  const currentSlide = SLIDES[currentIndex];

  const renderItem = ({ item }: { item: SlideData }) => (
    <Slide
      item={item}
      width={SCREEN_WIDTH}
      visualHeight={visualHeight}
    />
  );

  const keyExtractor = (item: SlideData) => item.key;

  return (
    <View style={styles.root}>
      {/* Static dark base */}
      <LinearGradient
        colors={['#060406', '#090709', '#0C080C']}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated ambient glow blob */}
      <Animated.View
        style={[
          styles.ambientBlob,
          { backgroundColor: bgColor },
        ]}
        pointerEvents="none"
      />

      {/* Header: progress + skip */}
      <View style={[styles.header, { paddingTop: topPad, paddingHorizontal: Spacing.xl }]}>
        <ProgressBar current={currentIndex} total={SLIDES.length} />
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        decelerationRate="fast"
        bounces={false}
      />

      {/* Footer */}
      {currentSlide.isFinal ? (
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => onComplete('get-started')}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.primaryGrad, { paddingVertical: isShort ? 15 : 18 }]}
            >
              <Text style={styles.primaryLabel}>Get Started</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { paddingVertical: isShort ? 13 : 16 }]}
            onPress={() => onComplete('invite-partner')}
            activeOpacity={0.8}
          >
            <UserPlus color="rgba(255,255,255,0.75)" size={16} strokeWidth={2} />
            <Text style={styles.secondaryLabel}>Invite Your Partner</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.footer, { paddingBottom: bottomPad }]}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleNext}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.primaryGrad, { paddingVertical: isShort ? 15 : 18 }]}
            >
              <Text style={styles.primaryLabel}>Next</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060406',
  },
  ambientBlob: {
    position: 'absolute',
    top: -80,
    left: -80,
    right: -80,
    height: SCREEN_HEIGHT * 0.55,
    borderRadius: SCREEN_HEIGHT * 0.28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  skipBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    flexShrink: 0,
  },
  skipText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  list: {
    flex: 1,
  },
  listContent: {},
  footer: {
    paddingHorizontal: Spacing.xl,
    gap: 10,
    zIndex: 10,
  },
  primaryBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  primaryGrad: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: FontSize.md,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  secondaryLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
  },
});
