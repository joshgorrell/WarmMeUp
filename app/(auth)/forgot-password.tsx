import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Mail } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import WarmupBrand from '@/components/WarmupBrand';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const logoSize = Math.max(Math.min(Math.round(width * 0.22), 96), 64);
  const scrollPaddingTop = Math.max(Math.round(height * 0.05), 32) + insets.top;
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (err) throw err;
      setSent(true);
    } catch (e: any) {
      setError(e.message || 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#060406', '#0A060A', '#0E080E']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: scrollPaddingTop, paddingBottom: insets.bottom + 50 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={isTablet ? [styles.innerWrap, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }] : styles.innerWrap}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <ChevronLeft color="rgba(255,255,255,0.75)" size={20} strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={styles.brandBlock}>
            <WarmupBrand logoSize={logoSize} showTagline={false} />
          </View>

          {!sent ? (
            <View style={styles.card}>
              <AppText style={styles.cardTitle}>Reset Password</AppText>
              <AppText style={styles.cardSub}>
                Enter the email for your account and we'll send a reset link.
              </AppText>

              <View style={styles.inputWrap}>
                <Mail color="rgba(255,255,255,0.30)" size={18} style={styles.inputIcon} />
                <AppTextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="rgba(255,255,255,0.24)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoFocus
                />
              </View>

              {error ? <AppText style={styles.error}>{error}</AppText> : null}

              <TouchableOpacity
                style={styles.sendBtn}
                onPress={handleSend}
                activeOpacity={0.85}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sendGrad}
                >
                  <AppText style={styles.sendLabel}>{loading ? 'Sending...' : 'Send Reset Link'}</AppText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <AppText style={styles.sentEmoji}>📬</AppText>
              <AppText style={styles.cardTitle}>Check your inbox</AppText>
              <AppText style={styles.cardSub}>
                A password reset link has been sent to{'\n'}
                <AppText style={styles.emailHighlight}>{email}</AppText>
              </AppText>

              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => router.replace('/(auth)/login')}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#FF7B00', '#FF5A3D', '#FF2E8A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sendGrad}
                >
                  <AppText style={styles.sendLabel}>Back to Sign In</AppText>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.footerLink}
            onPress={() => router.replace('/(auth)/login')}
            activeOpacity={0.7}
          >
            <AppText style={styles.footerText}>
              Remember your password?{'  '}
              <AppText style={styles.footerAccent}>Sign In</AppText>
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  innerWrap: {
    width: '100%',
    alignItems: 'center',
  },
  backBtn: {
    alignSelf: 'flex-start',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: Spacing.xl,
  },
  brandBlock: {
    alignItems: 'center',
    marginBottom: 36,
  },
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  sentEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  cardTitle: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  cardSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  emailHighlight: {
    color: '#FF7A45',
    fontFamily: 'Inter-SemiBold',
  },
  inputWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    paddingVertical: 17,
  },
  error: {
    color: '#FF5A5F',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  sendBtn: {
    width: '100%',
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: '#FF5000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.50,
    shadowRadius: 20,
    elevation: 10,
  },
  sendGrad: {
    paddingVertical: 18,
    alignItems: 'center',
    borderRadius: Radius.pill,
  },
  sendLabel: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  footerLink: { paddingVertical: Spacing.sm },
  footerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  footerAccent: {
    color: '#E05548',
    fontFamily: 'Inter-SemiBold',
  },
});
