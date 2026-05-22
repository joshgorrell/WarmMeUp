import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Platform, ScrollView,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { ScanFace, FingerprintPattern as Fingerprint, KeyRound, Lock, LogIn } from 'lucide-react-native';
import WarmupBrand from '@/components/WarmupBrand';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { supabase } from '@/lib/supabase';
import { secureKey } from '@/lib/secureKey';
import { useLayout } from '@/hooks/useLayout';
import { isCodeExpired, loadPendingCode, clearPendingCode } from '@/lib/inviteCode';

type JoinResult =
  | { ok: true; partnerName: string | null; coupleId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'already_full' | 'self' | 'already_connected' | 'error' };

async function completePendingJoin(userId: string, code: string): Promise<JoinResult> {
  // Check if User B already has an active couple — prevent double-connecting
  const { data: existingCouple } = await supabase
    .from('couples')
    .select('id, active')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .eq('active', true)
    .maybeSingle();
  if (existingCouple) return { ok: false, reason: 'already_connected' };

  const { data: targetCouple, error: fetchError } = await supabase
    .rpc('get_couple_by_invite_code', { code: code.toUpperCase().trim() });

  if (fetchError || !targetCouple) return { ok: false, reason: 'not_found' };

  // Self-invite guard
  if (targetCouple.user_a_id === userId) return { ok: false, reason: 'self' };

  // Expiry check (null = legacy row with no expiry, treat as valid)
  if (isCodeExpired(targetCouple.invite_code_expires_at)) return { ok: false, reason: 'expired' };

  // Already used / full check
  if (targetCouple.user_b_id && targetCouple.user_b_id !== userId) {
    return { ok: false, reason: 'already_full' };
  }

  const now = new Date().toISOString();

  // Conditional update — atomic: only succeeds if user_b_id is still null
  const { error: updateError } = await supabase
    .from('couples')
    .update({ user_b_id: userId, active: true, invite_code_used_at: now })
    .eq('id', targetCouple.id)
    .is('user_b_id', null);

  if (updateError) {
    // Re-fetch to give accurate reason (race: another user just claimed it)
    const { data: refetched } = await supabase
      .from('couples')
      .select('user_b_id')
      .eq('id', targetCouple.id)
      .maybeSingle();
    if (refetched?.user_b_id && refetched.user_b_id !== userId) {
      return { ok: false, reason: 'already_full' };
    }
    return { ok: false, reason: 'error' };
  }

  // Stamp subscription_owner_id with whichever user has an active subscription
  const { data: subA } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', targetCouple.user_a_id)
    .eq('status', 'active')
    .maybeSingle();
  const { data: subB } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  const subscriptionOwnerId = subA ? targetCouple.user_a_id : subB ? userId : null;
  if (subscriptionOwnerId) {
    const { error: subUpdateError } = await supabase
      .from('couples')
      .update({ subscription_owner_id: subscriptionOwnerId })
      .eq('id', targetCouple.id);
    // Non-fatal — pairing succeeded; subscription owner can be corrected later
    if (subUpdateError) {
      console.warn('[completePendingJoin] subscription_owner_id update failed:', subUpdateError.message);
    }
  }

  // Clean up User B's own solo placeholder couple (active or inactive)
  await supabase
    .from('couples')
    .delete()
    .eq('user_a_id', userId)
    .is('user_b_id', null)
    .neq('id', targetCouple.id);

  await supabase.from('scores').upsert([
    { couple_id: targetCouple.id, user_id: targetCouple.user_a_id, points: 0 },
    { couple_id: targetCouple.id, user_id: userId, points: 0 },
  ]);

  const { data: partnerProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', targetCouple.user_a_id)
    .maybeSingle();

  return { ok: true, partnerName: partnerProfile?.display_name ?? null, coupleId: targetCouple.id };
}

const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

type Step = 'create' | 'confirm' | 'method';
type LoginMethod = 'pin' | 'biometric' | 'password';

export default function SetupPinScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { pendingCode } = useLocalSearchParams<{ pendingCode?: string }>();
  const { available: bioAvailable, biometricLabel } = useBiometricAuth();
  const { width, height, isTablet, contentMaxWidth } = useLayout();
  const insets = useSafeAreaInsets();

  const vSm = Math.round(height * 0.02);
  const vMd = Math.round(height * 0.03);
  const logoSize = Math.min(Math.round(width * 0.17), 68);

  const padWidth = Math.min(width - Spacing.xl * 2, 300);
  const keyGap = Spacing.sm;
  const keySize = (padWidth - keyGap * 2) / 3;
  const keyHeight = Math.min(Math.round(keySize * 0.78), Math.round(height * 0.075));

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<Step>('create');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const current = step === 'create' ? pin : confirmPin;
  const setter = step === 'create' ? setPin : setConfirmPin;

  const handleKey = (k: string) => {
    if (k === '⌫') { setter(prev => prev.slice(0, -1)); return; }
    if (k === '') return;
    if (current.length >= 4) return;
    const next = current + k;
    setter(next);
    if (next.length === 4) {
      if (step === 'create') {
        setStep('confirm');
      } else {
        if (next === pin) {
          savePin(pin);
        } else {
          setError('PINs do not match. Try again.');
          setConfirmPin('');
          setTimeout(() => { setPin(''); setStep('create'); setError(''); }, 1200);
        }
      }
    }
  };

  const savePin = async (p: string) => {
    if (Platform.OS !== 'web' && user) {
      await SecureStore.setItemAsync(secureKey('warmup_pin', user.id), p);
    } else if (Platform.OS === 'web' && user && typeof window !== 'undefined') {
      window.localStorage.setItem(secureKey('warmup_pin', user.id), p);
    }
    setStep('method');
  };

  const handleMethodSelect = async (method: LoginMethod) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      await supabase
        .from('user_settings')
        .update({ login_method: method, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      // Use route param first, fall back to persisted storage (survives OAuth redirects)
      const code = pendingCode || (await loadPendingCode()) || '';

      if (code) {
        const result = await completePendingJoin(user.id, code);
        if (result.ok) {
          await clearPendingCode();
          // Notify User A (fire-and-forget)
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token) {
            fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/notify-partner`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ event_type: 'partner_joined', couple_id: result.coupleId }),
            }).catch(() => {});
          }
          router.replace({
            pathname: '/(auth)/paired-celebration',
            params: { partnerName: result.partnerName || '' },
          });
        } else {
          await clearPendingCode();
          const msg =
            result.reason === 'expired' ? "This invite code has expired. Ask your partner to generate a new one." :
            result.reason === 'self' ? "You can't use your own invite code." :
            result.reason === 'already_connected' ? "You're already connected to a partner." :
            result.reason === 'not_found' ? "That invite code couldn't be found. You can pair from the app later." :
            result.reason === 'already_full' ? 'That code has already been used. You can pair with a different partner from the app.' :
            'Something went wrong connecting you. You can pair from the app later.';
          setError(msg);
          setSaving(false);
          setTimeout(() => router.replace('/(auth)/onboarding'), 3500);
        }
        return;
      }
    } catch {
      // Non-fatal — still proceed to onboarding
    } finally {
      setSaving(false);
    }
    router.replace('/(auth)/onboarding');
  };

  const BiometricIcon = biometricLabel === 'Touch ID' ? Fingerprint : ScanFace;

  const centerStyle = isTablet
    ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' as const }
    : {};

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#07070A', '#0D0D12', '#151018']} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={[{ marginBottom: vMd }, centerStyle]}>
          <WarmupBrand logoSize={logoSize} showTagline={false} />
        </View>

        {step === 'method' ? (
          <ScrollView
            style={[styles.methodScroll, centerStyle]}
            contentContainerStyle={styles.methodScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <AppText style={styles.title}>How do you want to open Warm Me Up?</AppText>
            <AppText style={[styles.sub, { marginBottom: vMd }]}>You can change this anytime in Settings.</AppText>

            {bioAvailable && (
              <MethodCard
                icon={<BiometricIcon color="#FF2E8A" size={28} strokeWidth={1.8} />}
                title={biometricLabel}
                description="Instant unlock — your face or fingerprint"
                recommended
                onPress={() => handleMethodSelect('biometric')}
                disabled={saving}
              />
            )}

            <MethodCard
              icon={<KeyRound color="#FFB347" size={28} strokeWidth={1.8} />}
              title="PIN"
              description="Your 4-digit PIN — fast and secure"
              recommended={!bioAvailable}
              onPress={() => handleMethodSelect('pin')}
              disabled={saving}
            />

            <MethodCard
              icon={<Lock color="rgba(255,255,255,0.45)" size={28} strokeWidth={1.8} />}
              title="Password"
              description="Account password each time — less convenient"
              onPress={() => handleMethodSelect('password')}
              disabled={saving}
            />
          </ScrollView>
        ) : (
          <View style={centerStyle}>
            <AppText style={styles.title}>{step === 'create' ? 'Create PIN' : 'Confirm PIN'}</AppText>
            <AppText style={[styles.sub, { marginBottom: vSm }]}>
              {step === 'create' ? 'This PIN protects your Warm Me Up app' : 'Enter your PIN again to confirm'}
            </AppText>

            <View style={[styles.dots, { marginBottom: vSm }]}>
              {Array.from({ length: 4 }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, { backgroundColor: i < current.length ? '#FF2E8A' : 'rgba(255,255,255,0.15)' }]}
                />
              ))}
            </View>

            {error ? <AppText style={[styles.error, { marginBottom: vSm }]}>{error}</AppText> : null}

            <View style={[styles.pad, { width: padWidth, gap: keyGap }]}>
              {PAD.map((k, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.key, { width: keySize, height: keyHeight }, k === '' && styles.keyEmpty]}
                  onPress={() => handleKey(k)}
                  activeOpacity={k === '' ? 1 : 0.6}
                  disabled={k === ''}
                >
                  <AppText style={[styles.keyText, k === '⌫' && styles.keyDelete]}>{k}</AppText>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.altLink, { marginTop: vMd }]}
              onPress={() => router.replace('/(auth)/login')}
              activeOpacity={0.7}
            >
              <LogIn color="rgba(255,255,255,0.4)" size={14} />
              <AppText style={styles.altLinkText}>Sign in with password instead</AppText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

function MethodCard({
  icon, title, description, recommended, onPress, disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  recommended?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.methodCard, recommended && styles.methodCardRecommended]}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={disabled}
    >
      <View style={styles.methodIconWrap}>{icon}</View>
      <View style={styles.methodTextWrap}>
        <View style={styles.methodTitleRow}>
          <AppText style={styles.methodTitle}>{title}</AppText>
          {recommended && (
            <View style={styles.recommendedBadge}>
              <AppText style={styles.recommendedText}>Recommended</AppText>
            </View>
          )}
        </View>
        <AppText style={styles.methodDesc}>{description}</AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07070A' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  methodScroll: {
    width: '100%',
  },
  methodScrollContent: {
    paddingBottom: Spacing.xl,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: FontSize.xxl,
    fontFamily: 'Inter-Bold',
    marginBottom: 6,
    textAlign: 'center',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  dots: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  error: { color: '#FF5A5F', fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  key: {
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  keyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyText: { color: '#fff', fontSize: FontSize.xxl, fontFamily: 'Inter-Medium' },
  keyDelete: { fontSize: FontSize.xl },
  methodCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  methodCardRecommended: {
    borderColor: 'rgba(255,46,138,0.35)',
    backgroundColor: 'rgba(255,46,138,0.06)',
  },
  methodIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodTextWrap: { flex: 1, gap: 3 },
  methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  methodTitle: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  methodDesc: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
  recommendedBadge: {
    backgroundColor: 'rgba(255,46,138,0.18)',
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recommendedText: {
    color: '#FF2E8A',
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
  },
  altLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  altLinkText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
});
