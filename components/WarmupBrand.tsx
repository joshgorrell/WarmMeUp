import React from 'react';
import { View, Image, StyleSheet, useWindowDimensions } from 'react-native';
import WarmupLogo from './WarmupLogo';
import { Spacing } from '@/constants/theme';

interface WarmupBrandProps {
  logoSize?: number;
  sloganScale?: number;
  /** Override the computed slogan width directly (in dp). Takes precedence over sloganScale. */
  sloganWidth?: number;
  showTagline?: boolean;
}

// WMU_Stay_Playful_ copy.PNG: natural dimensions ~774×228 → aspect ratio ≈ 0.2948
const SLOGAN_SOURCE = require('@/assets/images/WMU_Stay_Playful_copy.PNG');
const SLOGAN_ASPECT = 228 / 774;

export default function WarmupBrand({ logoSize = 100, sloganScale = 1, sloganWidth: sloganWidthProp, showTagline = true }: WarmupBrandProps) {
  const { width: screenWidth } = useWindowDimensions();
  const maxSloganWidth = screenWidth - Spacing.xl * 2;
  const rawSloganWidth = sloganWidthProp ?? logoSize * 2.2 * sloganScale;
  const sloganWidth = Math.min(rawSloganWidth, maxSloganWidth);
  const sloganHeight = Math.round(sloganWidth * SLOGAN_ASPECT);

  return (
    <View style={styles.wrap}>
      <WarmupLogo size={logoSize} />
      {showTagline && (
        <Image
          source={SLOGAN_SOURCE}
          style={{ width: sloganWidth, height: sloganHeight, resizeMode: 'contain', marginTop: 12 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
});
