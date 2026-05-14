export const BrandGradient = ['#FFB347', '#FF5A3D', '#FF3D4F', '#FF2E8A'] as const;

export const GlowGradient = {
  brand: 'rgba(255,46,138,0.32)',
  orange: 'rgba(255,138,61,0.30)',
  pink: 'rgba(255,46,138,0.30)',
  soft: 'rgba(255,78,120,0.22)',
};

export const CardBorderGradient = {
  colors: ['rgba(255,179,71,0.35)', 'rgba(255,46,138,0.35)'] as const,
};

export const AppBackground = {
  dark: {
    base: '#050507',
    // Layered radial glow positions
    glowTopRight: 'rgba(255,46,138,0.12)',
    glowBottomLeft: 'rgba(255,138,61,0.10)',
  },
  light: {
    base: '#FFF8F3',
    glowTopRight: 'rgba(255,46,138,0.06)',
    glowBottomLeft: 'rgba(255,138,61,0.05)',
  },
};
