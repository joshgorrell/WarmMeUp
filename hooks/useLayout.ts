import { useWindowDimensions } from 'react-native';

// Phone-like canvas width used on wide desktop/tablet viewports
const PHONE_MAX_WIDTH = 390;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 600;
  // Viewports wider than 768px (desktop browsers) get a phone-width column
  const isWide = width >= 768;

  // Pick a value based on phone vs tablet
  function cols(phone: number, tablet: number): number {
    return isTablet ? tablet : phone;
  }

  // On desktop/wide viewports, clamp to phone width so cosmetics match a phone.
  // On tablet, clamp to 520px. On phone, use full width.
  const contentMaxWidth = isWide
    ? PHONE_MAX_WIDTH
    : isTablet
    ? Math.min(width, 520)
    : width;
  const contentPadding = isTablet ? Math.max(24, (width - contentMaxWidth) / 2) : 20;

  return { width, height, isTablet, isWide, cols, contentMaxWidth, contentPadding };
}
