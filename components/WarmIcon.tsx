import React from 'react';
import { View, Platform } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLG, Stop, Rect } from 'react-native-svg';
import { Hop as Home, Activity, Trophy, Lock, User, Settings, Dices, Zap, MessageCircle, Mail, Cloud, EyeOff, X, ChevronRight, Check, CircleX, Camera, Video, Share2, Save, Shield, ScanFace, KeyRound, Heart, Sparkles, Star, Flame, Gift, Send, Bell } from 'lucide-react-native';
import { Gradient } from '@/constants/theme';

const ICONS = {
  home: Home,
  activity: Activity,
  trophy: Trophy,
  score: Trophy,
  lock: Lock,
  vault: Lock,
  user: User,
  profile: User,
  settings: Settings,
  dice: Dices,
  bolt: Zap,
  dare: Zap,
  chat: MessageCircle,
  tellme: MessageCircle,
  note: Mail,
  envelope: Mail,
  cloud: Cloud,
  weather: Cloud,
  stealth: EyeOff,
  'eye-off': EyeOff,
  close: X,
  x: X,
  chevron: ChevronRight,
  'chevron-right': ChevronRight,
  check: Check,
  noway: CircleX,
  'x-circle': CircleX,
  camera: Camera,
  video: Video,
  share: Share2,
  save: Save,
  shield: Shield,
  faceid: ScanFace,
  pin: KeyRound,
  heart: Heart,
  sparkle: Sparkles,
  star: Star,
  flame: Flame,
  gift: Gift,
  send: Send,
  bell: Bell,
} as const;

export type WarmIconName = keyof typeof ICONS;

interface WarmIconProps {
  name: WarmIconName;
  size?: number;
  active?: boolean;
  glow?: boolean;
  muted?: boolean;
  color?: string;
  strokeWidth?: number;
}

export default function WarmIcon({
  name,
  size = 24,
  active,
  glow,
  muted,
  color,
  strokeWidth = 2.25,
}: WarmIconProps) {
  const Icon = ICONS[name] ?? Home;

  const resolvedColor = color
    ? color
    : active
      ? Gradient.primaryMid
      : muted
        ? 'rgba(255,255,255,0.45)'
        : 'rgba(255,255,255,0.85)';

  const glowStyle = (active || glow)
    ? Platform.select({
        web: { filter: 'drop-shadow(0 0 10px rgba(255,46,138,0.45))' } as any,
        default: {
          shadowColor: '#FF2E8A',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.55,
          shadowRadius: 10,
          elevation: 6,
        },
      })
    : undefined;

  if (active) {
    return (
      <View style={[{ width: size, height: size }, glowStyle as any]}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Defs>
            <SvgLG id={`wi-${name}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={Gradient.primary[0]} />
              <Stop offset="0.5" stopColor={Gradient.primary[1]} />
              <Stop offset="1" stopColor={Gradient.primary[3]} />
            </SvgLG>
          </Defs>
          <Rect width={size} height={size} fill={`url(#wi-${name})`} opacity={0} />
        </Svg>
        <Icon
          color={Gradient.primaryMid}
          size={size}
          strokeWidth={strokeWidth}
        />
      </View>
    );
  }

  return (
    <View style={glowStyle as any}>
      <Icon color={resolvedColor} size={size} strokeWidth={strokeWidth} />
    </View>
  );
}
