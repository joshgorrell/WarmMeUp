import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  clamp,
  Easing,
  runOnJS,
  withDecay,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

type ZoomablePhotoProps = {
  uri: string;
  width: number;
  height: number;
  onLoad: () => void;
  onError: () => void;
  onTap?: () => void;
};

export function ZoomablePhoto({
  uri,
  width,
  height,
  onLoad,
  onError,
  onTap,
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
        scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = clamp(scale.value, MIN_SCALE, MAX_SCALE);
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      if (scale.value <= 1.01) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd((e) => {
      if (scale.value <= 1.01) return;
      const scaledW = width * scale.value;
      const scaledH = height * scale.value;
      const maxX = Math.max(0, (scaledW - width) / 2);
      const maxY = Math.max(0, (scaledH - height) / 2);

      const clampedX = clamp(translateX.value, -maxX, maxX);
      const clampedY = clamp(translateY.value, -maxY, maxY);

      // If at horizontal edge and swiping further, decay so the parent
      // FlatList can take over and page to the next item.
      if (maxX > 0) {
        const atLeftEdge = translateX.value >= maxX - 1 && e.velocityX > 0;
        const atRightEdge = translateX.value <= -maxX + 1 && e.velocityX < 0;
        if (atLeftEdge || atRightEdge) {
          translateX.value = withDecay({
            velocity: e.velocityX,
            clamp: [-maxX, maxX],
          });
          savedTranslateX.value = clamp(translateX.value, -maxX, maxX);
          return;
        }
      }

      if (translateX.value !== clampedX || translateY.value !== clampedY) {
        translateX.value = withSpring(clampedX, { damping: 20, stiffness: 240 });
        translateY.value = withSpring(clampedY, { damping: 20, stiffness: 240 });
      }
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.5) {
        scale.value = withSpring(1, { damping: 18, stiffness: 220 });
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const tapX = e.x - width / 2;
        const tapY = e.y - height / 2;
        scale.value = withTiming(DOUBLE_TAP_SCALE, {
          duration: 280,
          easing: Easing.out(Easing.ease),
        });
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

  // Single tap to toggle controls. Exclusive with double-tap so the
  // single tap only fires if the double-tap doesn't activate.
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onTap) runOnJS(onTap)();
    });

  const composedTap = Gesture.Exclusive(doubleTapGesture, singleTapGesture);
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, composedTap);

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
