import { useWindowDimensions } from 'react-native';

export function useLayout() {
  const { width, height } = useWindowDimensions();

  const isPhone = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isLargeTablet = width >= 1024;
  const isTabletOrLarger = width >= 768;

  // Pick a value based on breakpoint tier; largeTablet falls back to tablet if omitted
  function cols(phone: number, tablet: number, largeTablet?: number): number {
    if (isLargeTablet) return largeTablet ?? tablet;
    if (isTabletOrLarger) return tablet;
    return phone;
  }

  const contentMaxWidth = isLargeTablet
    ? Math.min(width, 1100)
    : isTablet
    ? Math.min(width, 900)
    : width;

  const contentPadding = isLargeTablet ? 48 : isTablet ? 32 : 20;

  return {
    width,
    height,
    isPhone,
    isTablet,
    isLargeTablet,
    isTabletOrLarger,
    // kept for compatibility — callers that used isTablet meaning "anything >= 600"
    // now get the correct ≥768 value; isWide was always an internal detail
    isWide: isTabletOrLarger,
    cols,
    contentMaxWidth,
    contentPadding,
  };
}
