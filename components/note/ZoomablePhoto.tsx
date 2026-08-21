import React, { useCallback, useEffect } from 'react';
import { Image as RNImage, StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  clamp,
  Easing,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2;

type ZoomablePhotoProps = {
  uri: string;
  width: number;
  height: number;
  onLoad: () => void;
  onError: () => void;
};

export function ZoomablePhoto({
  uri,
  width,
  height,
  onLoad,
  onError,
}: ZoomablePhotoProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = useCallback(() => {
    'worklet';
    scale.value = withSpring(1, { damping: 18, stiffness: 220 });
    savedScale.value = 1;
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  // Reset zoom when the URI changes (swiping to a different photo)
  useEffect(() => {
    resetZoom();
  }, [uri, resetZoom]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = savedScale.value * e.scale;
      scale.value = clamp(newScale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        // Snap back to 1x with spring
        scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Clamp the saved scale so next pinch starts from current
        savedScale.value = clamp(scale.value, MIN_SCALE, MAX_SCALE);
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(true)
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      // Only allow panning when zoomed in
      if (scale.value <= 1.01) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd((e) => {
      if (scale.value <= 1.01) return;
      // Calculate bounds for clamping
      const scaledW = width * scale.value;
      const scaledH = height * scale.value;
      const maxX = Math.max(0, (scaledW - width) / 2);
      const maxY = Math.max(0, (scaledH - height) / 2);

      const clampedX = clamp(translateX.value, -maxX, maxX);
      const clampedY = clamp(translateY.value, -maxY, maxY);

      // If the pan overshot, spring back to the clamped position
      if (translateX.value !== clampedX || translateY.value !== clampedY) {
        translateX.value = withSpring(clampedX, { damping: 20, stiffness: 240 });
        translateY.value = withSpring(clampedY, { damping: 20, stiffness: 240 });
      }

      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  // Double-tap to toggle zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.5) {
        // Zoomed in — reset to 1x
        scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom in to 2x, centered on tap location
        const tapX = e.x - width / 2;
        const tapY = e.y - height / 2;
        scale.value = withTiming(DOUBLE_TAP_SCALE, {
          duration: 280,
          easing: Easing.out(Easing.ease),
        });
        // Offset so the tapped point stays under the finger
        const maxX = (width * DOUBLE_TAP_SCALE - width) / 2;
        const maxY = (height * DOUBLE_TAP_SCALE - height) / 2;
        const targetX = clamp(-tapX * (DOUBLE_TAP_SCALE - 1), -maxX, maxX);
        const targetY = clamp(-tapY * (DOUBLE_TAP_SCALE - 1), -maxY, maxY);
        translateX.value = withTiming(targetX, {
          duration: 280,
          easing: Easing.out(Easing.ease),
        });
        translateY.value = withTiming(targetY, {
          duration: 280,
          easing: Easing.out(Easing.ease),
        });
        savedScale.value = DOUBLE_TAP_SCALE;
        savedTranslateX.value = targetX;
        savedTranslateY.value = targetY;
      }
    });

  // Single tap should not be captured here — let it pass through to the parent
  // (for dismissing controls, etc). We compose pinch + pan + doubleTap.
  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture,
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.photoWrap, { width, height }]}>
          <Animated.View style={[styles.imageContainer, { width, height }, animatedStyle]}>
            <RNImage
              key={uri}
              source={{ uri }}
              style={{ width, height }}
              resizeMode="contain"
              onLoad={onLoad}
              onError={onError}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  photoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

export default ZoomablePhoto;
