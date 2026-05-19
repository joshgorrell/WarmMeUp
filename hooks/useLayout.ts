import { useWindowDimensions } from 'react-native';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 600;

  // Pick a value based on phone vs tablet
  function cols(phone: number, tablet: number): number {
    return isTablet ? tablet : phone;
  }

  // Clamp content to a comfortable reading width on tablet, centered
  const contentMaxWidth = isTablet ? Math.min(width, 520) : width;
  const contentPadding = isTablet ? Math.max(24, (width - 520) / 2) : 20;

  return { width, height, isTablet, cols, contentMaxWidth, contentPadding };
}
