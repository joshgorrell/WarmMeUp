import React, { useState, useRef } from 'react';
import {
  View, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shield, ChevronLeft, ClipboardList, Lock } from 'lucide-react-native';
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
  const logoSize = Math.min(Math.round(width * 0.14), 56);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
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
          setError('Could not reach the server. Check your connection and try again.');
          break;
        default:
          setError('Incorrect support code. Please check with your support contact.');
      }
    }
  };

  const handleCodeChange = (text: string) => {
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
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
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

        {/* Header */}
        <View style={styles.logoWrap}>
          <WarmupLogo size={logoSize} />
        </View>

        <View style={styles.shieldWrap}>
          <View style={styles.shieldCircle}>
            <Shield color="#60C8FF" size={28} strokeWidth={1.8} />
          </View>
        </View>

        <AppText style={styles.title}>Support Tools</AppText>
        <AppText style={styles.subtitle}>
          Diagnostic tools to help support investigate issues on your device.
        </AppText>

        {/* PRIMARY: Basic Diagnostics — no code needed */}
        <TouchableOpacity
          style={styles.primaryCard}
          onPress={() => router.push('/debug-fallback')}
          activeOpacity={0.82}
        >
          <View style={styles.primaryCardIcon}>
            <ClipboardList color="#60C8FF" size={22} strokeWidth={1.8} />
          </View>
          <View style={styles.primaryCardBody}>
            <AppText style={styles.primaryCardTitle}>Open Basic Diagnostics</AppText>
            <AppText style={styles.primaryCardSub}>
              App version, device info, network status, recent errors.{'\n'}No code or login required.
            </AppText>
          </View>
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <AppText style={styles.dividerLabel}>Advanced</AppText>
          <View style={styles.dividerLine} />
        </View>

        {/* SECONDARY: Support Code — collapsed until tapped */}
        {!showCodeEntry ? (
          <TouchableOpacity
            style={styles.secondaryCard}
            onPress={() => setShowCodeEntry(true)}
            activeOpacity={0.82}
          >
            <Lock color="rgba(255,255,255,0.35)" size={16} strokeWidth={1.8} />
            <AppText style={styles.secondaryCardText}>
              Have a support code? Enter it for advanced tools.
            </AppText>
          </TouchableOpacity>
        ) : (
          <View style={styles.codeSection}>
            <AppText style={styles.codeLabel}>Enter your 6-digit support code</AppText>

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

            {error ? (
              <AppText style={styles.error}>{error}</AppText>
            ) : null}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                (loading || code.length < 6) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={loading || code.length < 6}
            >
              {loading
                ? <ActivityIndicator color="#05040A" size="small" />
                : <AppText style={styles.submitBtnText}>Open Advanced Diagnostics</AppText>
              }
            </TouchableOpacity>
          </View>
        )}
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
    marginBottom: Spacing.lg,
  },
  shieldWrap: {
    marginBottom: Spacing.md,
  },
  shieldCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(96,200,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(96,200,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
    maxWidth: 300,
  },
  primaryCard: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(96,200,255,0.35)',
    backgroundColor: 'rgba(96,200,255,0.07)',
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  primaryCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(96,200,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  primaryCardBody: {
    flex: 1,
  },
  primaryCardTitle: {
    color: '#60C8FF',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    marginBottom: 5,
  },
  primaryCardSub: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
    maxWidth: 340,
    marginBottom: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dividerLabel: {
    color: 'rgba(255,255,255,0.20)',
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  secondaryCard: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  secondaryCardText: {
    flex: 1,
    color: 'rgba(255,255,255,0.34)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 19,
  },
  codeSection: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: Spacing.md,
  },
  codeLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  inputWrap: {
    width: '100%',
    maxWidth: 220,
  },
  codeInput: {
    color: '#fff',
    fontSize: 34,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    letterSpacing: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(96,200,255,0.4)',
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  error: {
    color: '#FF6B6B',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 19,
  },
  submitBtn: {
    width: '100%',
    borderRadius: Radius.pill,
    backgroundColor: '#60C8FF',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#60C8FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  submitBtnDisabled: {
    backgroundColor: 'rgba(96,200,255,0.25)',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#05040A',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Bold',
  },
});
