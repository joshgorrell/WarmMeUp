import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ImageBackground,
  ViewToken,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// iPhone SE (1st gen) logical height is 568pt; SE 2nd/3rd is 667pt.
// Shift bottom tap zones up on very small screens so they don't fall off.
const IS_SMALL = SH < 700;
const SMALL_SHIFT = IS_SMALL ? -22 : 0;

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

// ─── Tap zone positions ───────────────────────────────────────────────────────
// Expressed as fractions of SH so they track across all iPhone sizes.
// Reference frame: 390 × 844 pt (iPhone 14).
//   "Next →" pill (slides 1–9):           ~92.5 % from top
//   "Get Started →" pill (slide 10):      ~92.5 % from top
//   "Join Now →" pill (slide 11):         ~88.2 % from top
//   "Invite a Partner" (slide 11):        ~93.3 % from top
//   Skip link (top-right of artwork):     top 0, right 0

const NEXT_TOP    = SH * 0.925 + SMALL_SHIFT;
const NEXT_H      = 58;

const JOIN_TOP    = SH * 0.882 + SMALL_SHIFT;
const JOIN_H      = 58;
const INVITE_TOP  = SH * 0.933 + SMALL_SHIFT;
const INVITE_H    = 48;

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
  const isUpsell = index === LAST_INDEX;
  const isFinalTour = index === LAST_INDEX - 1; // slide 10 says "Get Started"

  return (
    <View style={s.slide}>
      {/* Full-bleed portrait image */}
      <ImageBackground
        source={item}
        style={StyleSheet.absoluteFill}
        imageStyle={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityLabel={`Onboarding step ${index + 1}`}
      />

      {/* Invisible tap zones only — zero visible styling */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

        {isUpsell ? (
          <>
            {/* Join Now → Register (unauthenticated) or Paywall (authenticated) */}
            <TouchableOpacity
              style={[s.zone, { top: JOIN_TOP, height: JOIN_H }]}
              onPress={() => onComplete('get-started')}
              activeOpacity={1}
              accessibilityLabel="Join Now"
              accessibilityRole="button"
            />
            {/* Invite a Partner */}
            <TouchableOpacity
              style={[s.zone, { top: INVITE_TOP, height: INVITE_H }]}
              onPress={() => onComplete('invite-partner')}
              activeOpacity={1}
              accessibilityLabel="Invite a Partner"
              accessibilityRole="button"
            />
          </>
        ) : (
          <>
            {/* Next / Get Started */}
            <TouchableOpacity
              style={[s.zone, { top: NEXT_TOP, height: NEXT_H }]}
              onPress={isFinalTour ? () => onNext() : onNext}
              activeOpacity={1}
              accessibilityLabel={isFinalTour ? 'Get Started' : 'Next'}
              accessibilityRole="button"
            />

            {/* Skip — top-right corner, matches artwork placement */}
            <TouchableOpacity
              style={s.skipZone}
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
  // Base for all invisible tap zones
  zone: {
    position: 'absolute',
    left: '6%',
    right: '6%',
  },
  // Skip zone — top-right quadrant, generous hit area
  skipZone: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: SW * 0.30,
    height: SH * 0.11,
  },
});
