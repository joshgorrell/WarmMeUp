import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AppText from '@/components/AppText';
import { Spacing, FontSize, Radius } from '@/constants/theme';

export default function AdminErrorBoundary() {
  const router = useRouter();

  useEffect(() => {
    console.error('[AdminRouteError] Users Dashboard crashed during render');
  }, []);

  return (
    <View style={styles.container}>
      <AppText style={styles.title}>This screen couldn't load.</AppText>
      <AppText style={styles.subtitle}>
        Something went wrong while loading the admin dashboard. Try again, or go back to the admin home.
      </AppText>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => router.replace('/(admin)/users-dashboard')}
          activeOpacity={0.8}
        >
          <AppText style={styles.retryText}>Try Again</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace('/(admin)')}
          activeOpacity={0.8}
        >
          <AppText style={styles.backText}>Admin Home</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    color: '#FF5A5F',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  retryBtn: {
    backgroundColor: '#FF2E8A',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: Radius.pill,
  },
  retryText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  backBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: Radius.pill,
  },
  backText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
});
