import React from 'react';
import {
  View, StyleSheet, ScrollView, ScrollViewProps, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useLayout } from '@/hooks/useLayout';

interface AppShellProps {
  children: React.ReactNode;
  scrollable?: boolean;
  scrollProps?: ScrollViewProps;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  noTopPadding?: boolean;
  /** On tablet, center children in a max-width column. Use for text-heavy detail screens. */
  constrainContent?: boolean;
}

export default function AppShell({
  children,
  scrollable = true,
  scrollProps,
  style,
  contentStyle,
  noTopPadding = false,
  constrainContent = false,
}: AppShellProps) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTabletOrLarger, contentMaxWidth } = useLayout();

  const constrainedChildren = (constrainContent && isTabletOrLarger) ? (
    <View style={{ alignSelf: 'center', width: '100%', maxWidth: contentMaxWidth, flex: scrollable ? undefined : 1 }}>
      {children}
    </View>
  ) : children;

  return (
    <View style={[styles.root, style]}>
      {/* Deep cinematic base gradient — diagonally dark with faint plum warmth */}
      <LinearGradient
        colors={
          isDark
            ? ['#05040A', '#090610', '#0D0710', '#100510']
            : ['#FFF8F3', '#FFF1EA', '#FFE8DC', '#FFDFD2']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top-right pink light leak */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255,46,138,0.08)', 'rgba(255,46,138,0.03)', 'transparent']
            : ['rgba(255,46,138,0.04)', 'transparent']
        }
        start={{ x: 1, y: 0 }}
        end={{ x: 0.2, y: 0.5 }}
        style={styles.leakTopRight}
        pointerEvents="none"
      />

      {/* Bottom-left amber light leak */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255,138,61,0.07)', 'rgba(255,90,61,0.03)', 'transparent']
            : ['rgba(255,138,61,0.04)', 'transparent']
        }
        start={{ x: 0, y: 1 }}
        end={{ x: 0.6, y: 0.4 }}
        style={styles.leakBottomLeft}
        pointerEvents="none"
      />

      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            !noTopPadding && { paddingTop: insets.top },
            contentStyle,
          ]}
          {...scrollProps}
        >
          {constrainedChildren}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.fill,
            !noTopPadding && { paddingTop: insets.top },
            contentStyle,
          ]}
        >
          {constrainedChildren}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05040A' },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  leakTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '70%',
    height: '45%',
    maxHeight: 400,
  },
  leakBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '65%',
    height: '40%',
    maxHeight: 360,
  },
});
