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
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 550;
const EDGE_RESISTANCE = 0.35;

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

function getContainedSize(containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number) {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { width: containerWidth, height: containerHeight };
  }
  const ratio = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  return { width: imageWidth * ratio, height: imageHeight * ratio };
}

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
  const imageWidth = useSharedValue(width);
  const imageHeight = useSharedValue(height);
  const pinchStartScale = useSharedValue(1);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);

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

  const settleWithinBounds = (animated = true) => {
    'worklet';
    const maxX = Math.max(0, (imageWidth.value * scale.value - width) / 2);
    const maxY = Math.max(0, (imageHeight.value * scale.value - height) / 2);
    const x = clamp(translateX.value, -maxX, maxX);
    const y = clamp(translateY.value, -maxY, maxY);
    if (animated) {
      translateX.value = withTiming(x, { duration: 180, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(y, { duration: 180, easing: Easing.out(Easing.ease) });
    } else {
      translateX.value = x;
      translateY.value = y;
    }
    savedTranslateX.value = x;
    savedTranslateY.value = y;
  };

  const pinchGesture = Gesture.Pinch()
    .onBegin((e) => {
      pinchStartScale.value = scale.value;
      pinchStartX.value = translateX.value;
      pinchStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      const nextScale = clamp(pinchStartScale.value * e.scale, MIN_SCALE, MAX_SCALE);
      const scaleRatio = nextScale / pinchStartScale.value;
      const focalX = e.focalX - width / 2;
      const focalY = e.focalY - height / 2;
      scale.value = nextScale;
      translateX.value = focalX - (focalX - pinchStartX.value) * scaleRatio;
      translateY.value = focalY - (focalY - pinchStartY.value) * scaleRatio;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.ease) });
        translateX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.ease) });
        translateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.ease) });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        savedScale.value = 1;
        runOnJS(updateZoomState)(false);
        return;
      }
      savedScale.value = clamp(scale.value, MIN_SCALE, MAX_SCALE);
      settleWithinBounds(true);
      runOnJS(updateZoomState)(true);
    });

  const panGesture = Gesture.Pan()
    .enabled(isZoomed)
    .minPointers(1)
    .maxPointers(1)
    .onUpdate((e) => {
      if (scale.value <= 1.01) return;
      const maxX = Math.max(0, (imageWidth.value * scale.value - width) / 2);
      const maxY = Math.max(0, (imageHeight.value * scale.value - height) / 2);
      const rawX = savedTranslateX.value + e.translationX;
      const rawY = savedTranslateY.value + e.translationY;

      translateX.value = rawX < -maxX
        ? -maxX + (rawX + maxX) * EDGE_RESISTANCE
        : rawX > maxX
          ? maxX + (rawX - maxX) * EDGE_RESISTANCE
          : rawX;
      translateY.value = rawY < -maxY
        ? -maxY + (rawY + maxY) * EDGE_RESISTANCE
        : rawY > maxY
          ? maxY + (rawY - maxY) * EDGE_RESISTANCE
          : rawY;
    })
    .onEnd(() => {
      if (scale.value <= 1.01) return;
      settleWithinBounds(true);
    });

  const dismissGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .activeOffsetY([-24, 24])
    .failOffsetX([-70, 70])
    .onEnd((e) => {
      const isDeliberateDismiss =
        e.translationY > DISMISS_DISTANCE &&
        e.velocityY > DISMISS_VELOCITY &&
        Math.abs(e.translationY) > Math.abs(e.translationX) * 1.35;
      if (isDeliberateDismiss) {
        runOnJS(dismissViewer)();
      }
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
        scale.value = withTiming(DOUBLE_TAP_SCALE, { duration: 250, easing: Easing.out(Easing.ease) });
        const maxX = Math.max(0, (imageWidth.value * DOUBLE_TAP_SCALE - width) / 2);
        const maxY = Math.max(0, (imageHeight.value * DOUBLE_TAP_SCALE - height) / 2);
        const targetX = clamp(-tapX * (DOUBLE_TAP_SCALE - 1), -maxX, maxX);
        const targetY = clamp(-tapY * (DOUBLE_TAP_SCALE - 1), -maxY, maxY);
        translateX.value = withTiming(targetX, { duration: 250, easing: Easing.out(Easing.ease) });
        translateY.value = withTiming(targetY, { duration: 250, easing: Easing.out(Easing.ease) });
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
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, dismissGesture, composedTap);

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
              onLoad={(event) => {
                const source = event.source;
                const contained = getContainedSize(width, height, source.width ?? width, source.height ?? height);
                imageWidth.value = contained.width;
                imageHeight.value = contained.height;
                onLoad();
              }}
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
