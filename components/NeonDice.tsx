import React, { useImperativeHandle, useRef, forwardRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface NeonDiceProps {
  face: number;
  size?: number;
  challengeText?: string | null;
}

export interface NeonDiceHandle {
  roll: (onFaceChange: (f: number) => void, onDone: () => void) => void;
}

const GLOW = '#FF2E8A';

// [row, col] in a 3×3 grid (0 = top/left, 2 = bottom/right)
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function Pips({ face, size }: { face: number; size: number }) {
  const pipSize = size * 0.115;
  const padding = size * 0.17;
  const gridSpan = size - padding * 2 - pipSize;
  const positions = PIP_LAYOUTS[Math.min(6, Math.max(1, face))] ?? PIP_LAYOUTS[1];

  return (
    <View style={StyleSheet.absoluteFill}>
      {positions.map(([row, col], i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: pipSize,
            height: pipSize,
            borderRadius: pipSize / 2,
            top: padding + (row / 2) * gridSpan,
            left: padding + (col / 2) * gridSpan,
            backgroundColor: 'rgba(200,200,210,0.18)',
            shadowColor: '#fff',
            shadowOpacity: 0,
            shadowRadius: 0,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      ))}
    </View>
  );
}

const NeonDice = forwardRef<NeonDiceHandle, NeonDiceProps>(({ face, size = 200, challengeText }, ref) => {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(1)).current;

  useImperativeHandle(ref, () => ({
    roll(onFaceChange, onDone) {
      let cycles = 0;
      const totalCycles = 14;

      const flashLabel = () => {
        Animated.sequence([
          Animated.timing(labelOpacity, { toValue: 0.2, duration: 60, useNativeDriver: true }),
          Animated.timing(labelOpacity, { toValue: 1, duration: 60, useNativeDriver: true }),
        ]).start();
      };

      const interval = setInterval(() => {
        cycles++;
        onFaceChange(Math.ceil(Math.random() * 6));
        flashLabel();
        if (cycles >= totalCycles) clearInterval(interval);
      }, 85);

      Animated.sequence([
        Animated.spring(scale, { toValue: 1.1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(rotate, { toValue: 1, duration: 110, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: -1, duration: 110, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: -1, duration: 100, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: 0.5, duration: 90, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: -0.5, duration: 90, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: 0, duration: 100, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 10, duration: 180, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: -10, duration: 150, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 4, duration: 130, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 100, useNativeDriver: true }),
          ]),
        ]),
        Animated.spring(scale, { toValue: 1.05, friction: 4, tension: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 180, useNativeDriver: true }),
      ]).start(() => {
        Animated.timing(labelOpacity, { toValue: 1, duration: 80, useNativeDriver: true }).start();
        onDone();
      });
    },
  }));

  const radius = size * 0.24;
  const rotateInterp = rotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-20deg', '0deg', '20deg'],
  });

  return (
    <Animated.View
      style={[
        styles.shadow,
        {
          width: size,
          height: size,
          shadowColor: GLOW,
          transform: [{ rotate: rotateInterp }, { scale }, { translateY }],
        },
      ]}
    >
      <LinearGradient
        colors={['#FFB347', '#FF5A3D', '#FF2E8A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradBorder, { borderRadius: radius }]}
      >
        <View
          style={[
            styles.face,
            { width: size - 4, height: size - 4, borderRadius: radius - 2 },
          ]}
        >
          {/* Subtle depth gradient — no circle artifact */}
          <LinearGradient
            colors={['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.22)']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {challengeText ? (
            <Animated.Text
              style={[
                styles.challengeText,
                {
                  color: GLOW,
                  textShadowColor: GLOW,
                  paddingHorizontal: size * 0.1,
                  fontSize: size * 0.11,
                  opacity: labelOpacity,
                },
              ]}
              numberOfLines={4}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
            >
              {challengeText}
            </Animated.Text>
          ) : (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: labelOpacity }]}>
              <Pips face={face} size={size - 4} />
            </Animated.View>
          )}
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

NeonDice.displayName = 'NeonDice';
export default NeonDice;

const styles = StyleSheet.create({
  shadow: {
    shadowOpacity: 0.65,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 6 },
    elevation: 18,
  },
  gradBorder: {
    flex: 1,
    padding: 2,
  },
  face: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0812',
  },
  challengeText: {
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
});
