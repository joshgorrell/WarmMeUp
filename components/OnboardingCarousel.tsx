import React, { useRef, useState, useCallback, useMemo } from 'react';
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

// Artwork was designed for iPhone 14 (390 × 844 pt portrait).
// These are the logical design dimensions — used only for tap-zone proportions.
const ART_W = 390;
const ART_H = 844;

export type OnboardingMode = 'preview' | 'post-auth';
export type OnboardingFinishAction = 'get-started' | 'invite-partner';

interface Props {
  mode: OnboardingMode;
  onComplete: (action?: OnboardingFinishAction) => void;
}

// ─── Slide image assets ───────────────────────────────────────────────────────
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

// ─── Image-relative tap zone positions ───────────────────────────────────────
// Expressed as fractions of the artwork's design frame (ART_W × ART_H).
// At runtime we multiply by the contain-scale and add the letterbox offset
// so zones always track the visible button positions regardless of device.
//
// Reference: iPhone 14 (390 × 844) artwork
//   "Next →" / "Get Started →" pill:  y ≈ 91.5 % of ART_H
//   "Join Now →" pill (slide 11):      y ≈ 87.2 %
//   "Invite a Partner" (slide 11):     y ≈ 92.5 %
//   Skip zone: top-right corner        y = 0 %, right edge
//
//   All horizontal zones: left ≈ 6 %, right ≈ 6 % margins (= 88 % wide)

const ZONES = {
  next:   { topFrac: 0.915, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  join:   { topFrac: 0.872, hFrac: 0.069, lFrac: 0.06, rFrac: 0.06 },
  invite: { topFrac: 0.925, hFrac: 0.057, lFrac: 0.06, rFrac: 0.06 },
  skip:   { topFrac: 0.0,   hFrac: 0.11,  lFrac: 0.70, rFrac: 0.0  },
} as const;

// ─── Helper: compute contain layout ──────────────────────────────────────────
function useContainLayout(insetTop: number) {
  return useMemo(() => {
    const scale = Math.min(SW / ART_W, SH / ART_H);
    const renderedW = ART_W * scale;
    const renderedH = ART_H * scale;
    const offsetX = (SW - renderedW) / 2;
    // Centre vertically but respect safe-area so artwork never hides under status bar
    const rawOffsetY = (SH - renderedH) / 2;
    const offsetY = Math.max(rawOffsetY, insetTop);

    // Convert a design-space fraction to a real screen coordinate
    const toScreenY  = (frac: number) => offsetY + frac * renderedH;
    const toScreenH  = (frac: number) => frac * renderedH;
    const toScreenX  = (frac: number) => offsetX + frac * renderedW;
    const toScreenW  = (frac: number) => frac * renderedW;

    return { offsetX, offsetY, renderedW, renderedH, toScreenY, toScreenH, toScreenX, toScreenW };
  }, [insetTop]);
}

// ─── Slide component ──────────────────────────────────────────────────────────
function Slide({
  item,
  index,
  onNext,
  onSkip,
  onComplete,
}: {
  item: ReturnType<typeof require>;
  index: number;
  onNext: () => void;
  onSkip: () => void;
  onComplete: (action: OnboardingFinishAction) => void;
}) {
  const { top: insetTop } = useSafeAreaInsets();
  const layout = useContainLayout(insetTop);

  const isUpsell    = index === LAST_INDEX;

  const nextZone = {
    top:    layout.toScreenY(ZONES.next.topFrac),
    height: layout.toScreenH(ZONES.next.hFrac),
    left:   layout.toScreenX(ZONES.next.lFrac),
    right:  layout.offsetX + layout.renderedW * ZONES.next.rFrac,
  };

  const joinZone = {
    top:    layout.toScreenY(ZONES.join.topFrac),
    height: layout.toScreenH(ZONES.join.hFrac),
    left:   layout.toScreenX(ZONES.join.lFrac),
    right:  layout.offsetX + layout.renderedW * ZONES.join.rFrac,
  };

  const inviteZone = {
    top:    layout.toScreenY(ZONES.invite.topFrac),
    height: layout.toScreenH(ZONES.invite.hFrac),
    left:   layout.toScreenX(ZONES.invite.lFrac),
    right:  layout.offsetX + layout.renderedW * ZONES.invite.rFrac,
  };

  const skipZone = {
    top:    layout.toScreenY(ZONES.skip.topFrac),
    height: layout.toScreenH(ZONES.skip.hFrac),
    left:   layout.toScreenX(ZONES.skip.lFrac),
    right:  layout.offsetX,
  };

  return (
    <View style={s.slide}>
      {/* Contained artwork — black letterbox bars on mismatch devices */}
      <Image
        source={item}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessibilityLabel={`Onboarding step ${index + 1}`}
      />

      {/* Invisible tap zones — positioned relative to rendered image bounds */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {isUpsell ? (
          <>
            <TouchableOpacity
              style={[s.zone, joinZone]}
              onPress={() => onComplete('get-started')}
              activeOpacity={1}
              accessibilityLabel="Join Now"
              accessibilityRole="button"
            />
            <TouchableOpacity
              style={[s.zone, inviteZone]}
              onPress={() => onComplete('invite-partner')}
              activeOpacity={1}
              accessibilityLabel="Invite a Partner"
              accessibilityRole="button"
            />
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[s.zone, nextZone]}
              onPress={onNext}
              activeOpacity={1}
              accessibilityLabel={index === LAST_INDEX - 1 ? 'Get Started' : 'Next'}
              accessibilityRole="button"
            />
            <TouchableOpacity
              style={[s.zone, skipZone]}
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

// ─── Main carousel ────────────────────────────────────────────────────────────
export default function OnboardingCarousel({ onComplete }: Props) {
  const flatRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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

  // Skip jumps directly to the upsell slide (slide 11, index 10)
  const handleSkip = useCallback(() => {
    flatRef.current?.scrollToIndex({ index: LAST_INDEX, animated: true });
  }, []);

  return (
    <View style={s.root}>
      <FlatList
        ref={flatRef}
        data={SLIDE_IMAGES}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <Slide
            item={item}
            index={index}
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
