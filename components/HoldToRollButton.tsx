import React, { useRef } from 'react';
import { TouchableOpacity, StyleSheet, View, Animated } from 'react-native';
import AppText from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradient, FontSize, Radius } from '@/constants/theme';

interface HoldToRollButtonProps {
  onComplete: () => void;
  disabled?: boolean;
  label?: string;
  durationMs?: number;
}

export default function HoldToRollButton({
  onComplete,
  disabled,
  label = 'Hold to Roll',
  durationMs = 2000,
}: HoldToRollButtonProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

  const start = () => {
    if (disabled) return;
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, friction: 8 }).start();
    anim.current = Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false,
    });
    anim.current.start(({ finished }) => {
      if (finished) onComplete();
    });
  };

  const cancel = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    anim.current?.stop();
    Animated.timing(progress, { toValue: 0, duration: 220, useNativeDriver: false }).start();
  };

  const fillW = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: fillW as any }]}>
          <LinearGradient
            colors={Gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>

      <Animated.View style={{ width: '100%', transform: [{ scale }] }}>
        <TouchableOpacity
          activeOpacity={1}
          onPressIn={start}
          onPressOut={cancel}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Hold to roll dice"
          style={styles.btn}
        >
          <LinearGradient
            colors={Gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btnGrad}
          >
            <AppText style={styles.label}>{label}</AppText>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', gap: 18 },
  track: {
    width: '80%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  btn: { width: '100%', borderRadius: Radius.pill, overflow: 'hidden' },
  btnGrad: { height: 58, alignItems: 'center', justifyContent: 'center' },
  label: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
});
