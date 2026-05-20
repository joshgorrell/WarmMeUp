import React, { useRef } from 'react';
import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Hop as Home, Dice6, Flame, MessageSquareHeart, Sparkles, Lock } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient, FontSize, NavHeight } from '@/constants/theme';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';


const TABS = [
  { name: 'index', label: 'Home', Icon: Home },
  { name: 'note', label: 'Chat', Icon: MessageSquareHeart },
  { name: 'dare', label: 'Dare', Icon: Flame },
  { name: 'dice', label: 'Dice', Icon: Dice6 },
  { name: 'wish', label: 'Wish', Icon: Sparkles },
  { name: 'vault', label: 'Vault', Icon: Lock },
];

function WarmTab({
  label,
  Icon,
  active,
  onPress,
  badge,
  iconSize,
  labelFontSize,
}: {
  label: string;
  Icon: React.ComponentType<{ color: string; size: number; strokeWidth: number }>;
  active: boolean;
  onPress: () => void;
  badge?: number;
  iconSize: number;
  labelFontSize: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 65, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const iconColor = active ? '#FF2E8A' : 'rgba(255,220,200,0.32)';
  const labelColor = active ? '#FF6B3D' : 'rgba(255,220,200,0.30)';

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1} style={styles.tab}>
      <Animated.View style={[styles.tabInner, { transform: [{ scale }] }]}>
        <View>
          <Icon color={iconColor} size={iconSize} strokeWidth={active ? 2 : 1.75} />
          {!!badge && badge > 0 && (
            <View style={styles.badge}>
              <AppText style={styles.badgeText}>{badge > 9 ? '9+' : badge}</AppText>
            </View>
          )}
        </View>
        <AppText style={[styles.tabLabel, { color: labelColor, fontSize: labelFontSize }]}>{label}</AppText>
        {active && (
          <View style={styles.underline}>
            <LinearGradient
              colors={Gradient.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const iconSize = Math.min(Math.round(width / 20), 24);
  const labelFontSize = Math.min(Math.round(width / 42), 11);

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          height: NavHeight + Math.max(insets.bottom - 10, 0),
        },
      ]}
    >
      {/* Gradient top-line — the "lit from within" edge */}
      <LinearGradient
        colors={['transparent', 'rgba(255,46,138,0.55)', 'rgba(255,90,61,0.40)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topLine}
        pointerEvents="none"
      />

      {TABS.map((tab, idx) => (
        <WarmTab
          key={tab.name}
          label={tab.label}
          Icon={tab.Icon}
          active={state.index === idx}
          onPress={() => navigation.navigate(tab.name)}
          badge={undefined}
          iconSize={iconSize}
          labelFontSize={labelFontSize}
        />
      ))}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="note" />
      <Tabs.Screen name="dare" />
      <Tabs.Screen name="dice" />
      <Tabs.Screen name="wish" />
      <Tabs.Screen name="vault" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#05040A',
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  tabInner: {
    alignItems: 'center',
    gap: 4,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: 'Inter-Medium',
    letterSpacing: 0.2,
  },
  underline: {
    position: 'absolute',
    bottom: -5,
    width: 28,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF2E8A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#05040A',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    lineHeight: 12,
  },
});
