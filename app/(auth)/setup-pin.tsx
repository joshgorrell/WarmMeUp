import React, { useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Platform, ScrollView,
} from 'react-native';
import AppText from '@/components/AppText';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { ScanFace, FingerprintPattern as Fingerprint, KeyRound, Lock } from 'lucide-react-native';
import WarmupBrand from '@/components/WarmupBrand';
import { FontSize, Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { supabase } from '@/lib/supabase';
import { secureKey } from '@/lib/secureKey';
import { useLayout } from '@/hooks/useLayout';

const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

type Step = 'create' | 'confirm' | 'method';
type LoginMethod = 'pin' | 'biometric' | 'password';

export default function SetupPinScreen() {
  const router = useRouter();
  const { user } = useAuth();
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
    } catch {
      // Non-fatal — still proceed
    } finally {
      setSaving(false);
    }
    router.back();
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
});
