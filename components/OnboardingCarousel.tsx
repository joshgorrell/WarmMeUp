import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Image,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SW, height: SH } = Dimensions.get('window');

export type OnboardingMode = 'preview' | 'post-auth';
export type OnboardingFinishAction = 'get-started' | 'invite-partner';

interface Props {
  mode: OnboardingMode;
  onComplete: (action?: OnboardingFinishAction) => void;
}

// ─── Slide assets ─────────────────────────────────────────────────────────────
const SLIDE_IMAGES = [
  require('@/assets/onboarding/Intro_Step_1.png'),
  require('@/assets/onboarding/Intro_Step_2.png'),
  require('@/assets/onboarding/Intro_Step_3.png'),
  require('@/assets/onboarding/Intro_Step_4.png'),
  require('@/assets/onboarding/Intro_Step_5.png'),
  require('@/assets/onboarding/Intro_Step_6.png'),
  require('@/assets/onboarding/Intro_Step_7.png'),
  require('@/assets/onboarding/Intro_Step_8.png'),
  require('@/assets/onboarding/Intro_Step_9.png'),
  require('@/assets/onboarding/Intro_Step_10.png'),
  require('@/assets/onboarding/Intro_Step_11.png'),
];

const LAST_INDEX = SLIDE_IMAGES.length - 1; // 10

// ─── Tap zone fractions (relative to image canvas) ───────────────────────────
// Applied to the *rendered* image rectangle once real dimensions are known.
//
// Slides 1-10: "Next →" pill + top-right "Skip"
// Slide 11 (upsell): "Join Now" + "Invite a Partner"
const ZONES = {
  next:   { topFrac: 0.915, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  join:   { topFrac: 0.872, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  invite: { topFrac: 0.925, hFrac: 0.057, lFrac: 0.06, rFrac: 0.06 },
  skip:   { topFrac: 0.0,   hFrac: 0.11,  lFrac: 0.70, rFrac: 0.0  },
} as const;

// ─── Runtime image size hook ──────────────────────────────────────────────────
function useImageSize(asset: ReturnType<typeof require>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let uri: string;
    try {
      uri = Image.resolveAssetSource(asset).uri;
    } catch (e) {
      console.warn(
        `[useImageSize] resolveAssetSource threw – screen: ${SW}x${SH} – using fallback 390x844:`,
        e,
      );
      setSize({ w: 390, h: 844 });
      return;
    }
    Image.getSize(
      uri,
      (w, h) => {
        console.log(`[useImageSize] source image: ${w}x${h}px`);
        setSize({ w, h });
      },
      (err) => {
        console.warn(
          `[useImageSize] getSize failed – screen: ${SW}x${SH} – using fallback 390x844:`,
          err,
        );
        setSize({ w: 390, h: 844 });
      },
    );
  }, []);

  return size;
}

// ─── Contain layout calculator ────────────────────────────────────────────────
function computeContainLayout(
  imgW: number,
  imgH: number,
  screenW: number,
  screenH: number,
  minOffsetY: number,
  label: string,
) {
  const scale = Math.min(screenW / imgW, screenH / imgH);
  const renderedW = imgW * scale;
  const renderedH = imgH * scale;
  const offsetX = (screenW - renderedW) / 2;
  const offsetY = Math.max((screenH - renderedH) / 2, minOffsetY);

  console.log(
    `[ContainLayout:${label}] screen: ${screenW}x${screenH}` +
    ` | image: ${imgW}x${imgH}` +
    ` | rendered: ${renderedW.toFixed(1)}x${renderedH.toFixed(1)}` +
    ` | offset: (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`,
  );

  const toZone = (
    topFrac: number,
    hFrac: number,
    lFrac: number,
    rFrac: number,
    zoneName: string,
  ) => {
    const top    = offsetY + topFrac * renderedH;
    const height = hFrac * renderedH;
    const left   = offsetX + lFrac  * renderedW;
    const right  = screenW - (offsetX + (1 - rFrac) * renderedW);
    console.log(
      `[ContainLayout:${label}] zone "${zoneName}":` +
      ` top=${top.toFixed(1)} h=${height.toFixed(1)} left=${left.toFixed(1)} right=${right.toFixed(1)}`,
    );
    return { top, height, left, right } as const;
  };

  return { scale, renderedW, renderedH, offsetX, offsetY, toZone };
}

// ─── Slide component ──────────────────────────────────────────────────────────
interface SlideProps {
  asset: ReturnType<typeof require>;
  index: number;
  imgW: number;
  imgH: number;
  onNext: () => void;
  onSkip: () => void;
  onComplete: (action: OnboardingFinishAction) => void;
}

function Slide({ asset, index, imgW, imgH, onNext, onSkip, onComplete }: SlideProps) {
  const { top: insetTop } = useSafeAreaInsets();

  const layout = useMemo(
    () => computeContainLayout(imgW, imgH, SW, SH, insetTop, `slide-${index}`),
    [imgW, imgH, insetTop, index],
  );

  const isUpsell = index === LAST_INDEX;

  return (
    <View style={s.slide}>
      <Image
        source={asset}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessibilityLabel={`Onboarding step ${index + 1}`}
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {isUpsell ? (
          <>
            <TouchableOpacity
              style={[s.zone, layout.toZone(ZONES.join.topFrac,   ZONES.join.hFrac,   ZONES.join.lFrac,   ZONES.join.rFrac,   'join')]}
              onPress={() => onComplete('get-started')}
              activeOpacity={1}
              accessibilityLabel="Join Now"
              accessibilityRole="button"
            />
            <TouchableOpacity
              style={[s.zone, layout.toZone(ZONES.invite.topFrac, ZONES.invite.hFrac, ZONES.invite.lFrac, ZONES.invite.rFrac, 'invite')]}
              onPress={() => onComplete('invite-partner')}
              activeOpacity={1}
              accessibilityLabel="Invite a Partner"
              accessibilityRole="button"
            />
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[s.zone, layout.toZone(ZONES.next.topFrac, ZONES.next.hFrac, ZONES.next.lFrac, ZONES.next.rFrac, 'next')]}
              onPress={onNext}
              activeOpacity={1}
              accessibilityLabel={index === LAST_INDEX - 1 ? 'Get Started' : 'Next'}
              accessibilityRole="button"
            />
            <TouchableOpacity
              style={[s.zone, layout.toZone(ZONES.skip.topFrac, ZONES.skip.hFrac, ZONES.skip.lFrac, ZONES.skip.rFrac, 'skip')]}
              onPress={onSkip}
              activeOpacity={1}
              accessibilityLabel="Skip"
              accessibilityRole="button"
            />
          </>
        )}
      </View>
    </View>
  );
}

// ─── Main carousel ─────────────────────────────────────────────────────────────
export default function OnboardingCarousel({ onComplete }: Props) {
  const flatRef  = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Measure slide 0 — all slides should share the same canvas.
  const slide0Size = useImageSize(SLIDE_IMAGES[0]);

  // Cross-check every other slide when slide 0 is measured.
  useEffect(() => {
    if (!slide0Size) return;
    SLIDE_IMAGES.slice(1).forEach((asset, i) => {
      let uri: string;
      try {
        uri = Image.resolveAssetSource(asset).uri;
      } catch {
        console.warn(`[OnboardingCarousel] resolveAssetSource threw for slide ${i + 1}`);
        return;
      }
      Image.getSize(uri, (w, h) => {
        if (w !== slide0Size.w || h !== slide0Size.h) {
          console.warn(
            `[OnboardingCarousel] slide ${i + 1} dimensions ${w}x${h}` +
            ` differ from slide 0 (${slide0Size.w}x${slide0Size.h})`,
          );
        } else {
          console.log(`[OnboardingCarousel] slide ${i + 1}: ${w}x${h} ✓`);
        }
      });
    });
  }, [slide0Size]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setCurrentIndex(viewableItems[0].index ?? 0);
      }
    },
    [],
  );

  const handleNext = useCallback(() => {
    const next = currentIndex + 1;
    if (next <= LAST_INDEX) {
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      onComplete('get-started');
    }
  }, [currentIndex, onComplete]);

  const handleSkip = useCallback(() => {
    flatRef.current?.scrollToIndex({ index: LAST_INDEX, animated: true });
  }, []);

  // Hold off rendering until we have real image dimensions.
  if (!slide0Size) {
    return <View style={s.root} />;
  }

  return (
    <View style={s.root}>
      <FlatList
        ref={flatRef}
        data={SLIDE_IMAGES}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <Slide
            asset={item}
            index={index}
            imgW={slide0Size.w}
            imgH={slide0Size.h}
            onNext={handleNext}
            onSkip={handleSkip}
            onComplete={onComplete}
          />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
        decelerationRate="fast"
        bounces={false}
        scrollEnabled={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  slide: {
    width: SW,
    height: SH,
    backgroundColor: '#000',
  },
  zone: {
    position: 'absolute',
  },
});
