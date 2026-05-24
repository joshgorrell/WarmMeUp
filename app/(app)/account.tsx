import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Share, Alert, Platform,
  ActivityIndicator, Modal, Image, Linking,
} from 'react-native';
import AppText from '@/components/AppText';
import AppTextInput from '@/components/AppTextInput';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Heart, Copy, Share2, UserPlus, Camera, Pencil, Check, X, ChevronRight, ChevronLeft, Shield, Mail, KeyRound, Lock, Trash2, RotateCcw, MessageSquare, FolderOpen, TriangleAlert as AlertTriangle, Trophy, SlidersHorizontal, LogOut, ScanFace, FingerprintPattern as Fingerprint, CircleQuestionMark, UserX, Clock, Users, Smartphone, FileSliders as Sliders, RefreshCw } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { secureKey } from '@/lib/secureKey';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { supabase } from '@/lib/supabase';
import { generateInviteCode, codeExpiresAt, isCodeExpired } from '@/lib/inviteCode';
import { FontSize, Spacing, Radius, Gradient } from '@/constants/theme';
import Toggle from '@/components/Toggle';
import AppShell from '@/components/AppShell';
import Avatar from '@/components/Avatar';
import BottomSheet from '@/components/BottomSheet';
import WarmupLogo from '@/components/WarmupLogo';
import BrandHeader from '@/components/BrandHeader';
import QuickStatsRow from '@/components/QuickStatsRow';
import { UserSettings } from '@/lib/types';
import { LinearGradient } from 'expo-linear-gradient';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useSubscription } from '@/hooks/useSubscription';
import CommunityGuidelinesModal from '@/components/CommunityGuidelinesModal';
import TermsModal from '@/components/TermsModal';
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal';
import LeavePartnerSheet from '@/components/LeavePartnerSheet';

const PAD = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
type PinStep = 'current' | 'new' | 'confirm' | 'recover-password';
type AccountTab = 'profile' | 'settings';

// ─── Section wrapper ──────────────────────────────────────────────
function Section({ title, note, onInfo, children }: { title: string; note?: string; onInfo?: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <AppText style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</AppText>
        {onInfo && (
          <TouchableOpacity onPress={onInfo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
            <CircleQuestionMark color="rgba(255,46,138,0.7)" size={14} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
        {note && (
          <View style={[styles.ownerNote, { borderBottomColor: colors.borderSubtle }]}>
            <AppText style={[styles.ownerNoteText, { color: colors.textMuted }]}>{note}</AppText>
          </View>
        )}
        {children}
      </View>
    </View>
  );
}

// ─── Settings row ─────────────────────────────────────────────────
function SettingsRow({
  label, sub, toggle, value, onChange, onPress, onInfo, danger, last, accent, disabled,
}: {
  label: string; sub?: string; toggle?: boolean; value?: boolean;
  onChange?: (v: boolean) => void; onPress?: () => void; onInfo?: () => void;
  danger?: boolean; last?: boolean; accent?: boolean; disabled?: boolean;
}) {
  const { colors } = useTheme();
  const labelColor = danger ? colors.danger : accent ? '#FF2E8A' : colors.text;
  const chevronColor = danger ? colors.danger : accent ? '#FF2E8A' : colors.textMuted;
  const content = (
    <View style={[styles.row, { borderBottomColor: last ? 'transparent' : colors.borderSubtle, borderBottomWidth: last ? 0 : 1 }]}>
      <View style={styles.rowLeft}>
        <View style={styles.rowLabelRow}>
          <AppText style={[styles.rowLabel, { color: labelColor }]}>{label}</AppText>
          {onInfo && (
            <TouchableOpacity onPress={onInfo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
              <CircleQuestionMark color="rgba(255,46,138,0.7)" size={14} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
        {sub && <AppText style={[styles.rowSub, { color: colors.textMuted }]}>{sub}</AppText>}
      </View>
      {toggle
        ? <Toggle value={value ?? false} onChange={onChange ?? (() => {})} disabled={disabled} />
        : <ChevronRight color={chevronColor} size={16} />
      }
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  return content;
}

// ─── Inline password/text field ───────────────────────────────────
function InlineField({
  label, value, onChange, secure, placeholder, last,
}: {
  label: string; value: string; onChange: (v: string) => void;
  secure?: boolean; placeholder?: string; last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.inlineFieldRow, { borderBottomColor: last ? 'transparent' : colors.borderSubtle, borderBottomWidth: last ? 0 : 1 }]}>
      <AppText style={[styles.inlineFieldLabel, { color: colors.textMuted }]}>{label}</AppText>
      <AppTextInput
        style={[styles.inlineFieldInput, { color: colors.text }]}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        placeholder={placeholder ?? ''}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

// ─── PIN dots ─────────────────────────────────────────────────────
function PinDots({ length }: { length: number }) {
  return (
    <View style={styles.pinDots}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={[styles.pinDot, { backgroundColor: i < length ? '#FF2E8A' : 'rgba(255,255,255,0.15)' }]} />
      ))}
    </View>
  );
}

// ─── Numpad ───────────────────────────────────────────────────────
function Numpad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <View style={styles.numpad}>
      {PAD.map((k, i) => (
        <TouchableOpacity
          key={i}
          style={[styles.numKey, k === '' && styles.numKeyEmpty]}
          onPress={() => k !== '' && onKey(k)}
          activeOpacity={k === '' ? 1 : 0.6}
          disabled={k === ''}
        >
          <AppText style={[styles.numKeyText, k === '⌫' && styles.numKeyDelete]}>{k}</AppText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Require unlock after selector ───────────────────────────────
const LOCK_TIMEOUT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Always', value: null },
  { label: '5 min', value: 300 },
  { label: '15 min', value: 900 },
  { label: '1 hour', value: 3600 },
  { label: 'Never', value: -1 },
];

function RequireUnlockAfterRow({
  current, colors, onSelect,
}: {
  current: number | null;
  colors: any;
  onSelect: (seconds: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = LOCK_TIMEOUT_OPTIONS.find(o => o.value === current) ?? LOCK_TIMEOUT_OPTIONS[0];
  return (
    <>
      <TouchableOpacity
        style={[rua.row, { borderBottomColor: colors.borderSubtle }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <AppText style={[rua.label, { color: colors.text }]}>Require Unlock After</AppText>
          <AppText style={[rua.sub, { color: colors.textMuted }]}>How long before you need to unlock again</AppText>
        </View>
        <View style={rua.valueWrap}>
          <AppText style={[rua.value, { color: colors.textSecondary }]}>{selected.label}</AppText>
          <ChevronRight color={colors.textMuted} size={16} strokeWidth={2} />
        </View>
      </TouchableOpacity>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Require Unlock After"
        subtitle="How long before you need to unlock again"
      >
        {LOCK_TIMEOUT_OPTIONS.map((opt, i) => {
          const sel = current === opt.value;
          const last = i === LOCK_TIMEOUT_OPTIONS.length - 1;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[rua.option, !last && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}
              onPress={() => { onSelect(opt.value); setOpen(false); }}
              activeOpacity={0.7}
            >
              <AppText style={[rua.optionLabel, { color: sel ? '#FF2E8A' : colors.text }]}>{opt.label}</AppText>
              {sel && <Check color="#FF2E8A" size={16} strokeWidth={2.5} />}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>
    </>
  );
}

// ─── Login method selector ────────────────────────────────────────
function LoginMethodSelector({
  current, bioAvailable, biometricLabel, colors, inactive, onSelect,
}: {
  current: 'password' | 'pin' | 'biometric';
  bioAvailable: boolean;
  biometricLabel: string;
  colors: any;
  inactive: boolean;
  onSelect: (method: 'password' | 'pin' | 'biometric') => void;
}) {
  const BiometricIcon = biometricLabel === 'Touch ID' ? Fingerprint : ScanFace;
  const methods: { key: 'biometric' | 'pin' | 'password'; label: string; sub: string; icon: React.ReactNode; disabled?: boolean }[] = [
    {
      key: 'biometric',
      label: biometricLabel,
      sub: bioAvailable ? 'Instant unlock with face or fingerprint' : 'Not available on this device',
      icon: <BiometricIcon color={bioAvailable ? '#FF2E8A' : colors.textDisabled} size={18} strokeWidth={1.8} />,
      disabled: !bioAvailable,
    },
    {
      key: 'pin',
      label: 'PIN',
      sub: '4-digit PIN — fast and secure',
      icon: <KeyRound color="#FFB347" size={18} strokeWidth={1.8} />,
    },
    {
      key: 'password',
      label: 'Password',
      sub: 'Account password each time',
      icon: <Lock color={colors.textMuted} size={18} strokeWidth={1.8} />,
    },
  ];

  return (
    <View style={[lms.wrap, { borderBottomColor: colors.borderSubtle }, inactive && lms.wrapInactive]}>
      <AppText style={[lms.label, { color: inactive ? colors.textDisabled : colors.text }]}>Unlock Method</AppText>
      <AppText style={[lms.sub, { color: colors.textMuted }]}>How you open Warm Me Up each time</AppText>
      {inactive && (
        <AppText style={[lms.inactiveNote, { color: colors.textMuted }]}>Not used — unlock is set to Never</AppText>
      )}
      <View style={[lms.options, inactive && lms.optionsInactive]}>
        {methods.map((m, idx) => {
          const selected = current === m.key;
          const isDisabled = m.disabled || inactive;
          return (
            <TouchableOpacity
              key={m.key}
              style={[
                lms.option,
                { borderColor: selected && !inactive ? 'rgba(255,46,138,0.45)' : colors.borderSubtle },
                selected && !inactive && lms.optionSelected,
                isDisabled && lms.optionDisabled,
                idx === methods.length - 1 && lms.optionLast,
              ]}
              onPress={() => !isDisabled && onSelect(m.key)}
              activeOpacity={isDisabled ? 1 : 0.72}
              disabled={isDisabled}
            >
              <View style={lms.optionIcon}>{m.icon}</View>
              <View style={{ flex: 1 }}>
                <AppText style={[lms.optionLabel, { color: isDisabled ? colors.textDisabled : colors.text }]}>{m.label}</AppText>
                <AppText style={[lms.optionSub, { color: colors.textMuted }]}>{m.sub}</AppText>
              </View>
              {selected && !inactive && (
                <View style={lms.checkWrap}>
                  <Check color="#FF2E8A" size={14} strokeWidth={2.5} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const lms = StyleSheet.create({
  wrap: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, borderBottomWidth: 1 },
  wrapInactive: { opacity: 0.5 },
  label: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', marginBottom: 2 },
  sub: { fontSize: 11, fontFamily: 'Inter-Regular', marginBottom: 4 },
  inactiveNote: { fontSize: 11, fontFamily: 'Inter-Regular', fontStyle: 'italic', marginBottom: Spacing.sm },
  options: { gap: 6 },
  optionsInactive: { pointerEvents: 'none' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  optionSelected: { backgroundColor: 'rgba(255,46,138,0.06)' },
  optionDisabled: { opacity: 0.45 },
  optionLast: {},
  optionIcon: { width: 28, alignItems: 'center' },
  optionLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  optionSub: { fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 1 },
  checkWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,46,138,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const rua = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  label: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', marginBottom: 2 },
  sub: { fontSize: 11, fontFamily: 'Inter-Regular' },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
  },
  optionLabel: { fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
});

// ─── Main screen ──────────────────────────────────────────────────
export default function AccountScreen() {
  const router = useRouter();
  const { profile, partnerProfile, couple, signOut, isAdmin, user, settings, loading, refreshSettings, refreshProfile, refreshCouple, patchCouple } = useAuth();
  const { colors } = useTheme();
  const { available: bioAvailable, biometricLabel, authenticate: bioAuthenticate } = useBiometricAuth();
  const { plan, status: subStatus, isOnTrial, renewalDate, loading: subLoading, restorePurchases, openManageSubscription } = useSubscription();

  const [activeTab, setActiveTab] = useState<AccountTab>('profile');

  // Profile tab state
  const [copied, setCopied] = useState(false);
  const [codeRefreshing, setCodeRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [creatingCouple, setCreatingCouple] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Stats state
  const [streak, setStreak] = useState(0);
  const [momentsToday, setMomentsToday] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);

  // Settings tab state
  const [optimistic, setOptimistic] = useState<Partial<UserSettings>>({});
  const [optimisticPointsEnabled, setOptimisticPointsEnabled] = useState<boolean | null>(null);
  const [optimisticStreaksEnabled, setOptimisticStreaksEnabled] = useState<boolean | null>(null);

  // Change Password
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Change Email
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  // Legal modals
  const [showCommunityGuidelines, setShowCommunityGuidelines] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  // Delete History modal
  const [deleteStep, setDeleteStep] = useState<null | 'choose' | 'confirm-content' | 'confirm-all'>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);

  // Reset Points modal
  const [resetPointsOpen, setResetPointsOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const [showDiscreetInfo, setShowDiscreetInfo] = useState(false);
  const [showVaultSecurityInfo, setShowVaultSecurityInfo] = useState(false);

  // Delete Account modal
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  // Leave partner sheet
  const [showLeaveSheet, setShowLeaveSheet] = useState(false);

  // Cancel pending invite
  const [showCancelInviteSheet, setShowCancelInviteSheet] = useState(false);
  const [cancellingInvite, setCancellingInvite] = useState(false);
  const [deleteAccountStep, setDeleteAccountStep] = useState<1 | 2>(1);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  // Change PIN modal
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinStep, setPinStep] = useState<PinStep>('current');
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinRecoverPw, setPinRecoverPw] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinDone, setPinDone] = useState(false);

  const cancelingNameRef = useRef(false);
  const nameWrapRef = useRef<View | null>(null);
  const saveNameRef = useRef<() => void>(() => {});
  const profileRetriedRef = useRef(false);
  // Stable ref so useFocusEffect always calls the latest refreshCouple without
  // depending on its identity — avoids the stale-closure trap where the callback
  // only fires once because refreshCouple never changes reference.
  const refreshCoupleRef = useRef(refreshCouple);
  useEffect(() => { refreshCoupleRef.current = refreshCouple; }, [refreshCouple]);

  React.useEffect(() => {
    if (!loading && user && !profile && !profileRetriedRef.current) {
      profileRetriedRef.current = true;
      refreshProfile();
    }
  }, [loading, user, profile, refreshProfile]);

  useEffect(() => {
    if (!couple?.id || !user) return;
    loadStats();
  }, [couple?.id, user]);

  useFocusEffect(useCallback(() => {
    refreshCoupleRef.current();
  }, []));

  // Direct DB read on every focus — bypasses AuthContext fetch path entirely.
  // Fixes a case where fetchCouple's .or() query returns a stale/error result
  // while the direct user_a_id query always succeeds, ensuring the invite code
  // displayed is always the live DB value.
  useFocusEffect(useCallback(() => {
    if (!user?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('couples')
        .select('invite_code, invite_code_expires_at, id, user_b_id, user_a_id, active, points_enabled, streaks_enabled, subscription_owner_id, disconnected_at, admin_notes, invite_code_used_at')
        .eq('user_a_id', user.id)
        .is('user_b_id', null)
        .maybeSingle();
      if (!error && data && data.invite_code !== couple?.invite_code) {
        console.log('[account] direct fetch corrected invite_code from', couple?.invite_code, 'to', data.invite_code);
        patchCouple(data);
      } else if (!error && !data) {
        // User may be user_b in a paired couple — refresh via context
        refreshCoupleRef.current();
      }
    })();
  }, [user?.id, couple?.invite_code]));

  const loadStats = async () => {
    if (!couple?.id || !user) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    // Fetch streak data: only dates from the past 366 days (enough for a full year streak).
    // Fetching by a date window instead of a row limit avoids truncating couples with
    // many interactions spread across many calendar days.
    const streakWindowStart = new Date();
    streakWindowStart.setDate(streakWindowStart.getDate() - 366);
    const [scoresRes, momentsTodayRes, streakRes] = await Promise.all([
      supabase.from('scores').select('points').eq('couple_id', couple.id),
      supabase.from('interactions').select('*', { count: 'exact', head: true }).eq('couple_id', couple.id).gte('created_at', start.toISOString()),
      supabase.from('interactions').select('created_at').eq('couple_id', couple.id).gte('created_at', streakWindowStart.toISOString()).order('created_at', { ascending: false }),
    ]);
    if (scoresRes.data) setTotalPoints(scoresRes.data.reduce((sum, s) => sum + (s.points ?? 0), 0));
    setMomentsToday(momentsTodayRes.count ?? 0);
    const streakData = streakRes.data ?? [];
    if (streakData.length > 0) {
      const activeDays = new Set(streakData.map((r: { created_at: string }) => new Date(r.created_at).toDateString()));
      let days = 0;
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      while (activeDays.has(cursor.toDateString())) {
        days++;
        cursor.setDate(cursor.getDate() - 1);
      }
      setStreak(days);
    }
  };

  const s = settings ? { ...settings, ...optimistic } : (Object.keys(optimistic).length > 0 ? optimistic as UserSettings : null);

  const update = useCallback(async (patch: Record<string, unknown>) => {
    if (!user) return;
    setOptimistic(prev => ({ ...prev, ...patch }));
    const { error } = await supabase.from('user_settings').upsert(
      { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) {
      console.error('user_settings upsert failed', error);
      Alert.alert('Could not save', error.message ?? 'Please try again.');
      setOptimistic(prev => {
        const next = { ...prev };
        for (const key of Object.keys(patch)) delete (next as any)[key];
        return next;
      });
      return;
    }
    await refreshSettings();
    setOptimistic({});
  }, [user, refreshSettings]);

  // ── Partner helpers ──────────────────────────────────────────────
  const handleCopyCode = () => {
    if (!couple?.invite_code) return;
    if (Platform.OS === 'web') navigator.clipboard?.writeText(couple.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCode = async () => {
    if (!couple?.invite_code) return;
    try { await Share.share({ message: `Join me on Warm Me Up! Use this code to connect: ${couple.invite_code}` }); } catch {}
  };

  const handleRefreshCode = async () => {
    if (codeRefreshing) return;
    if (couple?.user_b_id) return;
    setCodeRefreshing(true);

    // Always re-fetch the live couple row by user_a_id before updating so we
    // use the correct DB row id, even if context has a stale couple object.
    let targetId = couple?.id;
    if (user?.id) {
      const { data: live } = await supabase
        .from('couples')
        .select('id, invite_code, user_b_id')
        .eq('user_a_id', user.id)
        .is('user_b_id', null)
        .maybeSingle();
      if (live?.id) {
        targetId = live.id;
        if (live.invite_code !== couple?.invite_code) {
          patchCouple({ invite_code: live.invite_code });
        }
      }
    }

    if (!targetId) {
      setCodeRefreshing(false);
      return;
    }

    const newCode = generateInviteCode();
    const newExpiry = codeExpiresAt();
    const { data: updated, error } = await supabase
      .from('couples')
      .update({ invite_code: newCode, invite_code_expires_at: newExpiry })
      .eq('id', targetId)
      .select()
      .single();
    if (error || !updated) {
      console.error('[handleRefreshCode] supabase update failed:', JSON.stringify(error), 'targetId:', targetId);
      Alert.alert('Error', 'Could not refresh code. Please try again.');
      setCodeRefreshing(false);
      return;
    }
    patchCouple({ invite_code: updated.invite_code, invite_code_expires_at: updated.invite_code_expires_at });
    try {
      await refreshCouple();
    } catch {
      // Best-effort — local state already patched with confirmed code
    }
    setCodeRefreshing(false);
  };

  const handleCancelInvite = async () => {
    if (!couple?.id || couple.user_b_id || cancellingInvite) return;
    setCancellingInvite(true);
    const { error } = await supabase
      .from('couples')
      .delete()
      .eq('id', couple.id)
      .is('user_b_id', null);
    if (!error) {
      await refreshCouple();
    }
    setCancellingInvite(false);
    setShowCancelInviteSheet(false);
  };

  const handleInvitePartner = async () => {
    if (!user || creatingCouple) return;
    if (couple?.invite_code) { handleShareCode(); return; }
    setCreatingCouple(true);
    try {
      const code = generateInviteCode();
      const { error } = await supabase.from('couples').insert({ user_a_id: user.id, invite_code: code, active: false });
      if (error) throw error;
      await refreshCouple();
      const msg = `Join me on Warm Me Up! Use this code to connect: ${code}`;
      if (Platform.OS === 'web') { navigator.clipboard?.writeText(code); Alert.alert('Code copied!', msg); }
      else await Share.share({ message: msg });
    } catch { Alert.alert('Error', 'Could not create invite code. Please try again.'); }
    finally { setCreatingCouple(false); }
  };

  const handleTogglePoints = async (enabled: boolean) => {
    if (!couple?.id) return;
    setOptimisticPointsEnabled(enabled);
    const { error } = await supabase.from('couples').update({ points_enabled: enabled }).eq('id', couple.id);
    if (error) {
      setOptimisticPointsEnabled(null);
      Alert.alert('Error', 'Could not update points setting. Please try again.');
      return;
    }
    await refreshCouple();
    setOptimisticPointsEnabled(null);
  };

  const handleToggleStreaks = async (enabled: boolean) => {
    if (!couple?.id) return;
    setOptimisticStreaksEnabled(enabled);
    const { error } = await supabase.from('couples').update({ streaks_enabled: enabled }).eq('id', couple.id);
    if (error) {
      setOptimisticStreaksEnabled(null);
      Alert.alert('Error', 'Could not update streaks setting. Please try again.');
      return;
    }
    await refreshCouple();
    setOptimisticStreaksEnabled(null);
  };


  // ── Name edit ────────────────────────────────────────────────────
  const startEditName = () => { setNameInput(profile?.display_name ?? ''); setEditingName(true); };
  const cancelEditName = () => { cancelingNameRef.current = true; setEditingName(false); setNameInput(''); };

  const saveName = useCallback(async () => {
    if (cancelingNameRef.current) { cancelingNameRef.current = false; return; }
    const trimmed = nameInput.trim();
    if (!user) { setEditingName(false); return; }
    if (!trimmed || trimmed === profile?.display_name) { setEditingName(false); return; }
    if (savingName) return;
    setSavingName(true);
    setNameError(null);
    try {
      const { data, error } = await supabase
        .from('profiles').update({ display_name: trimmed }).eq('id', user.id)
        .select('id, display_name').maybeSingle();
      if (error) { setNameError(error.message ?? 'Could not save. Please try again.'); return; }
      if (!data) { setNameError('Update was blocked. Please sign in again.'); return; }
      await refreshProfile();
      setEditingName(false);
    } finally { setSavingName(false); }
  }, [nameInput, user, profile?.display_name, savingName, refreshProfile]);

  useEffect(() => { saveNameRef.current = saveName; }, [saveName]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !editingName) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const wrap = nameWrapRef.current as unknown as HTMLElement | null;
      if (wrap && target && wrap.contains(target)) return;
      saveNameRef.current();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingName]);

  // ── Avatar upload ────────────────────────────────────────────────
  const uploadAvatarFile = useCallback(async (file: File) => {
    if (!user) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (uploadError) { setAvatarError(uploadError.message ?? 'Upload failed.'); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { data: updated, error: updateError } = await supabase
        .from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
        .select('id, avatar_url').maybeSingle();
      if (updateError) { setAvatarError(updateError.message ?? 'Could not link photo to profile.'); return; }
      if (!updated) { setAvatarError('Update was blocked. Please sign in again.'); return; }
      await refreshProfile();
    } catch (err: any) { setAvatarError(err?.message ?? 'Upload failed.'); }
    finally { setUploadingAvatar(false); }
  }, [user, refreshProfile]);

  const uploadAvatarUri = useCallback(async (uri: string) => {
    if (!user) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const res = await fetch(uri);
      const blob = await res.blob();
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
      if (uploadError) { setAvatarError(uploadError.message ?? 'Upload failed.'); return; }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { data: updated, error: updateError } = await supabase
        .from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
        .select('id, avatar_url').maybeSingle();
      if (updateError) { setAvatarError(updateError.message ?? 'Could not link photo to profile.'); return; }
      if (!updated) { setAvatarError('Update was blocked. Please sign in again.'); return; }
      await refreshProfile();
    } catch (err: any) { setAvatarError(err?.message ?? 'Upload failed.'); }
    finally { setUploadingAvatar(false); }
  }, [user, refreshProfile]);

  const handlePickAvatar = useCallback(async () => {
    if (!user || uploadingAvatar) return;
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setAvatarError('Photo library permission is required to upload a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        void uploadAvatarUri(result.assets[0].uri);
      }
      return;
    }
    // Web: file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void uploadAvatarFile(file);
      input.remove();
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [user, uploadingAvatar, uploadAvatarFile, uploadAvatarUri]);

  // ── Change Password ──────────────────────────────────────────────
  const openChangePw = () => {
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setPwError(null); setPwSuccess(false);
    setShowChangePw(true);
    setShowChangeEmail(false);
  };

  const handleSavePassword = async () => {
    if (!user?.email) return;
    setPwError(null);
    if (!currentPw) { setPwError('Enter your current password.'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match.'); return; }
    setSavingPw(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
      if (verifyErr) { setPwError('Current password is incorrect.'); return; }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) { setPwError(updateErr.message ?? 'Could not update password.'); return; }
      setPwSuccess(true);
      setTimeout(() => { setShowChangePw(false); setPwSuccess(false); }, 2000);
    } finally { setSavingPw(false); }
  };

  // ── Change Email ─────────────────────────────────────────────────
  const openChangeEmail = () => {
    setNewEmail('');
    setEmailError(null); setEmailSuccess(false);
    setShowChangeEmail(true);
    setShowChangePw(false);
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) { setEmailError('Enter a valid email address.'); return; }
    setSavingEmail(true);
    setEmailError(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) { setEmailError(error.message ?? 'Could not update email.'); return; }
      setEmailSuccess(true);
      setTimeout(() => { setShowChangeEmail(false); setEmailSuccess(false); }, 3500);
    } finally { setSavingEmail(false); }
  };

  // ── Change PIN ───────────────────────────────────────────────────
  const openPinModal = () => {
    setPinStep('current');
    setPinCurrent(''); setPinNew(''); setPinConfirm(''); setPinRecoverPw('');
    setPinError(''); setPinSaving(false); setPinDone(false);
    setPinModalOpen(true);
  };

  const closePinModal = () => { if (!pinSaving) setPinModalOpen(false); };

  const getPinValue = () => {
    if (pinStep === 'current') return pinCurrent;
    if (pinStep === 'new') return pinNew;
    if (pinStep === 'confirm') return pinConfirm;
    return '';
  };

  const handlePinKey = async (k: string) => {
    if (pinStep === 'recover-password') return;
    const cur = getPinValue();
    let next: string;
    if (k === '⌫') { next = cur.slice(0, -1); }
    else { if (cur.length >= 4) return; next = cur + k; }

    if (pinStep === 'current') {
      setPinCurrent(next);
      if (next.length === 4) {
        let stored: string | null = null;
        if (Platform.OS !== 'web' && user) {
          stored = await SecureStore.getItemAsync(secureKey('warmup_pin', user.id));
        } else if (Platform.OS === 'web' && user && typeof window !== 'undefined') {
          stored = window.localStorage.getItem(secureKey('warmup_pin', user.id));
        }
        if (stored !== null && stored !== next) {
          setPinError('Incorrect PIN. Try again.');
          setTimeout(() => { setPinCurrent(''); setPinError(''); }, 1000);
          return;
        }
        setPinError('');
        setPinStep('new');
        setPinNew('');
      }
    } else if (pinStep === 'new') {
      setPinNew(next);
      if (next.length === 4) { setPinStep('confirm'); setPinConfirm(''); }
    } else if (pinStep === 'confirm') {
      setPinConfirm(next);
      if (next.length === 4) {
        if (next !== pinNew) {
          setPinError('PINs do not match. Try again.');
          setTimeout(() => { setPinConfirm(''); setPinNew(''); setPinStep('new'); setPinError(''); }, 1200);
          return;
        }
        setPinSaving(true);
        try {
          if (Platform.OS !== 'web' && user) {
            await SecureStore.setItemAsync(secureKey('warmup_pin', user.id), next);
          } else if (Platform.OS === 'web' && user && typeof window !== 'undefined') {
            window.localStorage.setItem(secureKey('warmup_pin', user.id), next);
          }
          setPinDone(true);
          setTimeout(() => { setPinModalOpen(false); setPinDone(false); }, 1800);
        } finally { setPinSaving(false); }
      }
    }
  };

  const handleForgotPin = () => {
    setPinStep('recover-password');
    setPinRecoverPw('');
    setPinError('');
  };

  const handlePinRecoverVerify = async () => {
    if (!user?.email || !pinRecoverPw) { setPinError('Enter your app password.'); return; }
    setPinSaving(true);
    setPinError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: pinRecoverPw });
      if (error) { setPinError('Incorrect password. Try again.'); return; }
      setPinStep('new');
      setPinNew('');
      setPinError('');
    } finally { setPinSaving(false); }
  };

  // ── Delete History ───────────────────────────────────────────────

  // Deletes all files under a couple folder by listing user sub-folders then
  // paginating through each sub-folder's files in batches of 100.
  const deleteStorageFolder = async (bucket: string, coupleId: string) => {
    try {
      const { data: userFolders } = await supabase.storage.from(bucket).list(coupleId);
      if (!userFolders?.length) return;
      for (const folder of userFolders) {
        let offset = 0;
        const PAGE = 100;
        while (true) {
          const { data: files } = await supabase.storage
            .from(bucket)
            .list(`${coupleId}/${folder.name}`, { limit: PAGE, offset });
          if (!files?.length) break;
          await supabase.storage
            .from(bucket)
            .remove(files.map(f => `${coupleId}/${folder.name}/${f.name}`));
          if (files.length < PAGE) break;
          offset += PAGE;
        }
      }
    } catch {}
  };

  const handleDeleteHistory = async (includeVault: boolean) => {
    if (!couple?.id) return;
    setDeleting(true);
    try {
      await supabase.from('chat_messages').delete().eq('couple_id', couple.id);
      await supabase.from('interactions').delete().eq('couple_id', couple.id);
      await supabase.from('cash_in_events').delete().eq('couple_id', couple.id);
      await supabase.from('point_events').delete().eq('couple_id', couple.id);
      await supabase.from('monthly_scores').delete().eq('couple_id', couple.id);
      await supabase.from('scores').update({ points: 0 }).eq('couple_id', couple.id);
      await deleteStorageFolder('chat_media', couple.id);
      if (includeVault) {
        await supabase.from('vault_items').delete().eq('couple_id', couple.id);
        await deleteStorageFolder('vault', couple.id);
      }
      setDeleteDone(true);
      setTimeout(() => { setDeleteStep(null); setDeleteDone(false); loadStats(); }, 1800);
    } finally { setDeleting(false); }
  };

  // ── Reset Points ─────────────────────────────────────────────────
  const handleResetPoints = async () => {
    if (!couple?.id) return;
    setResetting(true);
    try {
      await supabase.from('point_events').delete().eq('couple_id', couple.id);
      await supabase.from('scores').update({ points: 0 }).eq('couple_id', couple.id);
      await supabase.from('monthly_scores').delete().eq('couple_id', couple.id);
      setResetDone(true);
      setTimeout(() => { setResetPointsOpen(false); setResetDone(false); loadStats(); }, 1800);
    } finally { setResetting(false); }
  };

  const handleContactSupport = async () => {
    const url = 'mailto:support@warmmeupp.app?subject=Support%20Request';
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Contact Support', 'Email us at support@warmmeupp.app');
      }
    } catch {
      Alert.alert('Contact Support', 'Email us at support@warmmeupp.app');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated. Please sign in again.');

      const { error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) throw new Error(error.message ?? 'Could not delete account. Please try again.');

      // Sign out locally and navigate away
      await supabase.auth.signOut();
      router.replace('/(auth)/welcome');
    } catch (err: any) {
      setDeleteAccountError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  if (loading) {
    return (
      <AppShell scrollable={false}>
        <View style={styles.loadingContainer}><ActivityIndicator color="#FF2E8A" size="large" /></View>
      </AppShell>
    );
  }

  const renderProfileTab = () => (
    <>
      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
        <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.8} style={styles.avatarWrap} disabled={uploadingAvatar}>
          <Avatar key={profile?.avatar_url ?? 'noavatar'} name={profile?.display_name} uri={profile?.avatar_url} size="lg" bgColor="rgba(255,46,138,0.20)" />
          <View style={[styles.cameraChip, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <Camera color={uploadingAvatar ? colors.textMuted : '#FF2E8A'} size={12} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          {editingName ? (
            <View ref={nameWrapRef} style={styles.nameEditRow}>
              <AppTextInput
                style={[styles.nameInput, { color: colors.text, borderColor: colors.borderSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }]}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
                onBlur={saveName}
                placeholderTextColor={colors.textMuted}
                placeholder="Display name"
                maxLength={40}
              />
              <TouchableOpacity onPress={saveName} disabled={savingName} style={styles.nameActionBtn} activeOpacity={0.7}>
                <Check color="#33D17A" size={18} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelEditName} style={styles.nameActionBtn} activeOpacity={0.7}>
                <X color={colors.textMuted} size={18} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={startEditName} style={styles.nameRow} activeOpacity={0.7}>
              <AppText style={[styles.name, { color: colors.text }]}>{profile?.display_name ?? 'Your Name'}</AppText>
              <Pencil color={colors.textMuted} size={14} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <AppText style={[styles.emailText, { color: colors.textMuted }]}>{user?.email ?? ''}</AppText>
          {uploadingAvatar && <AppText style={[styles.emailText, { color: '#FF2E8A', marginTop: 4 }]}>Uploading...</AppText>}
          {avatarError && !uploadingAvatar && <AppText style={[styles.emailText, { color: colors.danger, marginTop: 4 }]}>{avatarError}</AppText>}
          {nameError && <AppText style={[styles.emailText, { color: colors.danger, marginTop: 4 }]}>{nameError}</AppText>}
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsWrap}>
        <QuickStatsRow
          streak={(optimisticStreaksEnabled !== null ? optimisticStreaksEnabled : (couple?.streaks_enabled ?? true)) ? streak : '—'}
          momentsToday={momentsToday}
          totalPoints={(optimisticPointsEnabled !== null ? optimisticPointsEnabled : (couple?.points_enabled ?? true)) ? totalPoints : '—'}
        />
      </View>

      {/* Partner card */}
      {couple?.user_b_id && partnerProfile ? (
        <View style={[styles.connectedCard, { backgroundColor: colors.card, borderColor: 'rgba(255,46,138,0.22)' }]}>
          <View style={styles.connectedTop}>
            <View style={styles.connectedAvatarWrap}>
              <Avatar
                name={partnerProfile.display_name}
                uri={partnerProfile.avatar_url}
                size="md"
                bgColor="rgba(255,46,138,0.18)"
              />
              <View style={[styles.connectedDot, { backgroundColor: '#33D17A', borderColor: colors.card }]} />
            </View>
            <View style={styles.connectedInfo}>
              <View style={styles.connectedLabelRow}>
                <AppText style={[styles.connectedLabel, { color: colors.textMuted }]}>CONNECTED WITH</AppText>
                <View style={[styles.connectedPill, { backgroundColor: 'rgba(51,209,122,0.12)', borderColor: 'rgba(51,209,122,0.28)' }]}>
                  <View style={[styles.connectedPillDot, { backgroundColor: '#33D17A' }]} />
                  <AppText style={[styles.connectedPillText, { color: '#33D17A' }]}>Connected</AppText>
                </View>
              </View>
              <AppText style={[styles.connectedName, { color: colors.text }]}>
                {partnerProfile.display_name}
              </AppText>
              <AppText style={[styles.connectedHeart, { color: '#FF2E8A' }]}>
                Connected to {partnerProfile.display_name} ❤️
              </AppText>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setShowLeaveSheet(true)}
            activeOpacity={0.7}
            style={styles.manageConnectionBtn}
          >
            <AppText style={[styles.manageConnectionText, { color: colors.textMuted }]}>Manage connection</AppText>
            <ChevronRight color={colors.textMuted} size={13} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      ) : !couple?.user_b_id && couple?.invite_code ? (
        <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: 'rgba(255,46,138,0.30)' }]}>
          <View style={styles.inviteHeader}>
            <View style={[styles.heartWrap, { backgroundColor: 'rgba(255,46,138,0.12)' }]}>
              <UserPlus color="#FF2E8A" size={18} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={[styles.cardLabel, { color: colors.textMuted }]}>INVITE YOUR PARTNER</AppText>
              <AppText style={[styles.inviteHint, { color: colors.textSecondary }]}>Share your code to connect</AppText>
            </View>
          </View>
          {isCodeExpired(couple.invite_code_expires_at) && (
            <TouchableOpacity
              style={styles.codeExpiredBanner}
              onPress={handleRefreshCode}
              activeOpacity={0.75}
              disabled={codeRefreshing}
            >
              <AlertTriangle color="#FF5A5F" size={13} strokeWidth={2.2} />
              <AppText style={styles.codeExpiredText}>
                Code expired — tap to refresh
              </AppText>
            </TouchableOpacity>
          )}
          <View style={[styles.codeBox, { backgroundColor: 'rgba(255,46,138,0.06)', borderColor: isCodeExpired(couple.invite_code_expires_at) ? 'rgba(255,90,90,0.40)' : 'rgba(255,46,138,0.20)' }]}>
            <AppText style={[styles.codeText, { color: isCodeExpired(couple.invite_code_expires_at) ? 'rgba(255,255,255,0.45)' : colors.text }]}>{couple.invite_code}</AppText>
            <TouchableOpacity
              style={styles.codeRefreshBtn}
              onPress={handleRefreshCode}
              activeOpacity={0.7}
              disabled={codeRefreshing}
            >
              <RefreshCw
                color={codeRefreshing ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.45)'}
                size={15}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>
          <View style={styles.inviteActions}>
            <TouchableOpacity
              style={[styles.inviteBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]}
              onPress={handleCopyCode} activeOpacity={0.75}
            >
              <Copy color={copied ? '#33D17A' : colors.textSecondary} size={15} strokeWidth={2} />
              <AppText style={[styles.inviteBtnText, { color: copied ? '#33D17A' : colors.textSecondary }]}>{copied ? 'Copied!' : 'Copy'}</AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.inviteBtn, { borderColor: 'rgba(255,46,138,0.35)', backgroundColor: 'rgba(255,46,138,0.07)' }]}
              onPress={handleShareCode} activeOpacity={0.75}
            >
              <Share2 color="#FF2E8A" size={15} strokeWidth={2} />
              <AppText style={[styles.inviteBtnText, { color: '#FF2E8A' }]}>Share</AppText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.cancelInviteBtn}
            onPress={() => setShowCancelInviteSheet(true)}
            activeOpacity={0.7}
          >
            <X color="rgba(255,90,90,0.70)" size={13} strokeWidth={2.2} />
            <AppText style={styles.cancelInviteText}>Cancel invite</AppText>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Profile menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={() => router.push('/(app)/my-stats')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,179,71,0.10)' }]}>
            <Trophy color="#FFB347" size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.text }]}>My Stats</AppText>
          <ChevronRight color={colors.textMuted} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={() => router.push('/(app)/customize-prompts')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,179,71,0.10)' }]}>
            <SlidersHorizontal color="#FFB347" size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.text }]}>Customize Prompts</AppText>
          <ChevronRight color={colors.textMuted} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={() => setResetPointsOpen(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,179,71,0.10)' }]}>
            <RotateCcw color="#FFB347" size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.text }]}>Reset Points</AppText>
          <ChevronRight color={colors.textMuted} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: colors.borderSubtle }]}
          onPress={() => setDeleteStep('choose')}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,90,95,0.08)' }]}>
            <Trash2 color={colors.danger} size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.danger }]}>Delete History</AppText>
          <ChevronRight color={colors.danger} size={16} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuRow, { borderBottomColor: 'transparent' }]}
          onPress={signOut}
          activeOpacity={0.7}
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(255,90,95,0.08)' }]}>
            <LogOut color={colors.danger} size={18} strokeWidth={2} />
          </View>
          <AppText style={[styles.menuText, { color: colors.danger }]}>Sign Out</AppText>
          <ChevronRight color={colors.danger} size={16} />
        </TouchableOpacity>
      </View>

      {/* Footer logo */}
      <View style={styles.footerLogoWrap}>
        <Image
          source={require('@/assets/images/image_(2).png')}
          style={styles.footerLogo}
          resizeMode="contain"
        />
      </View>
    </>
  );

  const renderSettingsTab = () => (
    <>
      <Section title="LOGIN & SECURITY">
        <View style={[styles.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]}>
          <View style={styles.rowLeft}>
            <AppText style={[styles.rowLabel, { color: colors.text }]}>Email Address</AppText>
            <AppText style={[styles.rowSub, { color: colors.textMuted }]}>{user?.email ?? '—'}</AppText>
          </View>
          <Mail color={colors.textMuted} size={16} strokeWidth={1.5} />
        </View>

        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]}
          onPress={showChangeEmail ? () => setShowChangeEmail(false) : openChangeEmail}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <AppText style={[styles.rowLabel, { color: colors.text }]}>Change Email</AppText>
          </View>
          {showChangeEmail ? <X color={colors.textMuted} size={16} /> : <ChevronRight color={colors.textMuted} size={16} />}
        </TouchableOpacity>

        {showChangeEmail && (
          <View style={[styles.inlineForm, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            {emailSuccess ? (
              <View style={styles.inlineSuccess}>
                <Check color="#33D17A" size={16} strokeWidth={2.5} />
                <AppText style={[styles.inlineSuccessText, { color: '#33D17A' }]}>Confirmation sent — check your new inbox.</AppText>
              </View>
            ) : (
              <>
                <InlineField label="New Email" value={newEmail} onChange={setNewEmail} placeholder="you@example.com" last />
                {emailError && <AppText style={[styles.inlineError, { color: colors.danger }]}>{emailError}</AppText>}
                <AppText style={[styles.inlineNote, { color: colors.textMuted }]}>
                  A confirmation link will be sent to your new address. Your email changes once you click it.
                </AppText>
                <TouchableOpacity
                  style={[styles.inlineSubmitBtn, { backgroundColor: '#FF2E8A', opacity: savingEmail ? 0.6 : 1 }]}
                  onPress={handleSaveEmail}
                  disabled={savingEmail}
                  activeOpacity={0.8}
                >
                  {savingEmail
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <AppText style={styles.inlineSubmitText}>Send Confirmation</AppText>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.row, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 }]}
          onPress={showChangePw ? () => setShowChangePw(false) : openChangePw}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <AppText style={[styles.rowLabel, { color: colors.text }]}>Change Password</AppText>
          </View>
          {showChangePw ? <X color={colors.textMuted} size={16} /> : <ChevronRight color={colors.textMuted} size={16} />}
        </TouchableOpacity>

        {showChangePw && (
          <View style={[styles.inlineForm, { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
            {pwSuccess ? (
              <View style={styles.inlineSuccess}>
                <Check color="#33D17A" size={16} strokeWidth={2.5} />
                <AppText style={[styles.inlineSuccessText, { color: '#33D17A' }]}>Password updated successfully.</AppText>
              </View>
            ) : (
              <>
                <InlineField label="Current Password" value={currentPw} onChange={setCurrentPw} secure placeholder="••••••••" />
                <InlineField label="New Password" value={newPw} onChange={setNewPw} secure placeholder="8+ characters" />
                <InlineField label="Confirm New" value={confirmPw} onChange={setConfirmPw} secure placeholder="••••••••" last />
                {pwError && <AppText style={[styles.inlineError, { color: colors.danger }]}>{pwError}</AppText>}
                <TouchableOpacity
                  style={[styles.inlineSubmitBtn, { backgroundColor: '#FF2E8A', opacity: savingPw ? 0.6 : 1 }]}
                  onPress={handleSavePassword}
                  disabled={savingPw}
                  activeOpacity={0.8}
                >
                  {savingPw
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <AppText style={styles.inlineSubmitText}>Update Password</AppText>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <SettingsRow label="Change PIN" sub="Update your 4-digit app lock PIN" onPress={openPinModal} last />
      </Section>

      <Section title="MY DEVICE PRIVACY" note="These settings only affect your device. Your partner manages their own independently.">
        <SettingsRow label="Privacy Mode" sub="Show Weather Lock Screen when you open the app" toggle value={s?.stealth_mode_enabled ?? true} onChange={v => update({ stealth_mode_enabled: v })} />
        <RequireUnlockAfterRow
          current={s?.lock_after_seconds ?? null}
          colors={colors}
          onSelect={(seconds) => update({ lock_after_seconds: seconds })}
        />
        <LoginMethodSelector
          current={s?.login_method ?? 'pin'}
          bioAvailable={bioAvailable}
          biometricLabel={biometricLabel}
          colors={colors}
          inactive={(s?.lock_after_seconds ?? null) === -1}
          onSelect={async (method) => {
            if (method === 'biometric') {
              const result = await bioAuthenticate('Confirm biometrics to enable this method');
              if (!result.success) return;
            }
            update({ login_method: method });
          }}
        />
      </Section>

      <Section title="MY VAULT UPLOADS" note="These are your defaults for items you add. They only apply to content you upload — your partner controls their own uploads separately." onInfo={() => setShowVaultSecurityInfo(true)}>
        <SettingsRow label="Allow Screenshots of My Uploads" sub="Your partner can screenshot items you've added to the Vault" toggle value={s?.vault_allow_screenshot_default ?? false} onChange={v => update({ vault_allow_screenshot_default: v })} />
        <SettingsRow label="Allow Saving My Uploads" sub="Your partner can save your uploads to their phone" toggle value={s?.vault_allow_save_default ?? false} onChange={v => update({ vault_allow_save_default: v })} />
        <SettingsRow label="Allow Sharing My Uploads Outside App" sub="Your partner can share your content externally" toggle value={s?.vault_allow_share_default ?? false} onChange={v => update({ vault_allow_share_default: v })} />
        <SettingsRow label="Notify Me if My Content is Screenshotted" sub="You'll be alerted when your partner screenshots something you uploaded" toggle value={s?.screenshot_notify_partner ?? true} onChange={v => update({ screenshot_notify_partner: v })} />
        <SettingsRow label="Auto-Save Chat Media to Vault" sub="Photos and videos you send in Chat are automatically saved to your Vault. Deleting from either place removes both." toggle value={s?.chat_auto_save_to_vault ?? true} onChange={v => update({ chat_auto_save_to_vault: v })} last />
      </Section>

      <Section title="VAULT PREFERENCES">
        <SettingsRow label="Face ID to open Vault" sub="Extra protection for Vault content" toggle value={s?.vault_face_id_required ?? true} onChange={v => update({ vault_face_id_required: v })} />
        <SettingsRow label="Blur images and video until tapped" sub="Tap once to reveal in Chat and Vault; re-blurs when you leave the app" toggle value={s?.blur_media ?? true} onChange={v => update({ blur_media: v })} last />
      </Section>

      <Section title="NOTIFICATIONS">
        <SettingsRow label="Discreet Notifications" sub="Never show content previews" toggle value={s?.discreet_notifications ?? true} onChange={v => update({ discreet_notifications: v })} onInfo={() => setShowDiscreetInfo(true)} last />
      </Section>

      <Section
        title="POINTS & SCORE"
        note={
          couple?.id
            ? "This setting affects both you and your partner. Points are always tallied in the background — turning this off just hides the scores."
            : "Connect with a partner to enable the points system."
        }
      >
        <SettingsRow
          label="Points System"
          sub="Show scores, leaderboard, and Cash In features"
          toggle
          value={optimisticPointsEnabled !== null ? optimisticPointsEnabled : (couple?.points_enabled ?? true)}
          onChange={handleTogglePoints}
          disabled={!couple?.id}
          last
        />
      </Section>

      <Section
        title="STREAKS"
        note={
          couple?.id
            ? "This setting affects both you and your partner. Your streak is always tracked in the background — turning this off just hides it."
            : "Connect with a partner to enable streaks."
        }
      >
        <SettingsRow
          label="Day Streak"
          sub="Show your current consecutive-day activity streak"
          toggle
          value={optimisticStreaksEnabled !== null ? optimisticStreaksEnabled : (couple?.streaks_enabled ?? true)}
          onChange={handleToggleStreaks}
          disabled={!couple?.id}
          last
        />
      </Section>

      <Section title="SUPPORT">
        <SettingsRow
          label="Contact Support"
          sub="Get help from the Warm Me Up team"
          onPress={handleContactSupport}
        />
        <SettingsRow
          label="Community Guidelines"
          sub="How we keep this space safe and respectful"
          onPress={() => setShowCommunityGuidelines(true)}
          last
        />
      </Section>

      <Section title="SUBSCRIPTION">
        <SettingsRow
          label="Current Plan"
          sub={subLoading ? '—' : plan}
        />
        <SettingsRow
          label="Status"
          sub={subLoading ? '—' : subStatus}
        />
        {isOnTrial && (
          <SettingsRow
            label="Free Trial"
            sub="7-day trial in progress"
          />
        )}
        {renewalDate && (
          <SettingsRow
            label="Renews"
            sub={renewalDate}
          />
        )}
        <SettingsRow
          label="Manage Subscription"
          sub="View or cancel in the App Store"
          onPress={openManageSubscription}
          accent
        />
        <SettingsRow
          label="Restore Purchases"
          sub="Recover a previous subscription"
          onPress={restorePurchases}
          last
        />
      </Section>

      <Section title="SECURITY">
        <SettingsRow label="Terms of Service" sub="The rules for using Warm Me Up" onPress={() => setShowTerms(true)} />
        <SettingsRow label="Privacy Policy" sub="How we handle your data" onPress={() => setShowPrivacyPolicy(true)} />
        <SettingsRow label="Delete My Account" danger onPress={() => { setDeleteAccountError(null); setDeleteAccountStep(1); setDeleteAccountOpen(true); }} last />
      </Section>
    </>
  );

  return (
    <>
      <AppShell scrollable={false}>
        <BrandHeader
          avatarName={profile?.display_name ?? ''}
          avatarUri={profile?.avatar_url ?? null}
          rightSlot={
            <View style={styles.headerRight}>
              {isAdmin && (
                <TouchableOpacity style={styles.adminBadge} onPress={() => router.push('/(admin)')} activeOpacity={0.7}>
                  <Shield color="#FF2E8A" size={14} strokeWidth={2} />
                  <AppText style={styles.adminBadgeText}>Admin</AppText>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                <ChevronLeft color={colors.textSecondary} size={24} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          }
        />
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >

          {/* Profile / Settings tab switcher */}
          <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.8}
            >
              {activeTab === 'profile' && (
                <LinearGradient
                  colors={Gradient.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: Radius.pill }]}
                />
              )}
              <AppText style={[styles.tabLabel, { color: activeTab === 'profile' ? '#fff' : colors.textMuted }]}>
                Profile
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab('settings')}
              activeOpacity={0.8}
            >
              {activeTab === 'settings' && (
                <LinearGradient
                  colors={Gradient.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[StyleSheet.absoluteFill, { borderRadius: Radius.pill }]}
                />
              )}
              <AppText style={[styles.tabLabel, { color: activeTab === 'settings' ? '#fff' : colors.textMuted }]}>
                Settings
              </AppText>
            </TouchableOpacity>
          </View>

          {activeTab === 'profile' ? renderProfileTab() : renderSettingsTab()}

          <View style={{ height: 60 }} />
        </ScrollView>
      </AppShell>

      {/* ── Reset Points Modal ────────────────────────────────────── */}
      <Modal visible={resetPointsOpen} transparent animationType="fade" onRequestClose={() => { if (!resetting) setResetPointsOpen(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.dataModalCard, { backgroundColor: colors.card, borderColor: 'rgba(255,179,71,0.20)' }]}>
            {!resetDone ? (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,179,71,0.12)' }]}>
                  <RotateCcw color="#FFB347" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Reset All Points?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This will reset all points back to zero — including all-time history. It's like starting the game over fresh!{'\n\n'}Your content, vault, and settings are not affected. This cannot be undone.
                </AppText>
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]} onPress={() => setResetPointsOpen(false)} activeOpacity={0.7} disabled={resetting}>
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Cancel</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dataModalResetBtn} onPress={handleResetPoints} activeOpacity={0.8} disabled={resetting}>
                    {resetting ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={styles.dataModalResetBtnText}>Yes, Reset</AppText>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(51,209,122,0.12)' }]}>
                  <Check color="#33D17A" size={28} strokeWidth={2} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Points Reset</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>Both scores are back to zero. Ready for a fresh start!</AppText>
                <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle, marginTop: 4 }]} onPress={() => { setResetPointsOpen(false); setResetDone(false); }} activeOpacity={0.7}>
                  <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Done</AppText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Delete History Modal ───────────────────────────────────── */}
      <Modal visible={deleteStep !== null} transparent animationType="fade" onRequestClose={() => { if (!deleting) setDeleteStep(null); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.dataModalCard, { backgroundColor: colors.card, borderColor: 'rgba(255,59,48,0.18)' }]}>

            {deleteStep === 'choose' && (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,59,48,0.10)' }]}>
                  <Trash2 color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Delete History</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  Your profile, settings, partner connection, and custom prompts will all be kept. Choose what to delete:
                </AppText>
                <TouchableOpacity style={[styles.dataOptionBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.card }]} onPress={() => setDeleteStep('confirm-content')} activeOpacity={0.8}>
                  <View style={[styles.dataOptionIcon, { backgroundColor: 'rgba(255,90,61,0.10)' }]}>
                    <MessageSquare color="#FF5A3D" size={20} strokeWidth={2} />
                  </View>
                  <View style={styles.dataOptionText}>
                    <AppText style={[styles.dataOptionTitle, { color: colors.text }]}>All Content</AppText>
                    <AppText style={[styles.dataOptionSub, { color: colors.textSecondary }]}>Chat, dares, dice, asks, scores — Vault stays</AppText>
                  </View>
                  <ChevronRight color={colors.textMuted} size={16} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dataOptionBtn, { borderColor: 'rgba(255,59,48,0.25)', backgroundColor: 'rgba(255,59,48,0.05)' }]} onPress={() => setDeleteStep('confirm-all')} activeOpacity={0.8}>
                  <View style={[styles.dataOptionIcon, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
                    <FolderOpen color="#FF3B30" size={20} strokeWidth={2} />
                  </View>
                  <View style={styles.dataOptionText}>
                    <AppText style={[styles.dataOptionTitle, { color: colors.danger }]}>All Content + Vault</AppText>
                    <AppText style={[styles.dataOptionSub, { color: colors.textSecondary }]}>Everything above, plus all Vault photos and videos</AppText>
                  </View>
                  <ChevronRight color={colors.danger} size={16} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle, marginTop: 4 }]} onPress={() => setDeleteStep(null)} activeOpacity={0.7}>
                  <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Cancel</AppText>
                </TouchableOpacity>
              </>
            )}

            {deleteStep === 'confirm-content' && !deleteDone && (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,59,48,0.10)' }]}>
                  <AlertTriangle color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Delete All Content?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This will permanently delete all chat messages, dares, dice challenges, asks, scores, and point history.{'\n\n'}Your Vault is not affected. This cannot be undone.
                </AppText>
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]} onPress={() => setDeleteStep('choose')} activeOpacity={0.7} disabled={deleting}>
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Back</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dataModalDeleteBtn} onPress={() => handleDeleteHistory(false)} activeOpacity={0.8} disabled={deleting}>
                    {deleting ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={styles.dataModalDeleteBtnText}>Yes, Delete</AppText>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {deleteStep === 'confirm-all' && !deleteDone && (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,59,48,0.10)' }]}>
                  <AlertTriangle color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Delete Everything?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This will permanently delete all chat messages, dares, dice challenges, asks, scores, point history, and all Vault photos and videos.{'\n\n'}This cannot be undone.
                </AppText>
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]} onPress={() => setDeleteStep('choose')} activeOpacity={0.7} disabled={deleting}>
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Back</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dataModalDeleteBtn} onPress={() => handleDeleteHistory(true)} activeOpacity={0.8} disabled={deleting}>
                    {deleting ? <ActivityIndicator color="#fff" size="small" /> : <AppText style={styles.dataModalDeleteBtnText}>Yes, Delete All</AppText>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {deleteDone && (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(51,209,122,0.12)' }]}>
                  <Check color="#33D17A" size={28} strokeWidth={2} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>All Clear</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  Your history has been deleted. Your settings and connection are intact — ready for a fresh start.
                </AppText>
                <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle, marginTop: 4 }]} onPress={() => { setDeleteStep(null); setDeleteDone(false); }} activeOpacity={0.7}>
                  <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Done</AppText>
                </TouchableOpacity>
              </>
            )}

          </View>
        </View>
      </Modal>

      {/* ── Change PIN Modal ───────────────────────────────────────── */}
      <Modal visible={pinModalOpen} transparent animationType="fade" onRequestClose={closePinModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.pinModalCard, { backgroundColor: colors.modalBg }]}>

            {pinDone ? (
              <>
                <View style={[styles.pinModalIcon, { backgroundColor: 'rgba(51,209,122,0.12)' }]}>
                  <Check color="#33D17A" size={28} strokeWidth={2} />
                </View>
                <AppText style={[styles.pinModalTitle, { color: colors.text }]}>PIN Updated</AppText>
                <AppText style={[styles.pinModalSub, { color: colors.textSecondary }]}>
                  Your new PIN is saved securely on this device.
                </AppText>
                <TouchableOpacity style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle, marginTop: Spacing.sm, alignSelf: 'stretch' }]} onPress={closePinModal} activeOpacity={0.7}>
                  <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Done</AppText>
                </TouchableOpacity>
              </>
            ) : pinStep === 'recover-password' ? (
              <>
                <TouchableOpacity style={styles.pinModalClose} onPress={closePinModal} activeOpacity={0.7}>
                  <X color={colors.textMuted} size={20} />
                </TouchableOpacity>
                <View style={[styles.pinModalIcon, { backgroundColor: 'rgba(255,46,138,0.10)' }]}>
                  <Lock color="#FF2E8A" size={26} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.pinModalTitle, { color: colors.text }]}>Verify Identity</AppText>
                <AppText style={[styles.pinModalSub, { color: colors.textSecondary }]}>
                  Enter your app password to reset your PIN.
                </AppText>
                <View style={[styles.pinRecoverField, { borderColor: colors.borderSubtle, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                  <AppTextInput
                    style={[styles.pinRecoverInput, { color: colors.text }]}
                    value={pinRecoverPw}
                    onChangeText={setPinRecoverPw}
                    secureTextEntry
                    placeholder="App password"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                </View>
                {pinError ? <AppText style={[styles.pinError, { color: colors.danger }]}>{pinError}</AppText> : null}
                <TouchableOpacity
                  style={[styles.pinRecoverBtn, { backgroundColor: '#FF2E8A', opacity: pinSaving ? 0.6 : 1 }]}
                  onPress={handlePinRecoverVerify}
                  disabled={pinSaving}
                  activeOpacity={0.8}
                >
                  {pinSaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <AppText style={styles.pinRecoverBtnText}>Verify & Continue</AppText>
                  }
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.pinModalClose} onPress={closePinModal} activeOpacity={0.7}>
                  <X color={colors.textMuted} size={20} />
                </TouchableOpacity>
                <View style={[styles.pinModalIcon, { backgroundColor: 'rgba(255,46,138,0.10)' }]}>
                  <KeyRound color="#FF2E8A" size={26} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.pinModalTitle, { color: colors.text }]}>
                  {pinStep === 'current' ? 'Enter Current PIN' : pinStep === 'new' ? 'Enter New PIN' : 'Confirm New PIN'}
                </AppText>
                <AppText style={[styles.pinModalSub, { color: colors.textSecondary }]}>
                  {pinStep === 'current' ? 'Enter your current 4-digit PIN to continue' : pinStep === 'new' ? 'Choose a new 4-digit PIN' : 'Re-enter your new PIN to confirm'}
                </AppText>
                <PinDots length={getPinValue().length} />
                {pinError ? <AppText style={[styles.pinError, { color: colors.danger }]}>{pinError}</AppText> : null}
                <Numpad onKey={handlePinKey} />
                {pinStep === 'current' && (
                  <TouchableOpacity onPress={handleForgotPin} activeOpacity={0.7} style={styles.forgotPinBtn}>
                    <AppText style={[styles.forgotPinText, { color: colors.textMuted }]}>Forgot PIN?</AppText>
                  </TouchableOpacity>
                )}
              </>
            )}

          </View>
        </View>
      </Modal>

      <BottomSheet
        visible={showVaultSecurityInfo}
        onClose={() => setShowVaultSecurityInfo(false)}
        title="Your Vault is Private"
        subtitle="Here is how your photos and videos are kept safe."
        scrollable
      >
        <View style={styles.secInfoContent}>
          {[
            {
              icon: <Lock color="#FF2E8A" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,46,138,0.10)',
              title: 'Private Storage',
              desc: 'Your media lives in a locked, private vault. There is no public link anyone can guess or stumble upon — files are completely hidden from the internet.',
            },
            {
              icon: <Clock color="#FF8A3D" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,138,61,0.10)',
              title: 'Links Expire in 1 Hour',
              desc: 'Every time a photo or video loads, the app generates a temporary access link. That link stops working after one hour — so even if intercepted, it quickly becomes useless.',
            },
            {
              icon: <Users color="#69A7FF" size={20} strokeWidth={1.8} />,
              bg: 'rgba(105,167,255,0.10)',
              title: 'Just the Two of You',
              desc: 'Server-level security rules ensure only you and your partner can ever access your vault. These rules live on our servers, not just the app, so they cannot be bypassed.',
            },
            {
              icon: <Smartphone color="#33D17A" size={20} strokeWidth={1.8} />,
              bg: 'rgba(51,209,122,0.10)',
              title: 'Never Saved to Your Device',
              desc: 'Photos and videos taken inside the app go straight to the vault. They are never written to your camera roll or stored anywhere on your phone.',
            },
            {
              icon: <ScanFace color="#FFB347" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,179,71,0.10)',
              title: 'Face ID & PIN Lock',
              desc: 'You can require biometric verification (Face ID or fingerprint) before the vault even opens. Turn this on in your Account settings for an extra layer of protection.',
            },
            {
              icon: <Shield color="#FF5A3D" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,90,61,0.10)',
              title: 'Screenshot Detection',
              desc: 'When screenshots are turned off for an item, the app detects if your partner takes one and sends you a notification immediately.',
            },
            {
              icon: <Sliders color="rgba(255,255,255,0.65)" size={20} strokeWidth={1.8} />,
              bg: 'rgba(255,255,255,0.06)',
              title: 'Your Rules, Your Control',
              desc: 'You decide whether each upload can be screenshotted, saved, or shared. Defaults are set in your Profile and apply to every new item you add.',
            },
          ].map(({ icon, bg, title, desc }) => (
            <View key={title} style={[styles.secInfoRow, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
              <View style={[styles.secInfoIcon, { backgroundColor: bg }]}>{icon}</View>
              <View style={styles.secInfoText}>
                <AppText style={[styles.secInfoTitle, { color: colors.text }]}>{title}</AppText>
                <AppText style={[styles.secInfoDesc, { color: colors.textSecondary }]}>{desc}</AppText>
              </View>
            </View>
          ))}
          <View style={[styles.secInfoFooter, { backgroundColor: 'rgba(255,46,138,0.06)', borderColor: 'rgba(255,46,138,0.18)' }]}>
            <Shield color="#FF2E8A" size={14} strokeWidth={2} />
            <AppText style={[styles.secInfoFooterText, { color: colors.textSecondary }]}>
              Your moments are safe. We built this app to protect your privacy at every step.
            </AppText>
          </View>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showDiscreetInfo}
        onClose={() => setShowDiscreetInfo(false)}
        title="Discreet Notifications"
        subtitle="Here's what a notification looks like with this setting on."
      >
        <View style={styles.previewWrap}>
          <View style={[styles.notifCard, { backgroundColor: colors.card, borderColor: colors.borderSubtle }]}>
            <View style={styles.notifAppRow}>
              <View style={styles.notifAppIconWrap}>
                <WarmupLogo size={20} />
              </View>
              <AppText style={[styles.notifAppName, { color: colors.textMuted }]}>WARM ME UP</AppText>
              <AppText style={[styles.notifTime, { color: colors.textMuted }]}>now</AppText>
            </View>
            <AppText style={[styles.notifTitle, { color: colors.text }]}>
              {s?.notification_copy ?? 'Something new is waiting'}
            </AppText>
            <AppText style={[styles.notifBody, { color: colors.textSecondary }]}>
              Tap to open
            </AppText>
          </View>
          <AppText style={[styles.previewNote, { color: colors.textMuted }]}>
            No message content or previews are ever shown — just a discreet nudge.
          </AppText>
        </View>
      </BottomSheet>

      <TermsModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal visible={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} />
      <CommunityGuidelinesModal
        visible={showCommunityGuidelines}
        onClose={() => setShowCommunityGuidelines(false)}
      />
      <LeavePartnerSheet
        visible={showLeaveSheet}
        onClose={() => setShowLeaveSheet(false)}
        partnerName={partnerProfile?.display_name ?? 'your partner'}
      />

      {/* Cancel pending invite confirmation sheet */}
      <BottomSheet visible={showCancelInviteSheet} onClose={() => { if (!cancellingInvite) setShowCancelInviteSheet(false); }}>
        <View style={styles.cancelInviteSheet}>
          <View style={styles.cancelInviteIconWrap}>
            <X color="#FF5A5F" size={24} strokeWidth={2} />
          </View>
          <AppText style={[styles.cancelInviteSheetTitle, { color: colors.text }]}>Cancel invite?</AppText>
          <AppText style={[styles.cancelInviteSheetBody, { color: colors.textSecondary }]}>
            Your partner won't be able to use this code. You can generate a new one any time.
          </AppText>
          <TouchableOpacity
            style={[styles.cancelInviteConfirmBtn, cancellingInvite && { opacity: 0.6 }]}
            onPress={handleCancelInvite}
            activeOpacity={0.8}
            disabled={cancellingInvite}
          >
            {cancellingInvite
              ? <ActivityIndicator color="#fff" size="small" />
              : <AppText style={styles.cancelInviteConfirmText}>Yes, cancel invite</AppText>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelInviteKeepBtn}
            onPress={() => setShowCancelInviteSheet(false)}
            activeOpacity={0.7}
            disabled={cancellingInvite}
          >
            <AppText style={[styles.cancelInviteKeepText, { color: colors.textSecondary }]}>Keep it</AppText>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* ── Delete Account Modal ───────────────────────────────────── */}
      <Modal
        visible={deleteAccountOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deletingAccount) { setDeleteAccountOpen(false); setDeleteAccountStep(1); } }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.dataModalCard, { backgroundColor: colors.card, borderColor: 'rgba(255,59,48,0.18)' }]}>
            {deleteAccountStep === 1 ? (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,59,48,0.10)' }]}>
                  <UserX color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Delete My Account?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This will permanently delete your account, profile, partner connection, messages, vault items, and all app data. This cannot be undone.
                </AppText>
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity
                    style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]}
                    onPress={() => { setDeleteAccountOpen(false); setDeleteAccountStep(1); }}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Cancel</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dataModalDeleteBtn}
                    onPress={() => { setDeleteAccountError(null); setDeleteAccountStep(2); }}
                    activeOpacity={0.8}
                  >
                    <AppText style={styles.dataModalDeleteBtnText}>Continue</AppText>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.dataModalIcon, { backgroundColor: 'rgba(255,59,48,0.15)' }]}>
                  <AlertTriangle color="#FF3B30" size={28} strokeWidth={1.5} />
                </View>
                <AppText style={[styles.dataModalTitle, { color: colors.text }]}>Are You Sure?</AppText>
                <AppText style={[styles.dataModalBody, { color: colors.textSecondary }]}>
                  This is permanent. Once deleted, your account, all messages, vault content, and connection with your partner cannot be recovered.
                </AppText>
                {deleteAccountError && (
                  <AppText style={[styles.inlineError, { color: colors.danger, textAlign: 'center' }]}>
                    {deleteAccountError}
                  </AppText>
                )}
                <View style={styles.dataModalBtns}>
                  <TouchableOpacity
                    style={[styles.dataModalCancelBtn, { borderColor: colors.borderSubtle }]}
                    onPress={() => setDeleteAccountStep(1)}
                    disabled={deletingAccount}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.dataModalCancelText, { color: colors.textSecondary }]}>Go Back</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dataModalDeleteBtn}
                    onPress={handleDeleteAccount}
                    disabled={deletingAccount}
                    activeOpacity={0.8}
                  >
                    {deletingAccount
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <AppText style={styles.dataModalDeleteBtnText}>Delete Forever</AppText>
                    }
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: Spacing.screen, paddingBottom: 40 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,46,138,0.10)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(255,46,138,0.25)',
  },
  adminBadgeText: { fontSize: 12, fontFamily: 'Inter-SemiBold', color: '#FF2E8A' },
  tabBar: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    borderWidth: 1,
    padding: 4,
    marginBottom: Spacing.lg,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabLabel: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-SemiBold',
  },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md,
  },
  avatarWrap: { position: 'relative' },
  cameraChip: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  name: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold' },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nameInput: {
    flex: 1, fontSize: FontSize.body, fontFamily: 'Inter-Medium',
    borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, height: 32,
  },
  nameActionBtn: { padding: 4 },
  emailText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 2 },
  statsWrap: { marginBottom: Spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md,
  },
  heartWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  partnerName: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold', marginTop: 2 },
  inviteCard: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md, gap: Spacing.md },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  inviteHint: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', marginTop: 2 },
  codeBox: { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, alignItems: 'center', position: 'relative' },
  codeRefreshBtn: { position: 'absolute', right: Spacing.md, top: '50%', marginTop: -10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 22, fontFamily: 'Inter-Bold', letterSpacing: 6 },
  inviteActions: { flexDirection: 'row', gap: Spacing.sm },
  inviteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 11,
  },
  inviteBtnText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  // Connected state card
  connectedCard: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card, marginBottom: Spacing.md,
    gap: 10,
  },
  connectedTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  connectedAvatarWrap: { position: 'relative' },
  connectedDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6, borderWidth: 2,
  },
  connectedInfo: { flex: 1, gap: 2 },
  connectedLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  connectedLabel: { fontSize: 10, fontFamily: 'Inter-SemiBold', letterSpacing: 1 },
  connectedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.pill, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  connectedPillDot: { width: 5, height: 5, borderRadius: 3 },
  connectedPillText: { fontSize: 10, fontFamily: 'Inter-SemiBold' },
  connectedName: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  connectedHeart: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 1 },
  manageConnectionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  manageConnectionText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular' },
  menuCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.md },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.card, borderBottomWidth: 1 },
  menuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, fontSize: FontSize.body, fontFamily: 'Inter-Medium' },
  section: { marginBottom: Spacing.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 1.2 },
  sectionCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  ownerNote: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1 },
  ownerNoteText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 17, fontStyle: 'italic' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 15,
  },
  rowLeft: { flex: 1, gap: 2, marginRight: Spacing.md },
  rowLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowLabel: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium' },
  rowSub: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 16 },
  secInfoContent: { paddingBottom: Spacing.lg, gap: Spacing.sm },
  secInfoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md,
  },
  secInfoIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  secInfoText: { flex: 1, gap: 4 },
  secInfoTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', lineHeight: 18 },
  secInfoDesc: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 19 },
  secInfoFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md, marginTop: Spacing.xs },
  secInfoFooterText: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', lineHeight: 18, fontStyle: 'italic' },
  previewWrap: { paddingHorizontal: 4, paddingBottom: 8 },
  notifCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  notifAppRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  notifAppIconWrap: { width: 20, height: 20, borderRadius: 5, overflow: 'hidden' },
  notifAppName: { flex: 1, fontSize: 11, fontFamily: 'Inter-SemiBold', letterSpacing: 0.5 },
  notifTime: { fontSize: 11, fontFamily: 'Inter-Regular' },
  notifTitle: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold', marginBottom: 2 },
  notifBody: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular' },
  previewNote: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 18, textAlign: 'center' },
  inlineForm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  inlineFieldRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12,
  },
  inlineFieldLabel: { fontSize: FontSize.xs, fontFamily: 'Inter-Medium', width: 114 },
  inlineFieldInput: { flex: 1, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'right' },
  inlineError: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', marginTop: 4, marginBottom: 2 },
  inlineNote: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', lineHeight: 17, marginTop: 8, marginBottom: 8 },
  inlineSubmitBtn: { borderRadius: Radius.pill, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 44 },
  inlineSubmitText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  inlineSuccess: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  inlineSuccessText: { fontSize: FontSize.sm, fontFamily: 'Inter-Medium', flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  pinModalCard: {
    borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', width: '100%', maxWidth: 360,
    gap: Spacing.sm, borderWidth: 1, borderColor: 'rgba(255,46,138,0.18)',
  },
  pinModalClose: { position: 'absolute', top: Spacing.md, right: Spacing.md, padding: 6 },
  pinModalIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  pinModalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', textAlign: 'center' },
  pinModalSub: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 20 },
  pinDots: { flexDirection: 'row', gap: Spacing.md, marginVertical: Spacing.sm },
  pinDot: { width: 14, height: 14, borderRadius: 7 },
  pinError: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textAlign: 'center' },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: Spacing.sm, marginTop: 4 },
  numKey: {
    width: 82, height: 66, borderRadius: Radius.lg,
    backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  numKeyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  numKeyText: { color: '#fff', fontSize: FontSize.xxl, fontFamily: 'Inter-Medium' },
  numKeyDelete: { fontSize: FontSize.xl },
  forgotPinBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  forgotPinText: { fontSize: FontSize.xs, fontFamily: 'Inter-Regular', textDecorationLine: 'underline' },
  pinRecoverField: { width: '100%', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 4, marginTop: 4 },
  pinRecoverInput: { fontSize: FontSize.body, fontFamily: 'Inter-Regular', paddingVertical: 12 },
  pinRecoverBtn: { width: '100%', borderRadius: Radius.pill, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 48 },
  pinRecoverBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataModalCard: { borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md, width: '100%', maxWidth: 360, borderWidth: 1 },
  dataModalIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dataModalTitle: { fontSize: FontSize.lg, fontFamily: 'Inter-Bold', textAlign: 'center' },
  dataModalBody: { fontSize: FontSize.sm, fontFamily: 'Inter-Regular', textAlign: 'center', lineHeight: 21 },
  dataModalBtns: { flexDirection: 'row', gap: Spacing.sm, width: '100%', marginTop: 4 },
  dataModalCancelBtn: { flex: 1, borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 13, alignItems: 'center' },
  dataModalCancelText: { fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataModalDeleteBtn: { flex: 1, borderRadius: Radius.pill, backgroundColor: '#FF3B30', paddingVertical: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  dataModalDeleteBtnText: { color: '#fff', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataModalResetBtn: { flex: 1, borderRadius: Radius.pill, backgroundColor: '#FFB347', paddingVertical: 13, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  dataModalResetBtnText: { color: '#1a1a1a', fontSize: FontSize.sm, fontFamily: 'Inter-SemiBold' },
  dataOptionBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.card },
  dataOptionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dataOptionText: { flex: 1, gap: 3 },
  dataOptionTitle: { fontSize: FontSize.body, fontFamily: 'Inter-SemiBold' },
  dataOptionSub: { fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 17 },
  reportInput: { width: '100%', borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, fontSize: FontSize.sm, fontFamily: 'Inter-Regular', minHeight: 100, lineHeight: 20 },
  footerLogoWrap: { alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.xl, opacity: 0.7 },
  footerLogo: { width: 320, height: 160 },
  cancelInviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    alignSelf: 'center',
  },
  cancelInviteText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,90,90,0.70)',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255,90,90,0.40)',
  },
  codeExpiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,90,90,0.10)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,90,90,0.25)',
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    marginBottom: 4,
  },
  codeExpiredText: {
    fontSize: FontSize.xs,
    fontFamily: 'Inter-SemiBold',
    color: '#FF5A5F',
  },
  cancelInviteSheet: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  cancelInviteIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,90,90,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cancelInviteSheetTitle: {
    fontSize: FontSize.xl,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  cancelInviteSheetBody: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: Spacing.sm,
  },
  cancelInviteConfirmBtn: {
    width: '100%',
    borderRadius: Radius.pill,
    backgroundColor: '#FF5A5F',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 4,
  },
  cancelInviteConfirmText: {
    color: '#fff',
    fontSize: FontSize.body,
    fontFamily: 'Inter-SemiBold',
  },
  cancelInviteKeepBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelInviteKeepText: {
    fontSize: FontSize.sm,
    fontFamily: 'Inter-Regular',
  },
});
