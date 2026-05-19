import React, { useState, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, TriangleAlert as AlertTriangle, ArrowLeft } from 'lucide-react-native';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { notifyPartner } from '@/lib/notifications';
import { FontSize, Radius, Spacing } from '@/constants/theme';

interface LeavePartnerSheetProps {
  visible: boolean;
  onClose: () => void;
  partnerName: string;
}

export default function LeavePartnerSheet({ visible, onClose, partnerName }: LeavePartnerSheetProps) {
  const { colors, isDark } = useTheme();
  const { user, couple, refreshCouple, signOut } = useAuth();
  const insets = useSafeAreaInsets();

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
      // Notify partner before deactivating (function checks active couple)
      await notifyPartner({ event_type: 'partner_disconnected', couple_id: couple.id });

      // Deactivate the couple
      const partnerId = couple.user_a_id === user.id ? couple.user_b_id : couple.user_a_id;
      const { error: updateError } = await supabase
        .from('couples')
        .update({
          active: false,
          user_b_id: null,
          disconnected_at: new Date().toISOString(),
          subscription_owner_id: null,
        })
        .eq('id', couple.id);

      if (updateError) throw updateError;

      // Reset celebration flag for both partners so re-pairing shows celebration
      const userIds = [user.id, partnerId].filter(Boolean) as string[];
      if (userIds.length > 0) {
        await supabase
          .from('user_settings')
          .update({ celebration_seen: false })
          .in('user_id', userIds);
      }

      await refreshCouple();
      resetAndClose();
      signOut();
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLeaving(false);
    }
  }, [couple, user, refreshCouple, signOut, resetAndClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={resetAndClose}>
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
              <Text style={[styles.title, { color: colors.text }]}>
                {step === 1 ? 'End Partner Connection' : 'Are you sure?'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={resetAndClose}
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

      <Text style={[styles.bodyTitle, { color: colors.text }]}>
        Before you continue
      </Text>

      <View style={styles.bulletList}>
        <BulletItem colors={colors} text={`Your connection with ${partnerName} will be removed.`} />
        <BulletItem colors={colors} text="Shared features — Dares, Dice, Notes, Vault, and Wishes — will stop working for both of you." />
        <BulletItem colors={colors} text="If your partner holds the subscription, you will lose premium access immediately." />
        <BulletItem colors={colors} text="Reconnecting later requires a new invite code." />
      </View>

      <Text style={[styles.bodyNote, { color: colors.textMuted }]}>
        This action affects both partners. It cannot be undone automatically.
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.keepBtn, { borderColor: colors.borderSubtle, backgroundColor: 'rgba(255,255,255,0.05)' }]}
          onPress={onKeepConnected}
          activeOpacity={0.75}
        >
          <Text style={[styles.keepBtnText, { color: colors.textSecondary }]}>Keep Connected</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueBtn, { borderColor: 'rgba(255,90,95,0.35)', backgroundColor: 'rgba(255,90,95,0.08)' }]}
          onPress={onContinue}
          activeOpacity={0.75}
        >
          <Text style={[styles.continueBtnText]}>Continue</Text>
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
      <Text style={[styles.step2Subtitle, { color: colors.textSecondary }]}>
        This cannot be undone automatically. To confirm, type the word below.
      </Text>

      <View style={[styles.confirmWordWrap, { backgroundColor: 'rgba(255,90,95,0.07)', borderColor: 'rgba(255,90,95,0.25)' }]}>
        <Text style={[styles.confirmWord]}>Leave</Text>
      </View>

      <TextInput
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
        editable={!leaving}
      />

      {error && (
        <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
      )}

      <TouchableOpacity
        style={[
          styles.leaveBtn,
          canConfirm && !leaving
            ? { backgroundColor: '#FF5A5F', borderColor: 'transparent' }
            : { backgroundColor: 'rgba(255,90,95,0.12)', borderColor: 'rgba(255,90,95,0.20)' },
        ]}
        onPress={onLeave}
        activeOpacity={canConfirm && !leaving ? 0.8 : 1}
        disabled={!canConfirm || leaving}
      >
        {leaving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.leaveBtnText, { color: canConfirm ? '#fff' : 'rgba(255,90,95,0.45)' }]}>
            End Connection
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.goBackLink}>
        <Text style={[styles.goBackText, { color: colors.textMuted }]}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

function BulletItem({ colors, text }: { colors: any; text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={[styles.bulletDot, { backgroundColor: 'rgba(255,90,95,0.55)' }]} />
      <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{text}</Text>
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
