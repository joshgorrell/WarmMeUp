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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SW, height: SH } = Dimensions.get('window');

export type OnboardingMode = 'preview' | 'post-auth';
export type OnboardingFinishAction = 'get-started' | 'invite-partner';

interface Props {
  mode: OnboardingMode;
  onComplete: (action?: OnboardingFinishAction) => void;
}

// ─── Slide image assets ───────────────────────────────────────────────────────
// Loaded statically so they are bundled and decoded before the carousel mounts.
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

// ─── Slide definitions ────────────────────────────────────────────────────────
interface SlideData {
  key: string;
  image: ReturnType<typeof require>;
  // Slides 1–10 have a single "Next / Get Started" tap zone.
  // Slide 11 (upsell) has two zones: primary CTA + invite partner.
  isUpsell?: boolean;
  // Last tour slide triggers onComplete instead of advancing.
  isFinalTour?: boolean;
}

const SLIDES: SlideData[] = [
  { key: 'step1',  image: SLIDE_IMAGES[0]  },
  { key: 'step2',  image: SLIDE_IMAGES[1]  },
  { key: 'step3',  image: SLIDE_IMAGES[2]  },
  { key: 'step4',  image: SLIDE_IMAGES[3]  },
  { key: 'step5',  image: SLIDE_IMAGES[4]  },
  { key: 'step6',  image: SLIDE_IMAGES[5]  },
  { key: 'step7',  image: SLIDE_IMAGES[6]  },
  { key: 'step8',  image: SLIDE_IMAGES[7]  },
  { key: 'step9',  image: SLIDE_IMAGES[8]  },
  { key: 'step10', image: SLIDE_IMAGES[9],  isFinalTour: true  },
  { key: 'step11', image: SLIDE_IMAGES[10], isUpsell: true },
];

// ─── Tap zone positions ───────────────────────────────────────────────────────
// All y-positions are fractions of screen height so they track across iPhone
// sizes (SE 667 pt → Pro Max 932 pt). The images use `contain` so artwork is
// never cropped; black fills any letterbox bands.
//
// Reference frame: 390 × 844 pt (iPhone 14)
//   "Next →" pill on slides 1–9:          ~92.5 % from top
//   "Get Started →" pill on slide 10:     ~92.5 % from top
//   "Join Now →" pill on slide 11:        ~88.5 % from top
//   "Invite a Partner" on slide 11:       ~93.5 % from top

const NEXT_BTN_TOP    = SH * 0.925;
const NEXT_BTN_HEIGHT = 58;

const UPSELL_JOIN_TOP      = SH * 0.882;
const UPSELL_JOIN_HEIGHT   = 58;
const UPSELL_INVITE_TOP    = SH * 0.933;
const UPSELL_INVITE_HEIGHT = 48;

// ─── Individual slide ─────────────────────────────────────────────────────────
function Slide({
  item,
  onNext,
  onComplete,
}: {
  item: SlideData;
  onNext: () => void;
  onComplete: (action?: OnboardingFinishAction) => void;
}) {
  return (
    <View style={{ width: SW, height: SH, backgroundColor: '#000' }}>
      <ImageBackground
        source={item.image}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessibilityLabel={`Onboarding slide ${item.key}`}
      />

      {/* Invisible tap zones only */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {item.isUpsell ? (
          <>
            {/* Join Now */}
            <TouchableOpacity
              style={[s.zone, { top: UPSELL_JOIN_TOP, height: UPSELL_JOIN_HEIGHT }]}
              onPress={() => onComplete('get-started')}
              activeOpacity={1}
              accessibilityLabel="Join Now"
              accessibilityRole="button"
            />
            {/* Invite a Partner */}
            <TouchableOpacity
              style={[s.zone, { top: UPSELL_INVITE_TOP, height: UPSELL_INVITE_HEIGHT }]}
              onPress={() => onComplete('invite-partner')}
              activeOpacity={1}
              accessibilityLabel="Invite a Partner"
              accessibilityRole="button"
            />
          </>
        ) : item.isFinalTour ? (
          /* "Get Started" on the last tour slide */
          <TouchableOpacity
            style={[s.zone, { top: NEXT_BTN_TOP, height: NEXT_BTN_HEIGHT }]}
            onPress={() => onNext()}
            activeOpacity={1}
            accessibilityLabel="Get Started"
            accessibilityRole="button"
          />
        ) : (
          /* "Next" on regular tour slides */
          <TouchableOpacity
            style={[s.zone, { top: NEXT_BTN_TOP, height: NEXT_BTN_HEIGHT }]}
            onPress={onNext}
            activeOpacity={1}
            accessibilityLabel="Next"
            accessibilityRole="button"
          />
        )}

        {/* Skip — covers the top-right corner where "Skip" lives in the artwork */}
        <TouchableOpacity
          style={s.skipZone}
          onPress={() => onComplete('get-started')}
          activeOpacity={1}
          accessibilityLabel="Skip"
          accessibilityRole="button"
        />
      </View>
    </View>
  );
}

// ─── Main carousel ────────────────────────────────────────────────────────────
export default function OnboardingCarousel({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList<SlideData>>(null);
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
    const nextIndex = currentIndex + 1;
    if (nextIndex < SLIDES.length) {
      flatRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    } else {
      onComplete('get-started');
    }
  }, [currentIndex, onComplete]);

  return (
    <View style={s.root}>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <Slide item={item} onNext={handleNext} onComplete={onComplete} />
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
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Base for all invisible tap zones
  zone: {
    position: 'absolute',
    left: '6%',
    right: '6%',
  },
  // Skip tap zone — top-right quadrant matching artwork placement
  skipZone: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: SW * 0.28,
    height: SH * 0.10,
  },
});
