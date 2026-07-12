import React, { useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, ViewStyle } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import Badge from './Badge';

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress?: () => void;
  variant?: 'default' | 'active' | 'locked';
  badge?: string;
  width?: number | string;
  style?: ViewStyle;
}

export default function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  variant = 'default',
  badge,
  width,
  style,
}: ActionCardProps) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.95, friction: 8, tension: 100, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
  };

  const isLocked = variant === 'locked';
  const isActive = variant === 'active';

  const borderColors = isActive
    ? (['rgba(255,90,61,0.7)', 'rgba(255,46,138,0.7)'] as const)
    : (['rgba(255,179,71,0.30)', 'rgba(255,46,138,0.30)'] as const);

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        width ? { width: width as any } : null,
        isActive && styles.activeGlow,
        style,
      ]}
    >
      <TouchableOpacity
        onPress={isLocked ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        disabled={isLocked}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <LinearGradient
          colors={borderColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.border}
        >
          <View style={[
            styles.card,
            {
              backgroundColor: isActive
                ? 'rgba(255,46,138,0.10)'
                : colors.card,
            },
          ]}>
            {/* Icon area with glow */}
            <View style={[styles.iconArea, isActive && styles.iconAreaActive]}>
              {isLocked ? <Lock color="rgba(255,255,255,0.30)" size={28} strokeWidth={2} /> : icon}
            </View>

            <AppText style={[styles.title, { color: isLocked ? colors.textMuted : colors.text }]}>
              {title}
            </AppText>
            <AppText style={[styles.sub, { color: colors.textMuted }]}>
              {subtitle}
            </AppText>

            {badge && (
              <View style={styles.badge}>
                <Badge label={badge} variant={isActive ? 'active' : 'new'} />
              </View>
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  border: {
    borderRadius: Radius.lg,
    padding: 1,
  },
  card: {
    borderRadius: Radius.lg - 1,
    padding: Spacing.card,
    minHeight: 138,
    gap: 6,
  },
  iconArea: {
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  iconAreaActive: {
    opacity: 1,
  },
  title: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    lineHeight: 22,
  },
  sub: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  badge: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  activeGlow: {
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 8,
  },
});
