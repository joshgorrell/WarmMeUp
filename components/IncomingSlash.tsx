import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { onIncoming } from '@/lib/incomingEvents';

const DURATION = 900;

/**
 * Thin hot-pink sliver pinned to the very top edge of the screen.
 * Sweeps left-to-right with a soft fade whenever a new item arrives
 * from the partner while the app is open. Purely visual — no label,
 * no navigation. pointerEvents="none" so it never blocks taps.
 */
export default function IncomingSlash() {
  const translateX = useRef(new Animated.Value(-1)).current; // -1..1 (fraction of width)
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = onIncoming(() => {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 1, duration: DURATION - 240, useNativeDriver: true, easing: undefined }),
        Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start(() => {
        translateX.setValue(-1);
      });
    });
    return unsub;
  }, [translateX, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.root,
        {
          opacity,
          transform: [{ translateX }],
        },
      ]}
    >
      <LinearGradient
        colors={['transparent', 'rgba(255,46,138,0.0)', 'rgba(255,46,138,0.9)', '#FF2E8A', 'rgba(255,46,138,0.9)', 'rgba(255,46,138,0.0)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.slash}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create<{
  root: ViewStyle;
  slash: ViewStyle;
}>({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 9998,
    width: '100%',
  },
  slash: {
    flex: 1,
    width: '100%',
    height: 3,
  borderRadius: 2,
  shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
});
