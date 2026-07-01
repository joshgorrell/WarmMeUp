import React, { useState, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, ChevronLeft } from 'lucide-react-native';
import AppText from '@/components/AppText';
import WarmupLogo from '@/components/WarmupLogo';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { validateDebugSupportCode } from '@/lib/globalDebugAccess';
import { useLayout } from '@/hooks/useLayout';
import Constants from 'expo-constants';

export default function DebugAccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useLayout();
  const logoSize = Math.min(Math.round(width * 0.18), 72);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError('Please enter the full 6-digit support code.');
      return;
    }
    setLoading(true);
    setError(null);

    const deviceInfo: Record<string, string> = {
      platform: Platform.OS,
      os_version: String(Platform.Version ?? ''),
      app_version: Constants.expoConfig?.version ?? '',
    };

    const result = await validateDebugSupportCode(trimmed, deviceInfo);

    if (result.valid) {
      router.replace('/debug');
    } else {
      setLoading(false);
      switch (result.reason) {
        case 'disabled':
          setError('Support debug access is not currently enabled. Contact support.');
          break;
        case 'expired':
          setError('This support code has expired. Ask support for a new code.');
          break;
        case 'network_error':
          setError('Could not reach the server. Check your connection and try again.\n\nYou can still view basic diagnostics below.');
          break;
        default:
          setError('Incorrect support code. Please check with your support contact.');
      }
    }
  };

  const handleCodeChange = (text: string) => {
    // Only allow digits, max 6
    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(digits);
    if (error) setError(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#000000', '#0A0A0A', '#0D0D12']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft color="rgba(255,255,255,0.6)" size={22} strokeWidth={2} />
        </TouchableOpacity>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <WarmupLogo size={logoSize} />
        </View>

        {/* Shield icon */}
        <View style={styles.shieldWrap}>
          <View style={styles.shieldCircle}>
            <Shield color="#60C8FF" size={32} strokeWidth={1.8} />
          </View>
        </View>

        <AppText style={styles.title}>Support Debug Access</AppText>
        <AppText style={styles.subtitle}>
          Enter the 6-digit code provided by support to open diagnostic tools.
        </AppText>

        {/* Code input */}
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={styles.codeInput}
            value={code}
            onChangeText={handleCodeChange}
            placeholder="000000"
            placeholderTextColor="rgba(255,255,255,0.18)"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            editable={!loading}
            autoFocus
          />
        </View>

        {/* Error message */}
        {error ? (
          <AppText style={styles.error}>{error}</AppText>
        ) : null}

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitBtn, (loading || code.length < 6) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={loading || code.length < 6}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <AppText style={styles.submitBtnText}>Open Diagnostics</AppText>
          }
        </TouchableOpacity>

        {/* Fallback link */}
        <TouchableOpacity
          style={styles.fallbackLink}
          onPress={() => router.push('/debug-fallback')}
          activeOpacity={0.7}
        >
          <AppText style={styles.fallbackLinkText}>View basic diagnostics (no code required)</AppText>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  backBtn: {
    alignSelf: 'flex-start',
    padding: 4,
    marginBottom: Spacing.md,
  },
  logoWrap: {
    marginBottom: Spacing.xl,
  },
  shieldWrap: {
    marginBottom: Spacing.lg,
  },
  shieldCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(96,200,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(96,200,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: FontSize.xxl,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
    maxWidth: 300,
  },
  inputWrap: {
    width: '100%',
    maxWidth: 260,
    marginBottom: Spacing.sm,
  },
  codeInput: {
    color: '#fff',
    fontSize: 36,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    letterSpacing: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(96,200,255,0.4)',
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  error: {
    color: '#FF6B6B',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: Spacing.md,
    maxWidth: 300,
    lineHeight: 19,
  },
  submitBtn: {
    width: '100%',
    maxWidth: 280,
    borderRadius: Radius.pill,
    backgroundColor: '#60C8FF',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#60C8FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(96,200,255,0.3)',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#05040A',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
  },
  fallbackLink: {
    marginTop: Spacing.lg,
    paddingVertical: 6,
  },
  fallbackLinkText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
