import React, { useState, useCallback } from 'react';
import {
  View, Modal, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Keyboard,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, TriangleAlert as AlertTriangle, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { clearLocalImageCache } from '@/lib/mediaCache';
import { FontSize, Radius, Spacing } from '@/constants/theme';

interface LeavePartnerSheetProps {
  visible: boolean;
  onClose: () => void;
  partnerName: string;
}

export default function LeavePartnerSheet({ visible, onClose, partnerName }: LeavePartnerSheetProps) {
  const { colors, isDark } = useTheme();
  const { user, couple, refreshCouple, signOut, refreshSubscription, subscriptionInfo } = useAuth();
  const insets = useSafeAreaInsets();

  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmInput, setConfirmInput] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bg = isDark ? '#111018' : colors.bg3;
  const canConfirm = confirmInput.trim().toLowerCase() === 'leave';

  const resetAndClose = useCallback(() => {
    setStep(1);
    setConfirmInput('');
    setError(null);
    onClose();
  }, [onClose]);

  const handleLeave = useCallback(async () => {
    if (!couple?.id || !user) return;
    setLeaving(true);
    setError(null);
    try {
      // Call the server-side disconnect function which:
      // 1. Sends partner a push notification
      // 2. Deletes all storage files (chat_media + vault) for this couple
      // 3. Wipes all shared DB data atomically via wipe_couple_data()
      // 4. Deactivates the couple and resets celebration flags
      const { data: { session } } = await supabase.auth.getSession();
      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const res = await fetch(`${baseUrl}/functions/v1/disconnect-couple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? 'Failed to disconnect');
      }

      // Purge local image cache so previously-viewed photos can't be recovered
      await clearLocalImageCache();

      await refreshCouple();
      await refreshSubscription();
      resetAndClose();

      // Re-check subscription status to decide whether to show paywall or sign out
      try {
        const subRes = await fetch(`${baseUrl}/functions/v1/get-effective-subscription`, {
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ''}`,
            Apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
          },
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          if (!subData.isPremium) {
            router.replace({ pathname: '/(auth)/subscription', params: { reason: 'post_unpairing' } });
            return;
          }
        }
      } catch {
        // If check fails, fall through to sign-out
      }
      signOut();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLeaving(false);
    }
  }, [couple, user, refreshCouple, signOut, resetAndClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { Keyboard.dismiss(); resetAndClose(); }}>
          <View
            style={[styles.sheet, { backgroundColor: bg, paddingBottom: insets.bottom + 24 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {step === 2 && (
                  <TouchableOpacity
                    onPress={() => { setStep(1); setConfirmInput(''); setError(null); }}
                    style={styles.backBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ArrowLeft color={colors.textMuted} size={18} strokeWidth={2} />
                  </TouchableOpacity>
                )}
                <AppText style={[styles.title, { color: colors.text }]}>
                  {step === 1 ? 'End Partner Connection' : 'Are you sure?'}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => { Keyboard.dismiss(); resetAndClose(); }}
                style={[styles.closeBtn, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: colors.borderSubtle }]}
                activeOpacity={0.7}
              >
                <X color={colors.textSecondary} size={18} />
              </TouchableOpacity>
            </View>

            {step === 1 ? (
              <Step1
                colors={colors}
                partnerName={partnerName}
                onKeepConnected={resetAndClose}
                onContinue={() => setStep(2)}
              />
            ) : (
              <Step2
                colors={colors}
                confirmInput={confirmInput}
                onChangeInput={(v) => { setConfirmInput(v); setError(null); }}
                canConfirm={canConfirm}
                leaving={leaving}
                error={error}
                onLeave={handleLeave}
                onBack={() => { setStep(1); setConfirmInput(''); setError(null); }}
              />
            )}
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Step1({
  colors,
  partnerName,
  onKeepConnected,
  onContinue,
}: {
  colors: any;
  partnerName: string;
  onKeepConnected: () => void;
  onContinue: () => void;
}) {
  return (
    <View style={styles.body}>
      {/* Warning icon */}
      <View style={[styles.iconWrap, { backgroundColor: 'rgba(255,90,95,0.10)' }]}>
        <AlertTriangle color="#FF5A5F" size={28} strokeWidth={1.8} />
      </View>

      <AppText style={[styles.bodyTitle, { color: colors.text }]}>
        Before you continue
      </AppText>

      <View style={styles.bulletList}>
        <BulletItem colors={colors} text={`Your connection with ${partnerName} will be removed.`} />
        <BulletItem colors={colors} text="ALL shared content — chat messages, photos, videos, dares, dice rolls, wishes, vault items, points, and activity history — will be permanently deleted for both of you." />
        <BulletItem colors={colors} text="If your partner holds the subscription, you will lose premium access immediately." />
        <BulletItem colors={colors} text="Reconnecting later requires a new invite code and starts a fresh relationship with no previous data." />
      </View>

      <AppText style={[styles.bodyNote, { color: colors.textMuted }]}>
        This action affects both partners. All shared data is permanently destroyed and cannot be recovered.
      </AppText>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.keepBtn, { borderColor: colors.borderSubtle, backgroundColor: 'rgba(255,255,255,0.05)' }]}
          onPress={onKeepConnected}
          activeOpacity={0.75}
        >
          <AppText style={[styles.keepBtnText, { color: colors.textSecondary }]}>Keep Connected</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueBtn, { borderColor: 'rgba(255,90,95,0.35)', backgroundColor: 'rgba(255,90,95,0.08)' }]}
          onPress={onContinue}
          activeOpacity={0.75}
        >
          <AppText style={[styles.continueBtnText]}>Continue</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Step2({
  colors,
  confirmInput,
  onChangeInput,
  canConfirm,
  leaving,
  error,
  onLeave,
  onBack,
}: {
  colors: any;
  confirmInput: string;
  onChangeInput: (v: string) => void;
  canConfirm: boolean;
  leaving: boolean;
  error: string | null;
  onLeave: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.body}>
      <AppText style={[styles.step2Subtitle, { color: colors.textSecondary }]}>
        This cannot be undone automatically. To confirm, type the word below.
      </AppText>

      <View style={[styles.confirmWordWrap, { backgroundColor: 'rgba(255,90,95,0.07)', borderColor: 'rgba(255,90,95,0.25)' }]}>
        <AppText style={[styles.confirmWord]}>Leave</AppText>
      </View>

      <AppTextInput
        style={[
          styles.confirmInput,
          {
            color: colors.text,
            borderColor: canConfirm ? 'rgba(255,90,95,0.6)' : colors.borderSubtle,
            backgroundColor: 'rgba(255,255,255,0.04)',
          },
        ]}
        value={confirmInput}
        onChangeText={onChangeInput}
        placeholder="Type here to confirm"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={Keyboard.dismiss}
        editable={!leaving}
      />

      {error && (
        <AppText style={[styles.errorText, { color: colors.danger }]}>{error}</AppText>
      )}

      <TouchableOpacity
        style={[
          styles.leaveBtn,
          canConfirm && !leaving
            ? { backgroundColor: '#FF5A5F', borderColor: 'transparent' }
            : { backgroundColor: 'rgba(255,90,95,0.12)', borderColor: 'rgba(255,90,95,0.20)' },
        ]}
        onPress={() => { Keyboard.dismiss(); onLeave(); }}
        activeOpacity={canConfirm && !leaving ? 0.8 : 1}
        disabled={!canConfirm || leaving}
      >
        {leaving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <AppText style={[styles.leaveBtnText, { color: canConfirm ? '#fff' : 'rgba(255,90,95,0.45)' }]}>
            End Connection
          </AppText>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.goBackLink}>
        <AppText style={[styles.goBackText, { color: colors.textMuted }]}>Go back</AppText>
      </TouchableOpacity>
    </View>
  );
}

function BulletItem({ colors, text }: { colors: any; text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: 'rgba(255,90,95,0.55)' }]} />
      <AppText style={[styles.bulletText, { color: colors.textSecondary }]}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: 2,
  },
  title: {
    fontSize: FontSize.h2,
    fontFamily: 'Inter-Bold',
    lineHeight: 30,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    gap: Spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  bodyTitle: {
    fontSize: FontSize.lg,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    lineHeight: 26,
  },
  bulletList: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  bulletText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    flex: 1,
  },
  bodyNote: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  keepBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  keepBtnText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  continueBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
    color: '#FF5A5F',
  },
  // Step 2
  step2Subtitle: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  confirmWordWrap: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmWord: {
    fontSize: FontSize.lg,
    fontFamily: 'Inter-Bold',
    color: '#FF5A5F',
    letterSpacing: 1,
  },
  confirmInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: FontSize.body,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  errorText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
  leaveBtn: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  leaveBtnText: {
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  goBackLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  goBackText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
});
