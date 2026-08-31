import React, { Component, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import AppText from '@/components/AppText';

class AdminErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; errorMsg: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AdminErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <AppText style={styles.errorTitle}>Admin screen error</AppText>
          <AppText style={styles.errorHelp}>
            The app caught the Users Dashboard failure instead of closing. Send a screenshot of the error below.
          </AppText>
          <AppText style={styles.errorMsg} selectable>{this.state.errorMsg}</AppText>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, errorMsg: '' })}
            style={styles.retryBtn}
            activeOpacity={0.8}
          >
            <AppText style={styles.retryText}>Try Again</AppText>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function AdminLayout() {
  const { profile, isAdmin, isSuperAdmin, loading } = useAuth();
  const router = useRouter();

  const hasAdminAccess = isAdmin || isSuperAdmin;

  useEffect(() => {
    if (!loading && !hasAdminAccess) {
      router.replace('/(app)/(tabs)');
    }
  }, [loading, hasAdminAccess, router]);

  if (loading || !profile) return null;
  if (!hasAdminAccess) return null;

  return (
    <AdminErrorBoundary>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </AdminErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#07070A',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
  errorHelp: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 19,
  },
  errorMsg: {
    color: 'rgba(255,100,100,0.95)',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  retryBtn: {
    backgroundColor: '#FF2E8A',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
});
