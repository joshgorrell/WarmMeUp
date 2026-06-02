import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Animated,
  Dimensions,
  Platform,
  ViewToken,
  Image,
} from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Lock, Shield, Heart, MessageCircle, Zap, Dices, Gift, Camera, Bell, User, Users,
  Star, Flame, EyeOff, Check, Mic, Image as ImageIcon, MapPin, Sparkles,
  UserPlus, ChevronRight,
} from 'lucide-react-native';
import { Radius } from '@/constants/theme';
import WarmupLogo from '@/components/WarmupLogo';
import WarmupWordmark from '@/components/WarmupWordmark';

const { width: SW, height: SH } = Dimensions.get('window');
const isShort = SH < 700;
const SLOGAN_SOURCE = require('@/assets/images/image_(2).png');

export type OnboardingMode = 'preview' | 'post-auth';
export type OnboardingFinishAction = 'get-started' | 'invite-partner';

interface Props {
  mode: OnboardingMode;
  onComplete: (action?: OnboardingFinishAction) => void;
}

// ─── Per-slide ambient theme ──────────────────────────────────────────────────
const SLIDE_THEMES = [
  { glow: 'rgba(255,90,61,0.22)',   glow2: 'rgba(255,46,138,0.12)'  }, // 1 Welcome
  { glow: 'rgba(255,46,138,0.20)',  glow2: 'rgba(255,90,61,0.10)'   }, // 2 Why Different
  { glow: 'rgba(255,138,61,0.20)',  glow2: 'rgba(255,46,138,0.10)'  }, // 3 Chat
  { glow: 'rgba(255,70,20,0.22)',   glow2: 'rgba(255,138,61,0.12)'  }, // 4 Dare
  { glow: 'rgba(140,80,255,0.22)',  glow2: 'rgba(100,40,220,0.12)'  }, // 5 Dice
  { glow: 'rgba(255,46,138,0.20)',  glow2: 'rgba(255,138,61,0.12)'  }, // 6 Wish
  { glow: 'rgba(0,180,200,0.20)',   glow2: 'rgba(0,120,180,0.12)'   }, // 7 Vault
  { glow: 'rgba(0,200,150,0.18)',   glow2: 'rgba(0,180,200,0.10)'   }, // 8 Settings
  { glow: 'rgba(255,60,100,0.20)',  glow2: 'rgba(255,138,61,0.12)'  }, // 9 Every Couple
  { glow: 'rgba(255,90,61,0.22)',   glow2: 'rgba(255,46,138,0.18)'  }, // 10 Final
];

// ─── Feature row ──────────────────────────────────────────────────────────────
function FeatureRow({
  icon, label, sub, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <View style={[fr.row, highlight && fr.rowHL]}>
      <View style={[fr.iconWrap, highlight && fr.iconWrapHL]}>{icon}</View>
      <View style={fr.texts}>
        <AppText style={[fr.label, highlight && fr.labelHL]}>{label}</AppText>
        {sub ? <AppText style={fr.sub}>{sub}</AppText> : null}
      </View>
    </View>
  );
}
const fr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: isShort ? 9 : 11,
  },
  rowHL: {
    backgroundColor: 'rgba(255,90,61,0.10)',
    borderColor: 'rgba(255,90,61,0.30)',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapHL: { backgroundColor: 'rgba(255,90,61,0.15)' },
  texts: { flex: 1 },
  label: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: isShort ? 12 : 13,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 18,
  },
  labelHL: { color: '#FF8A3D' },
  sub: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    lineHeight: 15,
    marginTop: 1,
  },
});

// ─── Couple-type pill ─────────────────────────────────────────────────────────
function CouplePill({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <View style={[cp.pill, { borderColor: `${color}44` }]}>
      {icon}
      <AppText style={[cp.label, { color }]}>{label}</AppText>
    </View>
  );
}
const cp = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
  },
  label: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
});

// ─── Visual components ────────────────────────────────────────────────────────

function VisualWelcome() {
  const pulse = useRef(new Animated.Value(1)).current;
  const fade  = useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.14, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 1200, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(fade, { toValue: 1,   duration: 1200, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);
  const sz = isShort ? 100 : 122;
  return (
    <View style={vs.center}>
      <Animated.View style={[vs.welcomeOuterGlow, { opacity: fade, transform: [{ scale: pulse }] }]} />
      <Animated.View style={[vs.welcomeInnerRing, { opacity: fade }]} />
      <WarmupLogo size={sz} />
      <WarmupWordmark size={isShort ? 17 : 21} style={{ marginTop: 14 }} />
    </View>
  );
}

function VisualWhyDifferent() {
  return (
    <View style={vs.center}>
      <View style={vs.whyGrid}>
        {([
          { Icon: Users,         color: '#FF5A3D', label: 'Couples only' },
          { Icon: Lock,          color: '#FF2E8A', label: 'Private'       },
          { Icon: Heart,         color: '#FF8A3D', label: 'Connection'    },
          { Icon: Shield,        color: '#FFB347', label: 'Secure'        },
          { Icon: Sparkles,      color: '#FF5A3D', label: 'Playful'       },
          { Icon: MessageCircle, color: '#FF2E8A', label: 'Intimate'      },
        ] as Array<{ Icon: React.ComponentType<any>; color: string; label: string }>).map(({ Icon, color, label }, i) => (
          <View key={i} style={[vs.whyChip, { borderColor: `${color}38` }]}>
            <Icon color={color} size={20} strokeWidth={1.8} />
            <AppText style={[vs.whyChipLabel, { color: `${color}CC` }]}>{label}</AppText>
          </View>
        ))}
      </View>
      <View style={vs.whyTagPill}>
        <AppText style={vs.whyTagText}>More intimate than social media</AppText>
      </View>
    </View>
  );
}

function VisualChat() {
  return (
    <View style={[vs.center, { gap: 9, paddingHorizontal: 20 }]}>
      <View style={vs.chatBadge}>
        <Lock color="#FF8A3D" size={11} strokeWidth={2.5} />
        <AppText style={vs.chatBadgeText}>Couple-only chat</AppText>
      </View>
      <View style={[vs.bubble, vs.bubbleLeft]}>
        <AppText style={vs.bubbleText}>What are you thinking? 💭</AppText>
      </View>
      <View style={[vs.bubble, vs.bubbleRight]}>
        <AppText style={vs.bubbleText}>Only you would know... 🔒</AppText>
      </View>
      <View style={[vs.bubble, vs.bubbleLeft]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Mic color="#FF8A3D" size={13} strokeWidth={2} />
          <AppText style={vs.bubbleText}>Voice note  0:08</AppText>
        </View>
      </View>
    </View>
  );
}

function VisualDare() {
  const glow = useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1,   duration: 1100, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.6, duration: 1100, useNativeDriver: true }),
    ])).start();
  }, []);
  const sz = isShort ? 46 : 56;
  return (
    <View style={vs.center}>
      <Animated.View style={[vs.dareGlow, { opacity: glow }]} />
      <View style={vs.dareRing}>
        <Flame color="#FF8A3D" size={sz} strokeWidth={1.4} />
      </View>
      <View style={vs.dareCards}>
        <View style={[vs.dareCard, { borderColor: 'rgba(255,138,61,0.38)' }]}>
          <AppText style={[vs.dareWord, { color: 'rgba(255,255,255,0.68)' }]}>Truth</AppText>
          <AppText style={[vs.dareWord, { color: 'rgba(255,255,255,0.42)', fontSize: 11 }]}>or</AppText>
          <AppText style={[vs.dareWord, { color: '#FF8A3D' }]}>Dare?</AppText>
          <AppText style={vs.dareQ}>?</AppText>
        </View>
        <View style={[vs.dareCard, { borderColor: 'rgba(255,46,138,0.42)', backgroundColor: 'rgba(255,46,138,0.08)' }]}>
          <AppText style={[vs.dareWord, { color: 'rgba(255,255,255,0.68)', fontSize: 11 }]}>Accept</AppText>
          <AppText style={[vs.dareWord, { color: '#FF2E8A' }]}>the dare?</AppText>
          <View style={vs.dareCheck}>
            <Check color="#FF2E8A" size={16} strokeWidth={3} />
          </View>
        </View>
      </View>
    </View>
  );
}

function VisualDice() {
  const rot   = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(rot,   { toValue: 1,    duration: 1600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.07, duration: 800,  useNativeDriver: true }),
      ]),
      Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(rot,   { toValue: 0, duration: 0,   useNativeDriver: true }),
    ])).start();
  }, []);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '16deg'] });
  const DFace = ({ angle, style }: { angle: string; style?: object }) => (
    <Animated.View style={[vs.diceOuter, style, { transform: [{ rotate: angle }] }]}>
      <LinearGradient colors={['rgba(140,80,255,0.42)', 'rgba(70,30,180,0.32)']} style={vs.diceFace}>
        <View style={vs.pipRow}><View style={vs.pip} /><View style={{ width: 8 }} /><View style={vs.pip} /></View>
        <View style={vs.pipRow}><View style={{ width: 8 }} /><View style={vs.pip} /><View style={{ width: 8 }} /></View>
        <View style={vs.pipRow}><View style={vs.pip} /><View style={{ width: 8 }} /><View style={vs.pip} /></View>
      </LinearGradient>
    </Animated.View>
  );
  return (
    <View style={vs.center}>
      <View style={vs.diceGlowRing} />
      <View style={vs.diceGroup}>
        <DFace angle="-12deg" style={{ marginRight: -10, marginBottom: -6 }} />
        <Animated.View style={{ transform: [{ rotate: spin }, { scale }], zIndex: 2 }}>
          <DFace angle="0deg" />
        </Animated.View>
        <DFace angle="14deg" style={{ marginLeft: -10, marginBottom: -6 }} />
      </View>
    </View>
  );
}

function VisualWish() {
  return (
    <View style={[vs.center, { paddingHorizontal: 16 }]}>
      <View style={vs.wishRing}>
        <Gift color="#FF2E8A" size={isShort ? 42 : 52} strokeWidth={1.4} />
      </View>
      <View style={vs.polaroidStack}>
        <View style={[vs.polaroid, vs.polBack]}>
          <LinearGradient colors={['#1a0e18', '#2a1428']} style={vs.polImg} />
          <AppText style={vs.polCaption}>A Weekend Away ❤️</AppText>
        </View>
        <View style={[vs.polaroid, vs.polFront]}>
          <LinearGradient colors={['#18122a', '#0e1020']} style={vs.polImg}>
            <MapPin color="rgba(255,138,61,0.75)" size={18} strokeWidth={1.8} />
          </LinearGradient>
          <AppText style={vs.polCaption}>Someday in Paris 🗼</AppText>
        </View>
      </View>
      <View style={vs.wishTagRow}>
        <Heart color="#FF2E8A" size={11} strokeWidth={2} fill="#FF2E8A" />
        <AppText style={vs.wishTagText}>Some wishes become unforgettable memories ❤️</AppText>
      </View>
    </View>
  );
}

function VisualVault() {
  const glow  = useRef(new Animated.Value(0.55)).current;
  const ringS = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(glow,  { toValue: 1,    duration: 1500, useNativeDriver: true }),
        Animated.timing(glow,  { toValue: 0.55, duration: 1500, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(ringS, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(ringS, { toValue: 1,    duration: 1500, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  const sz = isShort ? 40 : 50;
  return (
    <View style={vs.center}>
      <Animated.View style={[vs.vaultOuterRing, { opacity: glow, transform: [{ scale: ringS }] }]} />
      <Animated.View style={[vs.vaultInnerRing, { opacity: glow }]} />
      <View style={vs.vaultBox}>
        <Lock color="#00B4C8" size={sz} strokeWidth={1.4} />
      </View>
      <View style={vs.vaultPill}>
        <Shield color="#00B4C8" size={11} strokeWidth={2} />
        <AppText style={vs.vaultPillText}>Encrypted & private</AppText>
      </View>
    </View>
  );
}

function VisualSettings() {
  const rows = [
    { Icon: Shield,  color: '#00C8A0', label: 'Privacy controls'         },
    { Icon: Bell,    color: '#FFB347', label: 'Notifications'             },
    { Icon: Lock,    color: '#00B4C8', label: 'Vault security'            },
    { Icon: Star,    color: '#FF5A3D', label: 'Subscription'              },
    { Icon: Heart,   color: '#FF2E8A', label: 'Relationship preferences'  },
  ] as Array<{ Icon: React.ComponentType<any>; color: string; label: string }>;
  return (
    <View style={[vs.center, { width: '100%', paddingHorizontal: 20 }]}>
      <View style={vs.settingsAvatar}>
        <User color="rgba(255,255,255,0.6)" size={28} strokeWidth={1.6} />
      </View>
      <AppText style={vs.settingsAvatarLabel}>Your Profile</AppText>
      <View style={vs.settingsMock}>
        {rows.map(({ Icon, color, label }, i) => (
          <View key={i} style={[vs.settingsRow, i < rows.length - 1 && vs.settingsRowBorder]}>
            <View style={[vs.settingsIconWrap, { backgroundColor: `${color}1E` }]}>
              <Icon color={color} size={13} strokeWidth={2} />
            </View>
            <AppText style={vs.settingsRowLabel}>{label}</AppText>
            <ChevronRight color="rgba(255,255,255,0.25)" size={14} strokeWidth={2} />
          </View>
        ))}
      </View>
    </View>
  );
}

function VisualEveryCouple() {
  const scale = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.10, duration: 950, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 950, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={vs.center}>
      <Animated.View style={[vs.coupleGlow, { transform: [{ scale }] }]} />
      <Animated.View style={{ transform: [{ scale }], marginBottom: 14 }}>
        <Heart color="#FF2E8A" size={isShort ? 64 : 78} strokeWidth={1.2} fill="rgba(255,46,138,0.18)" />
      </Animated.View>
      <Users color="rgba(255,255,255,0.45)" size={22} strokeWidth={1.8} style={{ marginBottom: 5 }} />
      <AppText style={vs.coupleLabel}>WarmMeUp is for every couple</AppText>
    </View>
  );
}

function VisualFinalCTA() {
  const glow  = useRef(new Animated.Value(0.65)).current;
  const scale = useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(glow,  { toValue: 1,    duration: 1300, useNativeDriver: true }),
        Animated.timing(glow,  { toValue: 0.65, duration: 1300, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 1300, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 1300, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  return (
    <View style={vs.center}>
      <Animated.View style={[vs.finalGlowOuter, { opacity: glow, transform: [{ scale }] }]} />
      <Animated.View style={[vs.finalGlowInner, { opacity: glow }]} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart color="#FF2E8A" size={isShort ? 76 : 94} strokeWidth={1.0} fill="rgba(255,46,138,0.22)" />
      </Animated.View>
      <WarmupWordmark size={isShort ? 15 : 19} style={{ marginTop: 18 }} />
    </View>
  );
}

const vs = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Welcome
  welcomeOuterGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,90,61,0.14)',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 60,
  },
  welcomeInnerRing: {
    position: 'absolute',
    width: 162,
    height: 162,
    borderRadius: 81,
    borderWidth: 1.5,
    borderColor: 'rgba(255,90,61,0.28)',
  },

  // Why Different
  whyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    maxWidth: 270,
    marginBottom: 14,
  },
  whyChip: {
    width: 80,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    alignItems: 'center',
    gap: 5,
  },
  whyChipLabel: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  whyTagPill: {
    backgroundColor: 'rgba(255,46,138,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.28)',
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  whyTagText: {
    color: '#FF2E8A',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
  },

  // Chat
  chatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,138,61,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,138,61,0.25)',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 2,
  },
  chatBadgeText: {
    color: '#FF8A3D',
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: SW - 80,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderBottomLeftRadius: 4,
  },
  bubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,90,61,0.18)',
    borderColor: 'rgba(255,90,61,0.30)',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },

  // Dare
  dareGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,96,32,0.18)',
    shadowColor: '#FF6020',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 50,
  },
  dareRing: {
    width: isShort ? 90 : 108,
    height: isShort ? 90 : 108,
    borderRadius: isShort ? 45 : 54,
    backgroundColor: 'rgba(255,96,32,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,138,61,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dareCards: { flexDirection: 'row', gap: 10 },
  dareCard: {
    width: 122,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: 3,
  },
  dareWord: { fontSize: 14, fontFamily: 'Inter-Bold', color: '#fff' },
  dareQ: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    marginTop: 4,
  },
  dareCheck: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,46,138,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,46,138,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },

  // Dice
  diceGlowRing: {
    position: 'absolute',
    width: 185,
    height: 185,
    borderRadius: 93,
    borderWidth: 1,
    borderColor: 'rgba(140,80,255,0.22)',
    shadowColor: '#8C50FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 40,
  },
  diceGroup: { flexDirection: 'row', alignItems: 'center' },
  diceOuter: {
    width: isShort ? 86 : 102,
    height: isShort ? 86 : 102,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(160,96,255,0.50)',
    shadowColor: '#A060FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 22,
    elevation: 10,
  },
  diceFace: { flex: 1, padding: 12, justifyContent: 'space-between' },
  pipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pip: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: 'rgba(210,170,255,0.88)',
    shadowColor: '#C8A0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },

  // Wish
  wishRing: {
    width: isShort ? 92 : 110,
    height: isShort ? 92 : 110,
    borderRadius: isShort ? 46 : 55,
    backgroundColor: 'rgba(255,46,138,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,46,138,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  polaroidStack: {
    width: 210,
    height: isShort ? 104 : 124,
    position: 'relative',
    marginBottom: 10,
  },
  polaroid: {
    position: 'absolute',
    width: 156,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 11,
    padding: 5,
    paddingBottom: 22,
  },
  polBack: { transform: [{ rotate: '-8deg' }], top: 8, left: 0 },
  polFront: { transform: [{ rotate: '5deg' }],  top: 0, right: 0 },
  polImg: {
    height: isShort ? 62 : 76,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  polCaption: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    marginTop: 4,
  },
  wishTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  wishTagText: {
    color: 'rgba(255,46,138,0.82)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
    flexShrink: 1,
  },

  // Vault
  vaultOuterRing: {
    position: 'absolute',
    width: 194,
    height: 194,
    borderRadius: 97,
    borderWidth: 1.5,
    borderColor: 'rgba(0,180,200,0.30)',
    shadowColor: '#00B4C8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 36,
  },
  vaultInnerRing: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    borderColor: 'rgba(0,180,200,0.18)',
  },
  vaultBox: {
    width: isShort ? 98 : 118,
    height: isShort ? 98 : 118,
    borderRadius: isShort ? 30 : 38,
    backgroundColor: 'rgba(0,180,200,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,180,200,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00B4C8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    marginBottom: 14,
  },
  vaultPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,180,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,180,200,0.28)',
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  vaultPillText: {
    color: '#00B4C8',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.4,
  },

  // Settings
  settingsAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(0,200,160,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  settingsAvatarLabel: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginBottom: 10,
  },
  settingsMock: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 18,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  settingsIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.80)',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },

  // Every Couple
  coupleGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,46,138,0.14)',
    shadowColor: '#FF3C64',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 50,
  },
  coupleLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },

  // Final CTA
  finalGlowOuter: {
    position: 'absolute',
    width: 248,
    height: 248,
    borderRadius: 124,
    backgroundColor: 'rgba(255,46,138,0.15)',
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 60,
  },
  finalGlowInner: {
    position: 'absolute',
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 1.5,
    borderColor: 'rgba(255,46,138,0.28)',
  },
});

// ─── Slide definitions ────────────────────────────────────────────────────────
interface SlideRow {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  highlight?: boolean;
}

interface SlideData {
  key: string;
  Visual: React.ComponentType;
  posterTitle?: string;
  accentColor: string;
  headline: string;
  headlineAccent?: string;
  subtext: string;
  rows: SlideRow[];
  couplePills?: Array<{ icon: React.ReactNode; label: string; color: string }>;
  isFinal?: boolean;
  wideVisual?: boolean;
}

const SLIDES: SlideData[] = [
  {
    key: 'welcome',
    Visual: VisualWelcome,
    accentColor: '#FF5A3D',
    headline: 'Welcome to WarmMeUp',
    subtext: 'A private space built exclusively for couples to connect, flirt, play, share, and create unforgettable moments together.',
    rows: [],
    wideVisual: true,
  },
  {
    key: 'why',
    Visual: VisualWhyDifferent,
    accentColor: '#FF2E8A',
    headline: 'Why WarmMeUp is',
    headlineAccent: 'different',
    subtext: "We're not a social network. We're built for one thing — your relationship.",
    rows: [
      { icon: <Users color="#FF5A3D" size={14} strokeWidth={2} />, label: 'Built only for couples' },
      { icon: <Lock color="#FF2E8A" size={14} strokeWidth={2} />, label: 'Completely private' },
      { icon: <Heart color="#FF8A3D" size={14} strokeWidth={2} />, label: 'Designed to strengthen connection' },
      { icon: <Sparkles color="#FFB347" size={14} strokeWidth={2} />, label: 'No followers. No distractions.' },
      { icon: <MessageCircle color="#FF5A3D" size={14} strokeWidth={2} />, label: 'More intimate than social media' },
    ],
  },
  {
    key: 'chat',
    Visual: VisualChat,
    posterTitle: 'Chat',
    accentColor: '#FF8A3D',
    headline: 'Private conversations that actually feel personal.',
    subtext: '',
    rows: [
      { icon: <Lock color="#FF8A3D" size={14} strokeWidth={2} />, label: 'Couple-only chat' },
      { icon: <Mic color="#FFB347" size={14} strokeWidth={2} />, label: 'Voice notes' },
      { icon: <Camera color="#FF5A3D" size={14} strokeWidth={2} />, label: 'Photo sharing' },
      { icon: <Check color="#FF8A3D" size={14} strokeWidth={2} />, label: 'Read receipts' },
      { icon: <Heart color="#FF2E8A" size={14} strokeWidth={2} />, label: 'Playful & intimate communication' },
    ],
  },
  {
    key: 'dare',
    Visual: VisualDare,
    posterTitle: 'Dare',
    accentColor: '#FF6020',
    headline: 'Break routines. Create memories.',
    subtext: 'Playful dares that spark laughter, chemistry, spontaneity and unforgettable moments.',
    rows: [
      { icon: <Zap color="#FF6020" size={14} strokeWidth={2} />, label: 'Spark laughter & chemistry' },
      { icon: <Heart color="#FF2E8A" size={14} strokeWidth={2} />, label: 'Spontaneous shared moments' },
      { icon: <Star color="#FFB347" size={14} strokeWidth={2} />, label: 'Adventurous couple challenges' },
      { icon: <Flame color="#FF6020" size={14} strokeWidth={2} />, label: 'Keep things exciting' },
    ],
  },
  {
    key: 'dice',
    Visual: VisualDice,
    posterTitle: 'Dice',
    accentColor: '#A060FF',
    headline: 'A little randomness keeps things exciting.',
    subtext: '',
    rows: [
      { icon: <Dices color="#A060FF" size={14} strokeWidth={2} />, label: 'Roll and let the app surprise you' },
      { icon: <Sparkles color="#C090FF" size={14} strokeWidth={2} />, label: 'Playful challenges & connection prompts' },
      { icon: <Heart color="#FF2E8A" size={14} strokeWidth={2} />, label: 'Connection & adventurous moments' },
      { icon: <Zap color="#A060FF" size={14} strokeWidth={2} />, label: 'Never run out of ideas' },
    ],
  },
  {
    key: 'wish',
    Visual: VisualWish,
    posterTitle: 'Wish',
    accentColor: '#FF2E8A',
    headline: 'Share what you truly want.',
    subtext: '',
    rows: [
      { icon: <MapPin color="#FF8A3D" size={14} strokeWidth={2} />, label: 'Dream vacations & romantic ideas' },
      { icon: <Heart color="#FF2E8A" size={14} strokeWidth={2} />, label: 'Fantasies & desires' },
      { icon: <Gift color="#FFB347" size={14} strokeWidth={2} />, label: 'Gift ideas & future plans' },
      { icon: <Star color="#FF5A3D" size={14} strokeWidth={2} />, label: 'Tiny wishes & big dreams' },
    ],
  },
  {
    key: 'vault',
    Visual: VisualVault,
    posterTitle: 'Vault',
    accentColor: '#00B4C8',
    headline: 'Your private memories, protected.',
    subtext: '',
    rows: [
      {
        icon: <ImageIcon color="#FF8A3D" size={14} strokeWidth={2} />,
        label: "Not stored in your phone's gallery",
        sub: 'Only inside WarmMeUp',
        highlight: true,
      },
      { icon: <Users color="#00B4C8" size={14} strokeWidth={2} />, label: 'Shared only between you and your partner' },
      { icon: <EyeOff color="#00B4C8" size={14} strokeWidth={2} />, label: 'Optional blur thumbnails' },
      { icon: <Lock color="#00B4C8" size={14} strokeWidth={2} />, label: 'Face ID lock & security' },
      { icon: <Shield color="#00B4C8" size={14} strokeWidth={2} />, label: 'Secure & private by design' },
    ],
  },
  {
    key: 'settings',
    Visual: VisualSettings,
    posterTitle: 'Profile & Settings',
    accentColor: '#00C8A0',
    headline: 'Designed around your relationship.',
    subtext: '',
    rows: [
      { icon: <Shield color="#00C8A0" size={14} strokeWidth={2} />, label: 'Privacy controls' },
      { icon: <Bell color="#FFB347" size={14} strokeWidth={2} />, label: 'Notifications' },
      { icon: <Lock color="#00B4C8" size={14} strokeWidth={2} />, label: 'Vault security' },
      { icon: <Star color="#FF5A3D" size={14} strokeWidth={2} />, label: 'Subscription management' },
      { icon: <Heart color="#FF2E8A" size={14} strokeWidth={2} />, label: 'Relationship preferences' },
      { icon: <User color="#00C8A0" size={14} strokeWidth={2} />, label: 'Personalization' },
    ],
  },
  {
    key: 'couples',
    Visual: VisualEveryCouple,
    accentColor: '#FF3C64',
    headline: 'Built for every couple.',
    subtext: 'WarmMeUp helps you stay emotionally connected, playful and close — every day.',
    rows: [],
    couplePills: [
      { icon: <Heart color="#FF2E8A" size={13} strokeWidth={2} fill="#FF2E8A" />, label: 'New couples',         color: '#FF2E8A' },
      { icon: <MapPin color="#FFB347" size={13} strokeWidth={2} />,               label: 'Long-distance',       color: '#FFB347' },
      { icon: <Star color="#FF8A3D" size={13} strokeWidth={2} />,                  label: 'Married couples',     color: '#FF8A3D' },
      { icon: <Flame color="#FF6020" size={13} strokeWidth={2} />,                 label: 'Playful couples',     color: '#FF6020' },
      { icon: <Sparkles color="#FF5A3D" size={13} strokeWidth={2} />,             label: 'Romantic couples',    color: '#FF5A3D' },
    ],
  },
  {
    key: 'final',
    Visual: VisualFinalCTA,
    accentColor: '#FF5A3D',
    headline: 'Ready to warm\nthings up? ❤️',
    subtext: 'Your private world starts now.',
    rows: [],
    isFinal: true,
    wideVisual: true,
  },
];

// ─── Headline with accent word ────────────────────────────────────────────────
function Headline({ text, accentWord, accentColor }: { text: string; accentWord?: string; accentColor: string }) {
  if (!accentWord) return <AppText style={hl.h}>{text}</AppText>;
  const idx = text.indexOf(accentWord);
  if (idx === -1) return <AppText style={hl.h}>{text}</AppText>;
  return (
    <AppText style={hl.h}>
      {text.slice(0, idx)}
      <AppText style={[hl.h, { color: accentColor }]}>{accentWord}</AppText>
      {text.slice(idx + accentWord.length)}
    </AppText>
  );
}
const hl = StyleSheet.create({
  h: {
    color: '#fff',
    fontSize: isShort ? 20 : 23,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.4,
    lineHeight: isShort ? 26 : 30,
    marginBottom: isShort ? 5 : 8,
  },
});

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={pgb.wrap}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[pgb.seg, i < current ? pgb.done : i === current ? pgb.active : pgb.empty]}>
          {i === current && (
            <LinearGradient
              colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
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
const pgb = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 4, flex: 1 },
  seg:  { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  done: { backgroundColor: '#FF5A3D' },
  active: { backgroundColor: 'transparent' },
  empty: { backgroundColor: 'rgba(255,255,255,0.16)' },
});

// ─── Individual slide ─────────────────────────────────────────────────────────
function Slide({ item, width, visualH }: { item: SlideData; width: number; visualH: number }) {
  const { Visual } = item;
  return (
    <View style={[sl.slide, { width }]}>
      <View style={[sl.visual, { height: visualH }]}>
        <Visual />
      </View>
      <View style={sl.content}>
        {item.posterTitle ? (
          <AppText style={[sl.posterTitle, { color: item.accentColor }]}>{item.posterTitle}</AppText>
        ) : null}
        <Headline text={item.headline} accentWord={item.headlineAccent} accentColor={item.accentColor} />
        {item.subtext ? <AppText style={sl.subtext}>{item.subtext}</AppText> : null}
        {item.rows.length > 0 && (
          <View style={sl.rows}>
            {item.rows.map((row, i) => (
              <FeatureRow key={i} icon={row.icon} label={row.label} sub={row.sub} highlight={row.highlight} />
            ))}
          </View>
        )}
        {item.couplePills && (
          <View style={sl.pillsWrap}>
            {item.couplePills.map((pill, i) => (
              <CouplePill key={i} icon={pill.icon} label={pill.label} color={pill.color} />
            ))}
          </View>
        )}
        {item.isFinal && (
          <View style={sl.stayPlayfulWrap}>
            <Image source={SLOGAN_SOURCE} style={sl.stayPlayfulImg} resizeMode="contain" />
          </View>
        )}
      </View>
    </View>
  );
}
const sl = StyleSheet.create({
  slide: { flex: 1 },
  visual: { overflow: 'hidden' },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: isShort ? 10 : 16,
  },
  posterTitle: {
    fontSize: isShort ? 28 : 34,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.6,
    marginBottom: isShort ? 3 : 5,
    lineHeight: isShort ? 33 : 40,
  },
  subtext: {
    color: 'rgba(255,255,255,0.50)',
    fontSize: isShort ? 12 : 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
    marginBottom: isShort ? 8 : 12,
  },
  rows: { gap: isShort ? 5 : 7 },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  stayPlayfulWrap: { alignItems: 'center', marginTop: isShort ? 10 : 16 },
  stayPlayfulImg: { width: 180, height: 90, opacity: 0.9 },
});

// ─── Main carousel ────────────────────────────────────────────────────────────
export default function OnboardingCarousel({ mode, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList<SlideData>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const topPad = insets.top + 12;
  const bottomPad = Math.max(insets.bottom + 8, 24);

  const slideAnim = useRef(new Animated.Value(0)).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const idx = viewableItems[0].index ?? 0;
      setCurrentIndex(idx);
      Animated.timing(slideAnim, { toValue: idx, duration: 380, useNativeDriver: false }).start();
    }
  }, []);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      onComplete('get-started');
    }
  };

  const topGlow = slideAnim.interpolate({
    inputRange: SLIDE_THEMES.map((_, i) => i),
    outputRange: SLIDE_THEMES.map(t => t.glow),
    extrapolate: 'clamp',
  });
  const bottomGlow = slideAnim.interpolate({
    inputRange: SLIDE_THEMES.map((_, i) => i),
    outputRange: SLIDE_THEMES.map(t => t.glow2),
    extrapolate: 'clamp',
  });

  const currentSlide = SLIDES[currentIndex];
  const visualH = Math.round(
    (currentSlide.wideVisual
      ? (isShort ? 0.44 : 0.50)
      : (isShort ? 0.38 : 0.43)) * SH
  );

  return (
    <View style={s.root}>
      <LinearGradient colors={['#060406', '#08060A', '#0C080C']} style={StyleSheet.absoluteFill} />
      <Animated.View style={[s.ambientTop, { backgroundColor: topGlow }]} pointerEvents="none" />
      <Animated.View style={[s.ambientBottom, { backgroundColor: bottomGlow }]} pointerEvents="none" />

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad }]}>
        <AppText style={s.counter}>{currentIndex + 1} / {SLIDES.length}</AppText>
        <ProgressBar current={currentIndex} total={SLIDES.length} />
        <TouchableOpacity
          style={s.skipBtn}
          onPress={() => onComplete('get-started')}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <AppText style={s.skipText}>Skip</AppText>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={item => item.key}
        renderItem={({ item }) => <Slide item={item} width={SW} visualH={visualH} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
        style={s.list}
        decelerationRate="fast"
        bounces={false}
      />

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: bottomPad }]}>
        {currentSlide.isFinal ? (
          <>
            <TouchableOpacity style={s.primaryBtn} onPress={() => onComplete('get-started')} activeOpacity={0.87}>
              <LinearGradient
                colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.primaryGrad}
              >
                <Sparkles color="#fff" size={15} strokeWidth={2.2} />
                <AppText style={s.primaryLabel}>Get Started</AppText>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => onComplete('invite-partner')} activeOpacity={0.8}>
              <UserPlus color="rgba(255,255,255,0.72)" size={15} strokeWidth={2} />
              <AppText style={s.secondaryLabel}>Invite Your Partner</AppText>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={s.primaryBtn} onPress={handleNext} activeOpacity={0.87}>
            <LinearGradient
              colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.primaryGrad}
            >
              <AppText style={s.primaryLabel}>Next</AppText>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060406' },
  ambientTop: {
    position: 'absolute',
    top: -100,
    left: -100,
    right: -100,
    height: SH * 0.54,
    borderRadius: SH * 0.27,
  },
  ambientBottom: {
    position: 'absolute',
    bottom: -80,
    left: -60,
    right: -60,
    height: SH * 0.42,
    borderRadius: SH * 0.21,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
    zIndex: 10,
  },
  counter: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    flexShrink: 0,
    width: 36,
  },
  skipBtn: { paddingVertical: 4, paddingHorizontal: 2, flexShrink: 0 },
  skipText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  list: { flex: 1 },
  footer: { paddingHorizontal: 24, gap: 10, zIndex: 10 },
  primaryBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    shadowColor: '#FF5A3D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 14,
  },
  primaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: isShort ? 15 : 18,
    borderRadius: Radius.pill,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: isShort ? 13 : 16,
  },
  secondaryLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 0.2,
  },
});
