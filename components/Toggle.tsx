import React, { useRef, useEffect } from 'react';
import { TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradient } from '@/constants/theme';

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ value, onChange, disabled }: ToggleProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const thumbLeft = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 20] });

  return (
    <TouchableOpacity
      onPress={() => !disabled && onChange(!value)}
      activeOpacity={0.85}
      style={[styles.track, disabled && styles.disabled]}
    >
      {value ? (
        <LinearGradient
          colors={Gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, styles.offBg]} />
      )}
      <Animated.View style={[styles.thumb, { left: thumbLeft }]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    justifyContent: 'center',
    position: 'relative',
  },
  offBg: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 13,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  disabled: { opacity: 0.5 },
});
