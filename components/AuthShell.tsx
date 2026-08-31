import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ScrollViewProps,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/hooks/useLayout';

interface AuthShellProps {
  children: React.ReactNode;
  scrollable?: boolean;
  scrollProps?: ScrollViewProps;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  gradientColors?: string[];
  keyboardAvoiding?: boolean;
}

export default function AuthShell({
  children,
  scrollable = true,
  scrollProps,
  style,
  contentStyle,
  gradientColors = ['#060406', '#0A060A', '#0E080E'],
  keyboardAvoiding = false,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();
  const { isTablet, contentMaxWidth } = useLayout();

  const inner = isTablet ? (
    <View style={[styles.centerWrap, { maxWidth: contentMaxWidth }]}>
      {children}
    </View>
  ) : children;

  const content = scrollable ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
        contentStyle,
      ]}
      {...scrollProps}
    >
      {inner}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.fill,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
        contentStyle,
      ]}
    >
      {inner}
    </View>
  );

  const body = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {content}
    </KeyboardAvoidingView>
  ) : content;

  return (
    <View style={[styles.root, style]}>
      <LinearGradient colors={gradientColors as [string, string, ...string[]]} style={StyleSheet.absoluteFill} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centerWrap: {
    alignSelf: 'center',
    width: '100%',
  },
});
