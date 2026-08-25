import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  clamp,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 650;

type ZoomablePhotoProps = {
  uri: string;
  width: number;
  height: number;
  onLoad: () => void;
  onError: () => void;
  onTap?: () => void;
  onZoomChange?: (zoomed: boolean) => void;
  onDismiss?: () => void;
};

export function ZoomablePhoto({
  uri,
  width,
  height,
  onLoad,
  onError,
  onTap,
  onZoomChange,
  onDismiss,
}: ZoomablePhotoProps) {
  const router = useRouter();
  const [isZoomed, setIsZoomed] = useState(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const updateZoomState = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
    onZoomChange?.(zoomed);
  }, [onZoomChange]);

  const dismissViewer = useCallback(() => {
    if (onDismiss) onDismiss();
    else router.back();
  }, [onDismiss, router]);

  const resetZoom = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  useEffect(() => {
    resetZoom();
    updateZoomState(false);
  }, [uri, resetZoom, updateZoomState]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = savedScale.value * e.scale;
      scale.value = clamp(newScale, MIN_SCALE, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        savedScale.value = 1;
        runOnJS(updateZoomState)(false);
        return;
      }
      savedScale.value = clamp(scale.value, MIN_SCALE, MAX_SCALE);
      runOnJS(updateZoomState)(true);
    });

  // At normal size, one-finger horizontal swipes remain available to the parent
  // gallery. Once zoomed, one finger pans the enlarged photo naturally.
  // A deliberate fast/downward swipe still dismisses the full-screen viewer.
  const panGesture = Gesture.Pan()
    .enabled(isZoomed)
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((e) => {
      if (scale.value <= 1.01) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd((e) => {
      if (scale.value <= 1.01) return;

      const isDeliberateDismiss =
        e.translationY > DISMISS_DISTANCE &&
        e.velocityY > DISMISS_VELOCITY &&
        Math.abs(e.translationY) > Math.abs(e.translationX) * 1.15;

      if (isDeliberateDismiss) {
        runOnJS(dismissViewer)();
        return;
      }

      const scaledW = width * scale.value;
      const scaledH = height * scale.value;
      const maxX = Math.max(0, (scaledW - width) / 2);
      const maxY = Math.max(0, (scaledH - height) / 2);

      const clampedX = clamp(translateX.value, -maxX, maxX);
      const clampedY = clamp(translateY.value, -maxY, maxY);

      translateX.value = clampedX;
      translateY.value = clampedY;
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.5) {
        scale.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
        translateX.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.ease) });
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.ease) });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(updateZoomState)(false);
      } else {
        const tapX = e.x - width / 2;
        const tapY = e.y - height / 2;
        scale.value = withTiming(DOUBLE_TAP_SCALE, {
          duration: 250,
          easing: Easing.out(Easing.ease),
        });
        const maxX = (width * DOUBLE_TAP_SCALE - width) / 2;
        const maxY = (height * DOUBLE_TAP_SCALE - height) / 2;
        const targetX = clamp(-tapX * (DOUBLE_TAP_SCALE - 1), -maxX, maxX);
        const targetY = clamp(-tapY * (DOUBLE_TAP_SCALE - 1), -maxY, maxY);
        translateX.value = withTiming(targetX, {
          duration: 250,
          easing: Easing.out(Easing.ease),
        });
        translateY.value = withTiming(targetY, {
          duration: 250,
          easing: Easing.out(Easing.ease),
        });
        savedScale.value = DOUBLE_TAP_SCALE;
        savedTranslateX.value = targetX;
        savedTranslateY.value = targetY;
        runOnJS(updateZoomState)(true);
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onTap) runOnJS(onTap)();
    });

  const composedTap = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, composedTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.photoWrap, { width, height }]}>
          <Animated.View style={[styles.imageContainer, { width, height }, animatedStyle]}>
            <ExpoImage
              key={uri}
              source={{ uri }}
              style={{ width, height }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={120}
              recyclingKey={uri}
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
