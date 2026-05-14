// Glow definitions — used as drop-shadow via style prop on native or filter on web
// For React Native, compose with elevation or use react-native-shadow (not in this project).
// These constants are used for reference in inline styles or gradient borders.

export const Glow = {
  brand: {
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 8,
  },
  orange: {
    shadowColor: '#FF8A3D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 20,
    elevation: 6,
  },
  pink: {
    shadowColor: '#FF2E8A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 20,
    elevation: 6,
  },
  soft: {
    shadowColor: '#FF4E78',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 4,
  },
};
