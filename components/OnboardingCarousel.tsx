import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
  Image,
  ViewToken,
} from 'react-native';
import { Asset } from 'expo-asset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const SLIDE_NAMES = [
  'Intro_Step_1',
  'Intro_Step_2',
  'Intro_Step_3',
  'Intro_Step_4',
  'Intro_Step_5',
  'Intro_Step_6',
  'Intro_Step_7',
  'Intro_Step_8',
  'Intro_Step_9',
  'Intro_Step_10',
  'Intro_Step_11',
];

const LAST_INDEX = SLIDE_IMAGES.length - 1; // 10

// ─── Tap zone fractions (relative to image canvas) ───────────────────────────
const ZONES = {
  next:   { topFrac: 0.915, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  join:   { topFrac: 0.872, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  invite: { topFrac: 0.925, hFrac: 0.057, lFrac: 0.06, rFrac: 0.06 },
  skip:   { topFrac: 0.0,   hFrac: 0.11,  lFrac: 0.70, rFrac: 0.0  },
} as const;

type ImageSize = { w: number; h: number };

// ─── Per-asset probe (three stages) ──────────────────────────────────────────
async function probeAssetSize(
  asset: ReturnType<typeof require>,
  index: number,
): Promise<ImageSize> {
  // Stage 1: resolveAssetSource + getSize
  try {
    const uri = Image.resolveAssetSource(asset).uri;
    const size = await new Promise<ImageSize>((ok, fail) => {
      Image.getSize(uri, (w, h) => ok({ w, h }), fail);
    });
    console.log(`[probeAssetSize] slide ${index} via resolveAssetSource: ${size.w}x${size.h}px`);
    return size;
  } catch (e) {
    console.warn(`[probeAssetSize] slide ${index} resolveAssetSource/getSize failed – trying expo-asset:`, e);
  }

  // Stage 2: expo-asset Asset.fromModule
  try {
    const a = Asset.fromModule(asset);
    await a.downloadAsync();
    if (a.width && a.height) {
      console.log(`[probeAssetSize] slide ${index} via expo-asset: ${a.width}x${a.height}px`);
      return { w: a.width, h: a.height };
    }
    console.warn(`[probeAssetSize] slide ${index} expo-asset width/height null`);
  } catch (e2) {
    console.warn(`[probeAssetSize] slide ${index} expo-asset failed:`, e2);
  }

  // Stage 3: hardcoded fallback
  console.warn(`[probeAssetSize] slide ${index} ALL probes failed – using fallback 390x844`);
  return { w: 390, h: 844 };
}

// ─── Multi-asset size hook ────────────────────────────────────────────────────
function useSlideImageSizes(assets: ReturnType<typeof require>[]): Array<ImageSize | null> {
  const [sizes, setSizes] = useState<Array<ImageSize | null>>(
    () => assets.map(() => null),
  );

  useEffect(() => {
    let cancelled = false;

    assets.forEach((asset, i) => {
      probeAssetSize(asset, i).then((size) => {
        if (!cancelled) {
          setSizes((prev) => {
            const next = [...prev];
            next[i] = size;
            return next;
          });
        }
      });
    });

    return () => { cancelled = true; };
  }, []);

  return sizes;
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
  screenW: number;
  screenH: number;
  onNext: () => void;
  onSkip: () => void;
  onComplete: (action: OnboardingFinishAction) => void;
}

function Slide({ asset, index, imgW, imgH, screenW, screenH, onNext, onSkip, onComplete }: SlideProps) {
  const { top: insetTop } = useSafeAreaInsets();

  const layout = useMemo(
    () => computeContainLayout(imgW, imgH, screenW, screenH, insetTop, `slide-${index}`),
    [imgW, imgH, screenW, screenH, insetTop, index],
  );

  const isUpsell = index === LAST_INDEX;

  return (
    <View style={{ width: screenW, height: screenH, backgroundColor: '#000' }}>
      <Image
        source={asset}
        style={{
          position: 'absolute',
          left: layout.offsetX,
          top: layout.offsetY,
          width: layout.renderedW,
          height: layout.renderedH,
        }}
        resizeMode="stretch"
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
  const { width: SW, height: SH } = useWindowDimensions();

  const slideSizes = useSlideImageSizes(SLIDE_IMAGES);

  // ── Audit log — fires once all 11 probes are complete ──────────────────────
  useEffect(() => {
    const allDone = slideSizes.every((s) => s !== null);
    if (!allDone) return;

    const sizes = slideSizes as ImageSize[];
    const baseline = sizes[0];

    console.log('[SlideAudit] ── dimension audit ──────────────────────────────');
    sizes.forEach((size, i) => {
      const layout = computeContainLayout(size.w, size.h, SW, SH, 0, `audit-slide-${i}`);
      console.log(
        `[SlideAudit] slide ${String(i).padStart(2, ' ')} (${SLIDE_NAMES[i]}):` +
        `  source=${size.w}x${size.h}` +
        `  rendered=${layout.renderedW.toFixed(1)}x${layout.renderedH.toFixed(1)}`,
      );
    });

    const mismatches = sizes.filter((s, i) => i > 0 && (s.w !== baseline.w || s.h !== baseline.h));
    if (mismatches.length === 0) {
      console.log(
        `[SlideAudit] all 11 slides share source dimensions ${baseline.w}x${baseline.h}` +
        ' — any rendering differences are due to internal artwork padding, not canvas size',
      );
    } else {
      sizes.forEach((s, i) => {
        if (i > 0 && (s.w !== baseline.w || s.h !== baseline.h)) {
          console.warn(
            `[SlideAudit] MISMATCH slide ${i} (${SLIDE_NAMES[i]}): ${s.w}x${s.h}` +
            `  (baseline from slide 0: ${baseline.w}x${baseline.h})`,
          );
        }
      });
    }
    console.log('[SlideAudit] ──────────────────────────────────────────────────');
  }, [slideSizes, SW, SH]);

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

  // Hold off rendering until all 11 probes are done so the audit log fires first.
  const allReady = slideSizes.every((s) => s !== null);
  if (!allReady) {
    return <View style={s.root} />;
  }

  return (
    <View style={s.root}>
      <FlatList
        ref={flatRef}
        data={SLIDE_IMAGES}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => {
          const size = slideSizes[index] as ImageSize;
          return (
            <Slide
              asset={item}
              index={index}
              imgW={size.w}
              imgH={size.h}
              screenW={SW}
              screenH={SH}
              onNext={handleNext}
              onSkip={handleSkip}
              onComplete={onComplete}
            />
          );
        }}
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
  zone: {
    position: 'absolute',
  },
});
